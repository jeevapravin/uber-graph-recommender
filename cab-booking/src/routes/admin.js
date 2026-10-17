// Admin: users, drivers, vehicles, bookings, fares, areas, promos, tickets, reports and (limited) logs.
// Each admin route needs a permission; the Super Admin passes every check (see auth.authorize).
const { route, v, HttpError, toCsv } = require('../http');
const { q, one, tx } = require('../db');
const { log, requirePerm, getSettings } = require('../auth');
const { BOOKING_SELECT, withStage, STAGE_SQL, startTrip, completeTrip, cancelBooking } = require('../bookings');
const ai = require('../ai');

const A = (perm) => ({ roles: ['ADMIN'], perm });
const VEHICLE_TYPES = ['BIKE', 'AUTO', 'MINI', 'SEDAN', 'SUV'];
const like = (s) => `%${String(s || '').trim()}%`;

// date range from ?from=&to= (inclusive), defaulting to the last 30 days
function range(query) {
  const to = v.date(query.to, 'to', true) || new Date().toISOString().slice(0, 10);
  const from = v.date(query.from, 'from', true) || new Date(Date.now() - 29 * 864e5).toISOString().slice(0, 10);
  if (from > to) throw new HttpError(400, '"from" must be before "to"');
  return { from, to };
}

route('GET', '/api/admin/summary', async (ctx) => {
  const counts = await one(
    `SELECT (SELECT COUNT(*) FROM users WHERE role = 'PASSENGER') AS passengers,
            (SELECT COUNT(*) FROM users WHERE role = 'DRIVER') AS drivers,
            (SELECT COUNT(*) FROM driver_profiles WHERE verification_status = 'PENDING') AS pending_drivers,
            (SELECT COUNT(*) FROM driver_profiles WHERE availability = 'ONLINE') AS online_drivers,
            (SELECT COUNT(*) FROM ride_requests WHERE status = 'REQUESTED') AS searching,
            (SELECT COUNT(*) FROM trips WHERE trip_status IN ('ACCEPTED','STARTED')) AS active_trips,
            (SELECT COUNT(*) FROM ride_requests WHERE DATE(requested_at) = CURDATE()) AS today_bookings,
            (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE payment_status = 'PAID' AND DATE(paid_at) = CURDATE()) AS today_revenue,
            (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE payment_status = 'PAID') AS total_revenue,
            (SELECT COUNT(*) FROM support_tickets WHERE status = 'OPEN') AS open_tickets,
            (SELECT COUNT(*) FROM vehicles) AS vehicles`,
  );
  const canLogs = ctx.user.permissions.includes('VIEW_LOGS');
  const sos = canLogs ? await q("SELECT l.*, u.name FROM system_logs l LEFT JOIN users u ON u.user_id = l.user_id WHERE action = 'SOS' AND l.created_at >= NOW() - INTERVAL 1 DAY ORDER BY log_id DESC LIMIT 5") : [];
  const activity = canLogs ? await q('SELECT l.action, l.description, l.created_at, u.name FROM system_logs l LEFT JOIN users u ON u.user_id = l.user_id ORDER BY log_id DESC LIMIT 8') : [];
  return { counts, sos, activity, permissions: ctx.user.permissions };
}, A());

// ---- passengers & drivers ----
route('GET', '/api/admin/passengers', async (ctx) =>
  q(
    `SELECT u.user_id, u.name, u.email, u.mobile, u.status, u.created_at, pp.default_address,
            (SELECT COUNT(*) FROM ride_requests r WHERE r.passenger_id = pp.passenger_id) AS bookings,
            (SELECT COALESCE(SUM(amount), 0) FROM payments p WHERE p.passenger_id = pp.passenger_id AND p.payment_status = 'PAID') AS spent
     FROM users u JOIN passenger_profiles pp ON pp.user_id = u.user_id
     WHERE u.name LIKE ? OR u.email LIKE ? OR u.mobile LIKE ? ORDER BY u.user_id DESC`,
    [like(ctx.query.q), like(ctx.query.q), like(ctx.query.q)],
  ), A('MANAGE_PASSENGERS'));

