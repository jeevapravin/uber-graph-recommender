// Routes shared by several roles: trip receipts, SOS alerts and support tickets.
const { route, v, HttpError } = require('../http');
const { q, one } = require('../db');
const { log } = require('../auth');
const { BOOKING_SELECT, withStage } = require('../bookings');

const RIDERS = { roles: ['PASSENGER', 'DRIVER'] };

// a passenger or driver may only see their own booking; admins see all
async function bookingFor(ctx, where, id) {
  const [row] = withStage(await q(`${BOOKING_SELECT} WHERE ${where} = ?`, [id]));
  if (!row) throw new HttpError(404, 'Booking not found');
  const u = ctx.user;
  const mine = (u.role === 'PASSENGER' && row.passenger_user_id === u.user_id) || (u.role === 'DRIVER' && row.driver_user_id === u.user_id);
  if (!mine && !['ADMIN', 'SUPER_ADMIN'].includes(u.role)) throw new HttpError(404, 'Booking not found');
  return row;
}

route('GET', '/api/trips/:id/receipt', async (ctx) => {
  const row = await bookingFor(ctx, 't.trip_id', ctx.params.id);
  const details = typeof row.fare_details === 'string' ? JSON.parse(row.fare_details) : row.fare_details;
  return { booking: row, fare: details || null };
}, { roles: ['PASSENGER', 'DRIVER', 'ADMIN', 'SUPER_ADMIN'] });

// SOS: recorded as a system log the admin dashboard surfaces; the passenger's emergency contact is returned
route('POST', '/api/trips/:id/sos', async (ctx) => {
  const row = await bookingFor(ctx, 't.trip_id', ctx.params.id);
  if (!['ACCEPTED', 'STARTED'].includes(row.stage)) throw new HttpError(409, 'SOS is only available during an active trip');
  const p = await one('SELECT emergency_contact FROM passenger_profiles WHERE user_id = ?', [row.passenger_user_id]);
  await log(ctx, 'SOS', `SOS on trip #${row.trip_id} by ${ctx.user.role} ${ctx.user.name} (${row.pickup_location} → ${row.destination})`);
  return { message: 'SOS sent. Our safety team has been alerted. In danger, call 112.', emergency_contact: p && p.emergency_contact };
}, RIDERS);

route('POST', '/api/tickets', async (ctx) => {
  const b = ctx.body;
  const category = v.oneOf(b.category, 'category', ['FARE', 'DRIVER', 'PASSENGER', 'PAYMENT', 'SAFETY', 'OTHER']);
  const message = v.str(b.message, 'message', { min: 10, max: 1000 });
  let requestId = null;
  if (b.request_id) requestId = (await bookingFor(ctx, 'r.request_id', v.num(b.request_id, 'request_id', { int: true, min: 1 }))).request_id;
  const r = await q('INSERT INTO support_tickets (request_id, user_id, category, message) VALUES (?, ?, ?, ?)', [requestId, ctx.user.user_id, category, message]);
  await log(ctx, 'TICKET_OPEN', `Ticket #${r.insertId} (${category})`);
  return { created: true, ticket_id: r.insertId, message: 'Ticket raised. An admin will reply soon.' };
}, RIDERS);

route('GET', '/api/tickets', async (ctx) =>
  q(
    `SELECT s.*, r.pickup_location, r.destination FROM support_tickets s
     LEFT JOIN ride_requests r ON r.request_id = s.request_id WHERE s.user_id = ? ORDER BY s.ticket_id DESC`,
    [ctx.user.user_id],
  ), RIDERS);
