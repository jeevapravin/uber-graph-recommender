// Driver: availability, ride requests, trips, earnings, reviews and own vehicles.
const { route, v, HttpError } = require('../http');
const { q, one, tx } = require('../db');
const { log, getSettings } = require('../auth');
const { BOOKING_SELECT, withStage, startTrip, completeTrip } = require('../bookings');

const D = { roles: ['DRIVER'] };
const VEHICLE_TYPES = ['BIKE', 'AUTO', 'MINI', 'SEDAN', 'SUV'];

async function driverOf(user, conn) {
  const d = await one('SELECT * FROM driver_profiles WHERE user_id = ?', [user.user_id], conn);
  if (!d) throw new HttpError(404, 'Driver profile missing');
  return d;
}

const activeTrip = (driverId, conn) =>
  one("SELECT trip_id FROM trips WHERE driver_id = ? AND trip_status IN ('ACCEPTED','STARTED') LIMIT 1", [driverId], conn);

route('GET', '/api/driver/summary', async (ctx) => {
  const d = await driverOf(ctx.user);
  const s = await getSettings();
  const keep = 1 - Number(s.platform_commission_pct || 0) / 100;
  const e = await one(
    `SELECT COUNT(*) AS trips, COALESCE(SUM(fare), 0) AS gross,
            SUM(DATE(end_time) = CURDATE()) AS today_trips,
            COALESCE(SUM(CASE WHEN DATE(end_time) = CURDATE() THEN fare END), 0) AS today_gross
     FROM trips WHERE driver_id = ? AND trip_status = 'COMPLETED'`,
    [d.driver_id],
  );
  const vehicles = await one("SELECT COUNT(*) AS n FROM vehicles WHERE driver_id = ? AND status = 'ACTIVE'", [d.driver_id]);
  return {
    driver: { verification_status: d.verification_status, availability: d.availability, rating: d.rating },
    active_vehicles: vehicles.n,
    has_active_trip: !!(await activeTrip(d.driver_id)),
    trips: e.trips,
    today_trips: e.today_trips || 0,
    earnings: Math.round(e.gross * keep),
    today_earnings: Math.round(e.today_gross * keep),
    commission_pct: Number(s.platform_commission_pct || 0),
  };
}, D);

route('PUT', '/api/driver/availability', async (ctx) => {
  const want = v.oneOf(ctx.body.availability, 'availability', ['ONLINE', 'OFFLINE']);
  const d = await driverOf(ctx.user);
  if (want === 'ONLINE') {
    if (d.verification_status !== 'APPROVED') throw new HttpError(403, 'An admin must approve your profile before you can go online');
    if (new Date(d.license_expiry) <= new Date()) throw new HttpError(403, 'Your driving licence has expired; update your profile');
    const veh = await one("SELECT 1 FROM vehicles WHERE driver_id = ? AND status = 'ACTIVE'", [d.driver_id]);
    if (!veh) throw new HttpError(400, 'Add an active vehicle before going online');
  }
  await q('UPDATE driver_profiles SET availability = ? WHERE driver_id = ?', [want, d.driver_id]);
  await log(ctx, 'AVAILABILITY', `Driver is now ${want}`);
  return { availability: want };
}, D);

// open requests this driver can take: matching active vehicle type, not rejected by them
route('GET', '/api/driver/requests', async (ctx) => {
  const d = await driverOf(ctx.user);
  const online = d.availability === 'ONLINE' && d.verification_status === 'APPROVED';
  const busy = !!(await activeTrip(d.driver_id));
  if (!online || busy) return { online, busy, requests: [] };
  const requests = await q(
    `SELECT r.request_id, r.pickup_location, r.destination, r.vehicle_type, r.distance_km, r.estimated_fare, r.requested_at,
            u.name AS passenger_name
     FROM ride_requests r
     JOIN passenger_profiles pp ON pp.passenger_id = r.passenger_id JOIN users u ON u.user_id = pp.user_id
     WHERE r.status = 'REQUESTED'
       AND r.vehicle_type IN (SELECT vehicle_type FROM vehicles WHERE driver_id = ? AND status = 'ACTIVE')
       AND NOT EXISTS (SELECT 1 FROM request_rejections x WHERE x.request_id = r.request_id AND x.driver_id = ?)
     ORDER BY r.requested_at`,
    [d.driver_id, d.driver_id],
  );
  return { online, busy, requests };
}, D);