route('GET', '/api/admin/drivers', async (ctx) => {
  const status = ctx.query.verification ? v.oneOf(ctx.query.verification, 'verification', ['PENDING', 'APPROVED', 'REJECTED']) : null;
  return q(
    `SELECT u.user_id, u.name, u.email, u.mobile, u.status, u.created_at,
            d.driver_id, d.license_no, d.license_expiry, d.verification_status, d.rating, d.availability,
            (SELECT COUNT(*) FROM vehicles x WHERE x.driver_id = d.driver_id) AS vehicles,
            (SELECT COUNT(*) FROM trips t WHERE t.driver_id = d.driver_id AND t.trip_status = 'COMPLETED') AS trips
     FROM users u JOIN driver_profiles d ON d.user_id = u.user_id
     WHERE (u.name LIKE ? OR u.email LIKE ? OR d.license_no LIKE ?) AND (? IS NULL OR d.verification_status = ?)
     ORDER BY d.verification_status = 'PENDING' DESC, u.user_id DESC`,
    [like(ctx.query.q), like(ctx.query.q), like(ctx.query.q), status, status],
  );
}, A('MANAGE_DRIVERS'));

async function targetUser(ctx) {
  const u = await one('SELECT user_id, name, email, mobile, role, status, created_at FROM users WHERE user_id = ?', [ctx.params.id]);
  if (!u || !['PASSENGER', 'DRIVER'].includes(u.role)) throw new HttpError(404, 'Passenger or driver not found');
  requirePerm(ctx.user, u.role === 'PASSENGER' ? 'MANAGE_PASSENGERS' : 'MANAGE_DRIVERS');
  return u;
}

route('GET', '/api/admin/users/:id', async (ctx) => {
  const u = await targetUser(ctx);
  const isP = u.role === 'PASSENGER';
  const profile = await one(isP ? 'SELECT * FROM passenger_profiles WHERE user_id = ?' : 'SELECT * FROM driver_profiles WHERE user_id = ?', [u.user_id]);
  const vehicles = isP ? [] : await q('SELECT * FROM vehicles WHERE driver_id = ?', [profile.driver_id]);
  const bookings = withStage(await q(`${BOOKING_SELECT} WHERE ${isP ? 'pu' : 'du'}.user_id = ? ORDER BY r.request_id DESC LIMIT 20`, [u.user_id]));
  return { user: u, profile, vehicles, bookings };
}, A());

route('PUT', '/api/admin/users/:id/status', async (ctx) => {
  const u = await targetUser(ctx);
  const status = v.oneOf(ctx.body.status, 'status', ['ACTIVE', 'BLOCKED']);
  await q('UPDATE users SET status = ? WHERE user_id = ?', [status, u.user_id]);
  if (status === 'BLOCKED') await q("UPDATE driver_profiles SET availability = 'OFFLINE' WHERE user_id = ?", [u.user_id]);
  await log(ctx, status === 'BLOCKED' ? 'BLOCK_USER' : 'UNBLOCK_USER', `${u.role} ${u.email} → ${status}`);
  return { message: `${u.name} is now ${status}` };
}, A());

route('PUT', '/api/admin/drivers/:id/verification', async (ctx) => {
  const status = v.oneOf(ctx.body.verification_status, 'verification_status', ['APPROVED', 'REJECTED', 'PENDING']);
  const r = await q(`UPDATE driver_profiles SET verification_status = ?, availability = IF(? = 'APPROVED', availability, 'OFFLINE') WHERE driver_id = ?`, [status, status, ctx.params.id]);
  if (!r.affectedRows) throw new HttpError(404, 'Driver not found');
  await log(ctx, 'DRIVER_VERIFY', `Driver #${ctx.params.id} → ${status}`);
  return { message: `Driver ${status.toLowerCase()}` };
}, A('MANAGE_DRIVERS'));

