// Passenger: book, follow, cancel, pay for and review rides; trip history.
const { route, v, HttpError } = require('../http');
const { q, one, tx } = require('../db');
const { log, getSettings } = require('../auth');
const { tripEstimate, fareFor } = require('../fare');
const { BOOKING_SELECT, withStage, cancelBooking } = require('../bookings');

const P = { roles: ['PASSENGER'] };
const VEHICLE_TYPES = ['BIKE', 'AUTO', 'MINI', 'SEDAN', 'SUV'];

// a promo is usable when active, not expired, under its limit and not already used by this passenger
async function findPromo(code, pid, conn) {
  const promo = await one(
    "SELECT * FROM promo_codes WHERE code = ? AND status = 'ACTIVE' AND valid_until >= CURDATE() AND used_count < usage_limit",
    [code.toUpperCase()],
    conn,
  );
  if (!promo) throw new HttpError(400, 'This promo code is invalid or expired');
  const used = await one("SELECT 1 FROM ride_requests WHERE promo_id = ? AND passenger_id = ? AND status <> 'CANCELLED'", [promo.promo_id, pid], conn);
  if (used) throw new HttpError(400, 'You have already used this promo code');
  return promo;
}

async function passengerId(user) {
  const p = await one('SELECT passenger_id FROM passenger_profiles WHERE user_id = ?', [user.user_id]);
  if (!p) throw new HttpError(404, 'Passenger profile missing');
  return p.passenger_id;
}

route('GET', '/api/passenger/summary', async (ctx) => {
  const pid = await passengerId(ctx.user);
  const stats = await one(
    `SELECT COUNT(*) AS bookings,
            SUM(r.status = 'COMPLETED') AS completed,
            SUM(r.status = 'CANCELLED') AS cancelled,
            (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE passenger_id = ? AND payment_status = 'PAID') AS spent,
            (SELECT COUNT(*) FROM payments WHERE passenger_id = ? AND payment_status = 'PENDING') AS unpaid
     FROM ride_requests r WHERE r.passenger_id = ?`,
    [pid, pid, pid],
  );
  const [current] = withStage(await q(`${BOOKING_SELECT} WHERE r.passenger_id = ? AND r.status IN ('REQUESTED','ACCEPTED') LIMIT 1`, [pid]));
  return { stats, current: current || null };
}, P);

route('GET', '/api/passenger/promo', async (ctx) => {
  const pid = await passengerId(ctx.user);
  const promo = await findPromo(v.str(ctx.query.code, 'code', { max: 20 }), pid);
  return { code: promo.code, discount_pct: promo.discount_pct, max_discount: promo.max_discount, valid_until: promo.valid_until };
}, P);

