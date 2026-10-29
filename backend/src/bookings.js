// Shared booking queries and trip state changes (used by passenger, driver and admin routes).
const { q, one } = require('./db');
const { HttpError } = require('./http');
const { fareBreakdown } = require('./fare');

// one row per ride request with its trip, people, vehicle, payment and the passenger's review
const BOOKING_SELECT = `
  SELECT r.request_id, r.pickup_location, r.destination, r.vehicle_type, r.distance_km, r.estimated_fare,
         r.status AS request_status, r.requested_at, r.surge_multiplier, r.discount_pct,
         t.trip_id, t.trip_status, t.start_time, t.end_time, t.fare, t.fare_details,
         pu.user_id AS passenger_user_id, pu.name AS passenger_name, pu.mobile AS passenger_mobile,
         du.user_id AS driver_user_id, du.name AS driver_name, du.mobile AS driver_mobile, d.rating AS driver_rating,
         v.vehicle_number, v.model AS vehicle_model,
         pay.payment_id, pay.amount AS payment_amount, pay.payment_method, pay.payment_status, pay.paid_at,
         rv.rating AS review_rating, rv.comment AS review_comment
  FROM ride_requests r
  JOIN passenger_profiles pp ON pp.passenger_id = r.passenger_id
  JOIN users pu ON pu.user_id = pp.user_id
  LEFT JOIN trips t ON t.request_id = r.request_id
  LEFT JOIN driver_profiles d ON d.driver_id = t.driver_id
  LEFT JOIN users du ON du.user_id = d.user_id
  LEFT JOIN vehicles v ON v.vehicle_id = t.vehicle_id
  LEFT JOIN payments pay ON pay.trip_id = t.trip_id
  LEFT JOIN ratings_reviews rv ON rv.trip_id = t.trip_id AND rv.reviewer_id = pu.user_id`;

// the single stage the UI shows: SEARCHING → ACCEPTED → STARTED → COMPLETED, or CANCELLED
function stageOf(row) {
  if (row.request_status === 'CANCELLED') return 'CANCELLED';
  if (row.request_status === 'REQUESTED') return 'SEARCHING';
  return row.trip_status;
}

const withStage = (rows) => rows.map((r) => ({ ...r, stage: stageOf(r) }));

// SQL condition for a stage filter (admin trips page)
const STAGE_SQL = {
  SEARCHING: "r.status = 'REQUESTED'",
  ACCEPTED: "t.trip_status = 'ACCEPTED'",
  STARTED: "t.trip_status = 'STARTED'",
  COMPLETED: "t.trip_status = 'COMPLETED'",
  CANCELLED: "r.status = 'CANCELLED'",
};

async function startTrip(conn, tripId) {
  const r = await q("UPDATE trips SET trip_status = 'STARTED', start_time = NOW() WHERE trip_id = ? AND trip_status = 'ACCEPTED'", [tripId], conn);
  if (!r.affectedRows) throw new HttpError(409, 'Only an accepted trip can be started');
}

// final fare uses the booked distance and the real trip minutes; creates the pending payment
async function completeTrip(conn, tripId) {
  const trip = await one(
    `SELECT t.*, r.distance_km AS booked_km, r.vehicle_type, r.surge_multiplier, r.discount_pct, r.max_discount, TIMESTAMPDIFF(SECOND, t.start_time, NOW()) AS secs
     FROM trips t JOIN ride_requests r ON r.request_id = t.request_id WHERE t.trip_id = ? FOR UPDATE`,
    [tripId],
    conn,
  );
  if (!trip || trip.trip_status !== 'STARTED') throw new HttpError(409, 'Only a started trip can be completed');
  const rule = await one('SELECT * FROM fare_rules WHERE vehicle_type = ?', [trip.vehicle_type], conn);
  const minutes = Math.max(1, Math.ceil(trip.secs / 60));
  const details = fareBreakdown(rule, trip.booked_km, minutes, { surge: trip.surge_multiplier, discountPct: trip.discount_pct, maxDiscount: trip.max_discount });
  const fare = details.total;
  await q(
    "UPDATE trips SET trip_status = 'COMPLETED', end_time = NOW(), distance_km = ?, fare = ?, fare_details = ? WHERE trip_id = ?",
    [trip.booked_km, fare, JSON.stringify(details), tripId],
    conn,
  );
  await q("UPDATE ride_requests SET status = 'COMPLETED' WHERE request_id = ?", [trip.request_id], conn);
  await q('INSERT INTO payments (trip_id, passenger_id, amount) VALUES (?, ?, ?)', [tripId, trip.passenger_id, fare], conn);
  return { fare, minutes, km: trip.booked_km };
}

// cancel a request (and its trip, if one exists). fee > 0 creates a pending payment for it.
async function cancelBooking(conn, requestId, { fee = 0, allowStarted = false } = {}) {
  const req = await one('SELECT * FROM ride_requests WHERE request_id = ? FOR UPDATE', [requestId], conn);
  if (!req) throw new HttpError(404, 'Booking not found');
  if (!['REQUESTED', 'ACCEPTED'].includes(req.status)) throw new HttpError(409, 'This booking is already closed');
  const trip = await one('SELECT * FROM trips WHERE request_id = ? FOR UPDATE', [requestId], conn);
  if (trip && trip.trip_status === 'STARTED' && !allowStarted) throw new HttpError(409, 'A trip in progress cannot be cancelled');
  const charge = trip ? fee : 0; // nothing is charged before a driver accepts
  if (trip) {
    await q("UPDATE trips SET trip_status = 'CANCELLED', end_time = NOW(), fare = ? WHERE trip_id = ?", [charge, trip.trip_id], conn);
    if (charge > 0) await q('INSERT INTO payments (trip_id, passenger_id, amount) VALUES (?, ?, ?)', [trip.trip_id, trip.passenger_id, charge], conn);
  }
  await q("UPDATE ride_requests SET status = 'CANCELLED' WHERE request_id = ?", [requestId], conn);
  if (req.promo_id) await q('UPDATE promo_codes SET used_count = GREATEST(used_count - 1, 0) WHERE promo_id = ?', [req.promo_id], conn);
  return { charge };
}

module.exports = { BOOKING_SELECT, stageOf, withStage, STAGE_SQL, startTrip, completeTrip, cancelBooking };