// ---- vehicles ----
route('GET', '/api/admin/vehicles', async (ctx) =>
  q(
    `SELECT x.*, u.name AS driver_name, u.user_id AS driver_user_id
     FROM vehicles x JOIN driver_profiles d ON d.driver_id = x.driver_id JOIN users u ON u.user_id = d.user_id
     WHERE x.vehicle_number LIKE ? OR x.model LIKE ? OR u.name LIKE ? ORDER BY x.vehicle_id DESC`,
    [like(ctx.query.q), like(ctx.query.q), like(ctx.query.q)],
  ), A('MANAGE_VEHICLES'));

route('PUT', '/api/admin/vehicles/:id', async (ctx) => {
  const b = ctx.body;
  const r = await q('UPDATE vehicles SET vehicle_type = ?, model = ?, capacity = ?, status = ? WHERE vehicle_id = ?', [
    v.oneOf(b.vehicle_type, 'vehicle_type', VEHICLE_TYPES),
    v.str(b.model, 'model', { min: 2, max: 60 }),
    v.num(b.capacity, 'capacity', { int: true, min: 1, max: 8 }),
    v.oneOf(b.status, 'status', ['ACTIVE', 'INACTIVE']),
    ctx.params.id,
  ]);
  if (!r.affectedRows) throw new HttpError(404, 'Vehicle not found');
  await log(ctx, 'VEHICLE_EDIT', `Admin updated vehicle #${ctx.params.id} (${b.status})`);
  return { message: 'Vehicle saved' };
}, A('MANAGE_VEHICLES'));

route('DELETE', '/api/admin/vehicles/:id', async (ctx) => {
  if (await one('SELECT 1 FROM trips WHERE vehicle_id = ?', [ctx.params.id])) throw new HttpError(409, 'This vehicle has trips on record; set it inactive instead');
  const r = await q('DELETE FROM vehicles WHERE vehicle_id = ?', [ctx.params.id]);
  if (!r.affectedRows) throw new HttpError(404, 'Vehicle not found');
  await log(ctx, 'VEHICLE_DELETE', `Admin deleted vehicle #${ctx.params.id}`);
  return { message: 'Vehicle deleted' };
}, A('MANAGE_VEHICLES'));

// ---- bookings / trips ----
function bookingFilter(query) {
  const { from, to } = range(query);
  const where = ['DATE(r.requested_at) BETWEEN ? AND ?'];
  const params = [from, to];
  if (query.stage) where.push(STAGE_SQL[v.oneOf(query.stage, 'stage', Object.keys(STAGE_SQL))]);
  if (query.q) {
    where.push('(pu.name LIKE ? OR du.name LIKE ? OR r.pickup_location LIKE ? OR r.destination LIKE ?)');
    params.push(like(query.q), like(query.q), like(query.q), like(query.q));
  }
  return { sql: `${BOOKING_SELECT} WHERE ${where.join(' AND ')} ORDER BY r.request_id DESC`, params, from, to };
}

route('GET', '/api/admin/bookings', async (ctx) => {
  const f = bookingFilter(ctx.query);
  return withStage(await q(`${f.sql} LIMIT 300`, f.params));
}, A('MANAGE_TRIPS'));

route('GET', '/api/admin/bookings/export', async (ctx) => {
  requirePerm(ctx.user, 'VIEW_REPORTS');
  const f = bookingFilter(ctx.query);
  const rows = withStage(await q(f.sql, f.params)).map((r) => ({
    booking: r.request_id, requested_at: r.requested_at, stage: r.stage, passenger: r.passenger_name, driver: r.driver_name,
    vehicle: r.vehicle_type, pickup: r.pickup_location, destination: r.destination, km: r.distance_km,
    estimated_fare: r.estimated_fare, fare: r.fare, payment: r.payment_status, method: r.payment_method, rating: r.review_rating,
  }));
  return { csv: toCsv(rows), filename: `bookings_${f.from}_${f.to}.csv` };
}, A());