route('POST', '/api/passenger/bookings', async (ctx) => {
  const b = ctx.body;
  const pid = await passengerId(ctx.user);
  const from = v.num(b.pickup_area_id, 'pickup_area_id', { int: true, min: 1 });
  const to = v.num(b.drop_area_id, 'drop_area_id', { int: true, min: 1 });
  if (from === to) throw new HttpError(400, 'Pickup and destination must be different');
  const type = v.oneOf(b.vehicle_type, 'vehicle_type', VEHICLE_TYPES);
  const pickupDetail = v.str(b.pickup_detail, 'pickup_detail', { optional: true, max: 150 });
  const dropDetail = v.str(b.drop_detail, 'drop_detail', { optional: true, max: 150 });
  const promoCode = v.str(b.promo_code, 'promo_code', { optional: true, max: 20 });

  const settings = await getSettings();
  if (settings.maintenance_mode === 'true') throw new HttpError(503, 'Bookings are paused for maintenance');

  const result = await tx(async (c) => {
    // lock the passenger row so two quick clicks cannot create two open bookings
    await q('SELECT passenger_id FROM passenger_profiles WHERE passenger_id = ? FOR UPDATE', [pid], c);
    if (await one("SELECT 1 FROM ride_requests WHERE passenger_id = ? AND status IN ('REQUESTED','ACCEPTED')", [pid], c)) {
      throw new HttpError(409, 'You already have an open booking');
    }
    const unpaid = await one("SELECT 1 FROM payments WHERE passenger_id = ? AND payment_status = 'PENDING'", [pid], c);
    if (unpaid) throw new HttpError(409, 'Please pay your pending fare before booking again');
    const areas = await q("SELECT * FROM service_areas WHERE area_id IN (?, ?) AND status = 'ACTIVE'", [from, to], c);
    const a = areas.find((x) => x.area_id === from);
    const z = areas.find((x) => x.area_id === to);
    if (!a || !z) throw new HttpError(404, 'We do not serve one of these areas');
    const rule = await one("SELECT * FROM fare_rules WHERE vehicle_type = ? AND status = 'ACTIVE'", [type], c);
    if (!rule) throw new HttpError(400, `${type} rides are not available`);
    const { km, minutes } = tripEstimate(a, z, settings);
    const promo = promoCode ? await findPromo(promoCode, pid, c) : null;
    const surge = Number(settings.surge_multiplier || 1);
    const fare = fareFor(rule, km, minutes, { surge, discountPct: promo ? promo.discount_pct : 0, maxDiscount: promo ? promo.max_discount : 0 });
    if (promo) await q('UPDATE promo_codes SET used_count = used_count + 1 WHERE promo_id = ?', [promo.promo_id], c);
    const label = (detail, area) => (detail ? `${detail}, ${area.area_name}` : area.area_name);
    const r = await q(
      `INSERT INTO ride_requests (passenger_id, pickup_area_id, drop_area_id, pickup_location, destination, vehicle_type, distance_km, estimated_fare,
                                  surge_multiplier, promo_id, discount_pct, max_discount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [pid, from, to, label(pickupDetail, a), label(dropDetail, z), type, km, fare, surge, promo ? promo.promo_id : null, promo ? promo.discount_pct : 0, promo ? promo.max_discount : 0],
      c,
    );
    return { request_id: r.insertId, estimated_fare: fare, km, minutes };
  });
  await log(ctx, 'BOOK_RIDE', `Booking #${result.request_id} (${type}, ₹${result.estimated_fare})`);
  return { created: true, ...result };
}, P);

// the latest booking, whatever its state (the active-trip page shows completed/cancelled ones too)
route('GET', '/api/passenger/bookings/current', async (ctx) => {
  const pid = await passengerId(ctx.user);
  const [row] = withStage(await q(`${BOOKING_SELECT} WHERE r.passenger_id = ? ORDER BY r.request_id DESC LIMIT 1`, [pid]));
  return { booking: row || null };
}, P);

route('POST', '/api/passenger/bookings/:id/cancel', async (ctx) => {
  const pid = await passengerId(ctx.user);
  const own = await one('SELECT vehicle_type FROM ride_requests WHERE request_id = ? AND passenger_id = ?', [ctx.params.id, pid]);
  if (!own) throw new HttpError(404, 'Booking not found');
  const rule = await one('SELECT cancellation_fee FROM fare_rules WHERE vehicle_type = ?', [own.vehicle_type]);
  const { charge } = await tx((c) => cancelBooking(c, ctx.params.id, { fee: rule ? rule.cancellation_fee : 0 }));
  await log(ctx, 'CANCEL_RIDE', `Booking #${ctx.params.id} cancelled${charge ? `, fee ₹${charge}` : ''}`);
  return { message: charge ? `Booking cancelled. A cancellation fee of ₹${charge} applies.` : 'Booking cancelled.', charge };
}, P);

route('GET', '/api/passenger/trips', async (ctx) => {
  const pid = await passengerId(ctx.user);
  return withStage(await q(`${BOOKING_SELECT} WHERE r.passenger_id = ? ORDER BY r.request_id DESC LIMIT 200`, [pid]));
}, P);

route('POST', '/api/passenger/trips/:id/pay', async (ctx) => {
  const pid = await passengerId(ctx.user);
  const method = v.oneOf(ctx.body.payment_method, 'payment_method', ['CASH', 'CARD', 'UPI', 'WALLET']);
  const r = await q(
    "UPDATE payments SET payment_status = 'PAID', payment_method = ?, paid_at = NOW() WHERE trip_id = ? AND passenger_id = ? AND payment_status = 'PENDING'",
    [method, ctx.params.id, pid],
  );
  if (!r.affectedRows) throw new HttpError(409, 'Nothing to pay for this trip');
  await log(ctx, 'PAYMENT', `Trip #${ctx.params.id} paid by ${method}`);
  return { message: 'Payment received. Thank you!' };
}, P);

route('POST', '/api/passenger/trips/:id/review', async (ctx) => {
  const pid = await passengerId(ctx.user);
  const rating = v.num(ctx.body.rating, 'rating', { int: true, min: 1, max: 5 });
  const comment = v.str(ctx.body.comment, 'comment', { optional: true, max: 500 });
  const trip = await one(
    `SELECT t.trip_id, d.user_id AS driver_user_id FROM trips t JOIN driver_profiles d ON d.driver_id = t.driver_id
     WHERE t.trip_id = ? AND t.passenger_id = ? AND t.trip_status = 'COMPLETED'`,
    [ctx.params.id, pid],
  );
  if (!trip) throw new HttpError(404, 'Only your completed trips can be reviewed');
  await tx(async (c) => {
    await q('INSERT INTO ratings_reviews (trip_id, reviewer_id, reviewed_user_id, rating, comment) VALUES (?, ?, ?, ?, ?)', [trip.trip_id, ctx.user.user_id, trip.driver_user_id, rating, comment], c);
    await q('UPDATE driver_profiles SET rating = (SELECT ROUND(AVG(rating), 2) FROM ratings_reviews WHERE reviewed_user_id = ?) WHERE user_id = ?', [trip.driver_user_id, trip.driver_user_id], c);
  });
  await log(ctx, 'REVIEW', `Rated trip #${trip.trip_id} ${rating}/5`);
  return { created: true, message: 'Thanks for your review!' };
}, P);