route('POST', '/api/driver/requests/:id/accept', async (ctx) => {
  const tripId = await tx(async (c) => {
    const d = await one('SELECT * FROM driver_profiles WHERE user_id = ? FOR UPDATE', [ctx.user.user_id], c);
    if (d.verification_status !== 'APPROVED' || d.availability !== 'ONLINE') throw new HttpError(403, 'Go online to accept rides');
    if (await activeTrip(d.driver_id, c)) throw new HttpError(409, 'Finish your current trip first');
    const r = await one("SELECT * FROM ride_requests WHERE request_id = ? AND status = 'REQUESTED' FOR UPDATE", [ctx.params.id], c);
    if (!r) throw new HttpError(409, 'This request was already taken or cancelled');
    const veh = await one("SELECT vehicle_id FROM vehicles WHERE driver_id = ? AND vehicle_type = ? AND status = 'ACTIVE' LIMIT 1", [d.driver_id, r.vehicle_type], c);
    if (!veh) throw new HttpError(400, `You need an active ${r.vehicle_type} to take this ride`);
    await q("UPDATE ride_requests SET status = 'ACCEPTED' WHERE request_id = ?", [r.request_id], c);
    const t = await q('INSERT INTO trips (request_id, passenger_id, driver_id, vehicle_id) VALUES (?, ?, ?, ?)', [r.request_id, r.passenger_id, d.driver_id, veh.vehicle_id], c);
    return t.insertId;
  });
  await log(ctx, 'ACCEPT_RIDE', `Accepted booking #${ctx.params.id} as trip #${tripId}`);
  return { trip_id: tripId, message: 'Ride accepted. Head to the pickup point.' };
}, D);

route('POST', '/api/driver/requests/:id/reject', async (ctx) => {
  const d = await driverOf(ctx.user);
  const r = await one("SELECT 1 FROM ride_requests WHERE request_id = ? AND status = 'REQUESTED'", [ctx.params.id]);
  if (!r) throw new HttpError(409, 'This request is no longer open');
  await q('INSERT IGNORE INTO request_rejections (request_id, driver_id) VALUES (?, ?)', [ctx.params.id, d.driver_id]);
  await log(ctx, 'REJECT_RIDE', `Rejected booking #${ctx.params.id}`);
  return { message: 'Request hidden.' };
}, D);

route('GET', '/api/driver/trips/active', async (ctx) => {
  const d = await driverOf(ctx.user);
  const [row] = withStage(await q(`${BOOKING_SELECT} WHERE t.driver_id = ? AND t.trip_status IN ('ACCEPTED','STARTED') LIMIT 1`, [d.driver_id]));
  return { booking: row || null };
}, D);

async function ownTrip(ctx, conn) {
  const d = await driverOf(ctx.user, conn);
  const t = await one('SELECT trip_id FROM trips WHERE trip_id = ? AND driver_id = ? FOR UPDATE', [ctx.params.id, d.driver_id], conn);
  if (!t) throw new HttpError(404, 'Trip not found');
}

route('POST', '/api/driver/trips/:id/start', async (ctx) => {
  await tx(async (c) => {
    await ownTrip(ctx, c);
    await startTrip(c, ctx.params.id);
  });
  await log(ctx, 'START_TRIP', `Trip #${ctx.params.id} started`);
  return { message: 'Trip started.' };
}, D);

route('POST', '/api/driver/trips/:id/complete', async (ctx) => {
  const done = await tx(async (c) => {
    await ownTrip(ctx, c);
    return completeTrip(c, ctx.params.id);
  });
  await log(ctx, 'COMPLETE_TRIP', `Trip #${ctx.params.id} completed, fare ₹${done.fare}`);
  return { ...done, message: `Trip completed. Fare ₹${done.fare}.` };
}, D);

route('GET', '/api/driver/trips', async (ctx) => {
  const d = await driverOf(ctx.user);
  return withStage(await q(`${BOOKING_SELECT} WHERE t.driver_id = ? ORDER BY r.request_id DESC LIMIT 200`, [d.driver_id]));
}, D);

route('GET', '/api/driver/earnings', async (ctx) => {
  const d = await driverOf(ctx.user);
  const s = await getSettings();
  const pct = Number(s.platform_commission_pct || 0);
  const daily = await q(
    `SELECT DATE(end_time) AS day, COUNT(*) AS trips, SUM(fare) AS gross, SUM(distance_km) AS km
     FROM trips WHERE driver_id = ? AND trip_status = 'COMPLETED' AND end_time >= DATE_SUB(CURDATE(), INTERVAL 13 DAY)
     GROUP BY DATE(end_time) ORDER BY day`,
    [d.driver_id],
  );
  const total = await one("SELECT COUNT(*) AS trips, COALESCE(SUM(fare), 0) AS gross, COALESCE(SUM(distance_km), 0) AS km FROM trips WHERE driver_id = ? AND trip_status = 'COMPLETED'", [d.driver_id]);
  const net = (g) => Math.round(g * (1 - pct / 100));
  return {
    commission_pct: pct,
    total: { ...total, net: net(total.gross) },
    daily: daily.map((r) => ({ ...r, net: net(r.gross) })),
  };
}, D);