const tripOf = async (requestId, conn) => {
  const t = await one('SELECT trip_id FROM trips WHERE request_id = ? FOR UPDATE', [requestId], conn);
  if (!t) throw new HttpError(409, 'No driver has accepted this booking yet');
  return t.trip_id;
};

route('POST', '/api/admin/bookings/:id/start', async (ctx) => {
  await tx(async (c) => startTrip(c, await tripOf(ctx.params.id, c)));
  await log(ctx, 'ADMIN_START_TRIP', `Admin started booking #${ctx.params.id}`);
  return { message: 'Trip started' };
}, A('MANAGE_TRIPS'));

route('POST', '/api/admin/bookings/:id/complete', async (ctx) => {
  const done = await tx(async (c) => completeTrip(c, await tripOf(ctx.params.id, c)));
  await log(ctx, 'ADMIN_COMPLETE_TRIP', `Admin completed booking #${ctx.params.id}, fare ₹${done.fare}`);
  return { message: `Trip completed, fare ₹${done.fare}` };
}, A('MANAGE_TRIPS'));

// admin cancellation resolves a problem, so no fee is charged and a started trip may be closed too
route('POST', '/api/admin/bookings/:id/cancel', async (ctx) => {
  await tx((c) => cancelBooking(c, ctx.params.id, { fee: 0, allowStarted: true }));
  await log(ctx, 'ADMIN_CANCEL', `Admin cancelled booking #${ctx.params.id}`);
  return { message: 'Booking cancelled' };
}, A('MANAGE_TRIPS'));

route('POST', '/api/admin/bookings/:id/refund', async (ctx) => {
  const r = await q(
    "UPDATE payments p JOIN trips t ON t.trip_id = p.trip_id SET p.payment_status = 'REFUNDED' WHERE t.request_id = ? AND p.payment_status = 'PAID'",
    [ctx.params.id],
  );
  if (!r.affectedRows) throw new HttpError(409, 'There is no paid payment to refund');
  await log(ctx, 'REFUND', `Refunded booking #${ctx.params.id}`);
  return { message: 'Payment refunded' };
}, A('MANAGE_TRIPS'));

// ---- support tickets ----
route('GET', '/api/admin/tickets', async (ctx) => {
  const status = ctx.query.status ? v.oneOf(ctx.query.status, 'status', ['OPEN', 'RESOLVED']) : null;
  return q(
    `SELECT s.*, u.name AS user_name, u.role AS user_role, r.pickup_location, r.destination, a.name AS resolved_by_name
     FROM support_tickets s JOIN users u ON u.user_id = s.user_id
     LEFT JOIN ride_requests r ON r.request_id = s.request_id LEFT JOIN users a ON a.user_id = s.resolved_by
     WHERE ? IS NULL OR s.status = ? ORDER BY s.status = 'OPEN' DESC, s.ticket_id DESC LIMIT 200`,
    [status, status],
  );
}, A('MANAGE_TRIPS'));

route('PUT', '/api/admin/tickets/:id', async (ctx) => {
  const reply = v.str(ctx.body.admin_reply, 'admin_reply', { min: 2, max: 1000 });
  const ticket = await one("SELECT * FROM support_tickets WHERE ticket_id = ? AND status = 'OPEN'", [ctx.params.id]);
  if (!ticket) throw new HttpError(404, 'Open ticket not found');
  await tx(async (c) => {
    if (ctx.body.refund && ticket.request_id) {
      await q("UPDATE payments p JOIN trips t ON t.trip_id = p.trip_id SET p.payment_status = 'REFUNDED' WHERE t.request_id = ? AND p.payment_status = 'PAID'", [ticket.request_id], c);
    }
    await q("UPDATE support_tickets SET status = 'RESOLVED', admin_reply = ?, resolved_by = ?, resolved_at = NOW() WHERE ticket_id = ?", [reply, ctx.user.user_id, ticket.ticket_id], c);
  });
  await log(ctx, 'TICKET_RESOLVE', `Ticket #${ticket.ticket_id} resolved${ctx.body.refund ? ' with refund' : ''}`);
  return { message: 'Ticket resolved' };
}, A('MANAGE_TRIPS'));

route('POST', '/api/admin/tickets/:id/suggest', async (ctx) => {
  const t = await one('SELECT s.*, u.role AS user_role FROM support_tickets s JOIN users u ON u.user_id = s.user_id WHERE s.ticket_id = ?', [ctx.params.id]);
  if (!t) throw new HttpError(404, 'Ticket not found');
  const [booking] = t.request_id ? withStage(await q(`${BOOKING_SELECT} WHERE r.request_id = ?`, [t.request_id])) : [];
  const draft = await ai.suggestReply(t, booking);
  await log(ctx, 'AI_SUGGEST', `AI draft for ticket #${t.ticket_id}`);
  return draft;
}, A('MANAGE_TRIPS'));

// ---- fare rules, service areas, promo codes ----
function fareBody(b) {
  const n = (k) => v.num(b[k], k, { min: 0, max: 10000 });
  return [n('base_fare'), n('per_km_rate'), n('per_minute_rate'), n('cancellation_fee'), v.oneOf(b.status || 'ACTIVE', 'status', ['ACTIVE', 'INACTIVE'])];
}

route('GET', '/api/admin/fares', async () => q('SELECT * FROM fare_rules ORDER BY base_fare'), A('MANAGE_FARES'));

route('POST', '/api/admin/fares', async (ctx) => {
  const type = v.oneOf(ctx.body.vehicle_type, 'vehicle_type', VEHICLE_TYPES);
  const r = await q('INSERT INTO fare_rules (vehicle_type, base_fare, per_km_rate, per_minute_rate, cancellation_fee, status) VALUES (?, ?, ?, ?, ?, ?)', [type, ...fareBody(ctx.body)]);
  await log(ctx, 'FARE_ADD', `Fare rule for ${type}`);
  return { created: true, fare_id: r.insertId };
}, A('MANAGE_FARES'));

route('PUT', '/api/admin/fares/:id', async (ctx) => {
  const r = await q('UPDATE fare_rules SET base_fare = ?, per_km_rate = ?, per_minute_rate = ?, cancellation_fee = ?, status = ? WHERE fare_id = ?', [...fareBody(ctx.body), ctx.params.id]);
  if (!r.affectedRows) throw new HttpError(404, 'Fare rule not found');
  await log(ctx, 'FARE_EDIT', `Fare rule #${ctx.params.id} updated`);
  return { message: 'Fare rule saved' };
}, A('MANAGE_FARES'));

function areaBody(b) {
  return [
    v.str(b.area_name, 'area_name', { min: 2, max: 80 }),
    v.str(b.city, 'city', { min: 2, max: 60 }),
    v.str(b.state, 'state', { min: 2, max: 60 }),
    v.num(b.latitude, 'latitude', { min: -90, max: 90 }),
    v.num(b.longitude, 'longitude', { min: -180, max: 180 }),
    v.oneOf(b.status || 'ACTIVE', 'status', ['ACTIVE', 'INACTIVE']),
  ];
}

route('GET', '/api/admin/areas', async () => q('SELECT * FROM service_areas ORDER BY city, area_name'), A('MANAGE_FARES'));

route('POST', '/api/admin/areas', async (ctx) => {
  const r = await q('INSERT INTO service_areas (area_name, city, state, latitude, longitude, status) VALUES (?, ?, ?, ?, ?, ?)', areaBody(ctx.body));
  await log(ctx, 'AREA_ADD', `Service area ${ctx.body.area_name}`);
  return { created: true, area_id: r.insertId };
}, A('MANAGE_FARES'));