route('GET', '/api/driver/reviews', async (ctx) => {
  const d = await driverOf(ctx.user);
  const reviews = await q(
    `SELECT rv.rating, rv.comment, rv.created_at, u.name AS reviewer, r.pickup_location, r.destination
     FROM ratings_reviews rv JOIN users u ON u.user_id = rv.reviewer_id
     JOIN trips t ON t.trip_id = rv.trip_id JOIN ride_requests r ON r.request_id = t.request_id
     WHERE rv.reviewed_user_id = ? ORDER BY rv.created_at DESC`,
    [ctx.user.user_id],
  );
  return { rating: d.rating, reviews };
}, D);

// ---- own vehicles ----
function vehicleBody(b) {
  const number = v.str(b.vehicle_number, 'vehicle_number', { min: 6, max: 12 }).toUpperCase().replace(/\s+/g, '');
  if (!/^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{1,4}$/.test(number)) throw new HttpError(400, 'vehicle_number must look like TN09AB1234');
  return {
    vehicle_number: number,
    vehicle_type: v.oneOf(b.vehicle_type, 'vehicle_type', VEHICLE_TYPES),
    model: v.str(b.model, 'model', { min: 2, max: 60 }),
    capacity: v.num(b.capacity, 'capacity', { int: true, min: 1, max: 8 }),
  };
}

route('GET', '/api/driver/vehicles', async (ctx) => {
  const d = await driverOf(ctx.user);
  return q('SELECT * FROM vehicles WHERE driver_id = ? ORDER BY vehicle_id', [d.driver_id]);
}, D);

route('POST', '/api/driver/vehicles', async (ctx) => {
  const d = await driverOf(ctx.user);
  const x = vehicleBody(ctx.body);
  const count = await one('SELECT COUNT(*) AS n FROM vehicles WHERE driver_id = ?', [d.driver_id]);
  if (count.n >= 3) throw new HttpError(400, 'A driver can register at most 3 vehicles'); // application rule
  const r = await q('INSERT INTO vehicles (driver_id, vehicle_number, vehicle_type, model, capacity) VALUES (?, ?, ?, ?, ?)', [d.driver_id, x.vehicle_number, x.vehicle_type, x.model, x.capacity]);
  await log(ctx, 'VEHICLE_ADD', `Added ${x.vehicle_type} ${x.vehicle_number}`);
  return { created: true, vehicle_id: r.insertId };
}, D);

route('PUT', '/api/driver/vehicles/:id', async (ctx) => {
  const d = await driverOf(ctx.user);
  const x = vehicleBody(ctx.body);
  const status = v.oneOf(ctx.body.status || 'ACTIVE', 'status', ['ACTIVE', 'INACTIVE']);
  const r = await q('UPDATE vehicles SET vehicle_number = ?, vehicle_type = ?, model = ?, capacity = ?, status = ? WHERE vehicle_id = ? AND driver_id = ?', [x.vehicle_number, x.vehicle_type, x.model, x.capacity, status, ctx.params.id, d.driver_id]);
  if (!r.affectedRows) throw new HttpError(404, 'Vehicle not found');
  await log(ctx, 'VEHICLE_EDIT', `Updated vehicle ${x.vehicle_number}`);
  return { message: 'Vehicle saved' };
}, D);

route('DELETE', '/api/driver/vehicles/:id', async (ctx) => {
  const d = await driverOf(ctx.user);
  if (await one('SELECT 1 FROM trips WHERE vehicle_id = ?', [ctx.params.id])) throw new HttpError(409, 'This vehicle has trips on record; set it inactive instead');
  const r = await q('DELETE FROM vehicles WHERE vehicle_id = ? AND driver_id = ?', [ctx.params.id, d.driver_id]);
  if (!r.affectedRows) throw new HttpError(404, 'Vehicle not found');
  await log(ctx, 'VEHICLE_DELETE', `Deleted vehicle #${ctx.params.id}`);
  return { message: 'Vehicle deleted' };
}, D);