route('PUT', '/api/admin/areas/:id', async (ctx) => {
  const r = await q('UPDATE service_areas SET area_name = ?, city = ?, state = ?, latitude = ?, longitude = ?, status = ? WHERE area_id = ?', [...areaBody(ctx.body), ctx.params.id]);
  if (!r.affectedRows) throw new HttpError(404, 'Area not found');
  await log(ctx, 'AREA_EDIT', `Service area #${ctx.params.id} updated`);
  return { message: 'Area saved' };
}, A('MANAGE_FARES'));

function promoBody(b) {
  const code = v.str(b.code, 'code', { min: 3, max: 20 }).toUpperCase();
  if (!/^[A-Z0-9]+$/.test(code)) throw new HttpError(400, 'code must be letters and digits only');
  return [
    code,
    v.num(b.discount_pct, 'discount_pct', { int: true, min: 1, max: 90 }),
    v.num(b.max_discount, 'max_discount', { min: 1, max: 10000 }),
    v.date(b.valid_until, 'valid_until'),
    v.num(b.usage_limit, 'usage_limit', { int: true, min: 1, max: 1e6 }),
    v.oneOf(b.status || 'ACTIVE', 'status', ['ACTIVE', 'INACTIVE']),
  ];
}

route('GET', '/api/admin/promos', async () => q('SELECT * FROM promo_codes ORDER BY promo_id DESC'), A('MANAGE_FARES'));

route('POST', '/api/admin/promos', async (ctx) => {
  const r = await q('INSERT INTO promo_codes (code, discount_pct, max_discount, valid_until, usage_limit, status) VALUES (?, ?, ?, ?, ?, ?)', promoBody(ctx.body));
  await log(ctx, 'PROMO_ADD', `Promo ${String(ctx.body.code).toUpperCase()}`);
  return { created: true, promo_id: r.insertId };
}, A('MANAGE_FARES'));

route('PUT', '/api/admin/promos/:id', async (ctx) => {
  const r = await q('UPDATE promo_codes SET code = ?, discount_pct = ?, max_discount = ?, valid_until = ?, usage_limit = ?, status = ? WHERE promo_id = ?', [...promoBody(ctx.body), ctx.params.id]);
  if (!r.affectedRows) throw new HttpError(404, 'Promo not found');
  await log(ctx, 'PROMO_EDIT', `Promo #${ctx.params.id} updated`);
  return { message: 'Promo saved' };
}, A('MANAGE_FARES'));

// ---- reports ----
route('GET', '/api/admin/reports', async (ctx) => {
  const { from, to } = range(ctx.query);
  const p = [from, to];
  const inRange = 'DATE(r.requested_at) BETWEEN ? AND ?';
  const [totals, byDay, byType, topDrivers, topPassengers, users] = await Promise.all([
    one(
      `SELECT COUNT(*) AS bookings, SUM(r.status = 'COMPLETED') AS completed, SUM(r.status = 'CANCELLED') AS cancelled,
              SUM(r.status IN ('REQUESTED','ACCEPTED')) AS open,
              COALESCE(SUM(CASE WHEN r.status = 'COMPLETED' THEN t.fare END), 0) AS fares,
              COALESCE(AVG(CASE WHEN r.status = 'COMPLETED' THEN t.fare END), 0) AS avg_fare,
              COALESCE(SUM(CASE WHEN r.status = 'COMPLETED' THEN t.distance_km END), 0) AS km,
              COALESCE(SUM(CASE WHEN pay.payment_status = 'PAID' THEN pay.amount END), 0) AS collected,
              COALESCE(SUM(CASE WHEN pay.payment_status = 'REFUNDED' THEN pay.amount END), 0) AS refunded,
              COALESCE(SUM(CASE WHEN pay.payment_status = 'PENDING' THEN pay.amount END), 0) AS outstanding
       FROM ride_requests r LEFT JOIN trips t ON t.request_id = r.request_id LEFT JOIN payments pay ON pay.trip_id = t.trip_id
       WHERE ${inRange}`,
      p,
    ),
    q(
      `SELECT DATE(r.requested_at) AS day, COUNT(*) AS bookings, SUM(r.status = 'COMPLETED') AS completed,
              SUM(r.status = 'CANCELLED') AS cancelled, COALESCE(SUM(CASE WHEN r.status = 'COMPLETED' THEN t.fare END), 0) AS revenue
       FROM ride_requests r LEFT JOIN trips t ON t.request_id = r.request_id WHERE ${inRange} GROUP BY day ORDER BY day`,
      p,
    ),
    q(
      `SELECT r.vehicle_type, COUNT(*) AS bookings, SUM(r.status = 'COMPLETED') AS completed,
              COALESCE(SUM(CASE WHEN r.status = 'COMPLETED' THEN t.fare END), 0) AS revenue
       FROM ride_requests r LEFT JOIN trips t ON t.request_id = r.request_id WHERE ${inRange} GROUP BY r.vehicle_type ORDER BY revenue DESC`,
      p,
    ),
    q(
      `SELECT u.name, d.rating, COUNT(*) AS trips, SUM(t.fare) AS revenue, SUM(t.distance_km) AS km
       FROM trips t JOIN ride_requests r ON r.request_id = t.request_id JOIN driver_profiles d ON d.driver_id = t.driver_id JOIN users u ON u.user_id = d.user_id
       WHERE t.trip_status = 'COMPLETED' AND ${inRange} GROUP BY d.driver_id ORDER BY revenue DESC LIMIT 10`,
      p,
    ),
    q(
      `SELECT u.name, COUNT(*) AS trips, SUM(t.fare) AS spent
       FROM trips t JOIN ride_requests r ON r.request_id = t.request_id JOIN passenger_profiles pp ON pp.passenger_id = t.passenger_id JOIN users u ON u.user_id = pp.user_id
       WHERE t.trip_status = 'COMPLETED' AND ${inRange} GROUP BY pp.passenger_id ORDER BY spent DESC LIMIT 10`,
      p,
    ),
    q('SELECT role, COUNT(*) AS total, SUM(DATE(created_at) BETWEEN ? AND ?) AS new_in_range FROM users GROUP BY role', p),
  ]);
  return { from, to, totals, byDay, byType, topDrivers, topPassengers, users };
}, A('VIEW_REPORTS'));

// ---- logs and settings (limited for admins: last 7 days, no Super Admin actions, read-only settings) ----
async function logs(query, limited) {
  const where = [];
  const params = [];
  if (limited) where.push("l.created_at >= NOW() - INTERVAL 7 DAY AND (u.role IS NULL OR u.role <> 'SUPER_ADMIN')");
  if (query.action) (where.push('l.action = ?'), params.push(String(query.action).toUpperCase()));
  if (query.role) (where.push('u.role = ?'), params.push(v.oneOf(query.role, 'role', ['PASSENGER', 'DRIVER', 'ADMIN', 'SUPER_ADMIN'])));
  if (query.q) (where.push('(l.description LIKE ? OR u.name LIKE ? OR u.email LIKE ? OR l.ip_address LIKE ?)'), params.push(like(query.q), like(query.q), like(query.q), like(query.q)));
  if (!limited && (query.from || query.to)) {
    const r = range(query);
    where.push('DATE(l.created_at) BETWEEN ? AND ?');
    params.push(r.from, r.to);
  }
  return q(
    `SELECT l.log_id, l.action, l.description, l.ip_address, l.created_at, u.name, u.email, u.role
     FROM system_logs l LEFT JOIN users u ON u.user_id = l.user_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY l.log_id DESC LIMIT ${limited ? 200 : 1000}`,
    params,
  );
}

route('GET', '/api/admin/logs', async (ctx) => logs(ctx.query, true), A('VIEW_LOGS'));
route('GET', '/api/admin/log-actions', async () => (await q('SELECT DISTINCT action FROM system_logs ORDER BY action')).map((r) => r.action), A('VIEW_LOGS'));

route('GET', '/api/admin/settings', async () => q('SELECT * FROM system_settings ORDER BY setting_key'), A());

module.exports = { logs, getSettings };
