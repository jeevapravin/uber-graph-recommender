// End-to-end API flow against a running server (seeded DB):
//   docker compose exec app node --test        (or BASE_URL=http://localhost:3000 node --test)
const test = require('node:test');
const assert = require('node:assert');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const run = Date.now().toString().slice(-6);

async function call(method, path, { token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}
const login = async (email, password) => (await call('POST', '/api/auth/login', { body: { email, password } })).data.token;

test('full booking flow across all four roles', { skip: !process.env.BASE_URL && !process.env.DB_HOST && 'set BASE_URL to run' }, async (t) => {
  const pEmail = `pass${run}@test.in`;
  const dEmail = `drv${run}@test.in`;
  let p, d, admin, superAdmin, support, requestId, tripId;

  await t.test('validation rejects bad registration', async () => {
    const r = await call('POST', '/api/auth/register', { body: { role: 'PASSENGER', name: 'X', email: 'nope', mobile: '12', password: '1' } });
    assert.equal(r.status, 400);
  });

  await t.test('passenger and driver register and log in', async () => {
    let r = await call('POST', '/api/auth/register', { body: { role: 'PASSENGER', name: 'Test Passenger', email: pEmail, mobile: '9999900001', password: 'secret12' } });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    r = await call('POST', '/api/auth/register', { body: { role: 'DRIVER', name: 'Test Driver', email: dEmail, mobile: '9999900002', password: 'secret12', license_no: `TN${run}LIC`, license_expiry: '2031-01-01' } });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    p = await login(pEmail, 'secret12');
    d = await login(dEmail, 'secret12');
    admin = await login('admin@cabgo.in', 'Admin@123');
    superAdmin = await login('superadmin@cabgo.in', 'Super@123');
    support = await login('support@cabgo.in', 'Support@123');
    assert.ok(p && d && admin && superAdmin && support);
  });

  await t.test('role checks: passenger cannot use admin API, limited admin lacks permission', async () => {
    assert.equal((await call('GET', '/api/admin/passengers', { token: p })).status, 403);
    assert.equal((await call('GET', '/api/admin/reports', { token: support })).status, 403);
    assert.equal((await call('GET', '/api/admin/bookings', { token: support })).status, 200);
    assert.equal((await call('GET', '/api/admin/summary')).status, 401);
  });

  await t.test('unapproved driver cannot go online; admin approves', async () => {
    let r = await call('POST', '/api/driver/vehicles', { token: d, body: { vehicle_number: `TN01Z${run.slice(-4)}`, vehicle_type: 'SUV', model: 'Toyota Innova', capacity: 6 } });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal((await call('PUT', '/api/driver/availability', { token: d, body: { availability: 'ONLINE' } })).status, 403);
    const drivers = (await call('GET', `/api/admin/drivers?q=${dEmail}`, { token: admin })).data;
    r = await call('PUT', `/api/admin/drivers/${drivers[0].driver_id}/verification`, { token: admin, body: { verification_status: 'APPROVED' } });
    assert.equal(r.status, 200);
    r = await call('PUT', '/api/driver/availability', { token: d, body: { availability: 'ONLINE' } });
    assert.equal(r.data.availability, 'ONLINE');
  });

  await t.test('passenger searches, books with a promo, cannot double book', async () => {
    const s = (await call('GET', '/api/rides/search?from=1&to=6')).data;
    const suv = s.options.find((o) => o.vehicle_type === 'SUV');
    assert.ok(suv.drivers_available >= 1);
    const promo = await call('GET', '/api/passenger/promo?code=welcome50', { token: p });
    assert.equal(promo.data.discount_pct, 50);
    let r = await call('POST', '/api/passenger/bookings', { token: p, body: { pickup_area_id: 1, drop_area_id: 6, vehicle_type: 'SUV', pickup_detail: 'Gate 2', promo_code: 'WELCOME50' } });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal(r.data.estimated_fare, suv.estimated_fare - Math.min(100, Math.round(suv.estimated_fare / 2)));
    requestId = r.data.request_id;
    r = await call('POST', '/api/passenger/bookings', { token: p, body: { pickup_area_id: 1, drop_area_id: 2, vehicle_type: 'SUV' } });
    assert.equal(r.status, 409);
    assert.equal((await call('GET', '/api/passenger/bookings/current', { token: p })).data.booking.stage, 'SEARCHING');
  });

  await t.test('driver sees and accepts the request; only once', async () => {
    const reqs = (await call('GET', '/api/driver/requests', { token: d })).data.requests;
    assert.ok(reqs.some((r) => r.request_id === requestId));
    let r = await call('POST', `/api/driver/requests/${requestId}/accept`, { token: d });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    tripId = r.data.trip_id;
    assert.equal((await call('POST', `/api/driver/requests/${requestId}/accept`, { token: d })).status, 409);
    const cur = (await call('GET', '/api/passenger/bookings/current', { token: p })).data.booking;
    assert.equal(cur.stage, 'ACCEPTED');
    assert.equal(cur.driver_name, 'Test Driver');
  });

  await t.test('SOS, start, complete, pay, review, receipt', async () => {
    assert.equal((await call('POST', `/api/trips/${tripId}/sos`, { token: p })).status, 200);
    assert.equal((await call('POST', `/api/driver/trips/${tripId}/complete`, { token: d })).status, 409); // not started
    assert.equal((await call('POST', `/api/driver/trips/${tripId}/start`, { token: d })).status, 200);
    assert.equal((await call('POST', `/api/passenger/bookings/${requestId}/cancel`, { token: p })).status, 409); // in progress
    const done = await call('POST', `/api/driver/trips/${tripId}/complete`, { token: d });
    assert.equal(done.status, 200, JSON.stringify(done.data));
    assert.ok(done.data.fare > 0);
    assert.equal((await call('POST', `/api/trips/${tripId}/receipt`, { token: p })).status, 405);
    const receipt = (await call('GET', `/api/trips/${tripId}/receipt`, { token: p })).data;
    assert.equal(receipt.fare.total, done.data.fare);
    assert.ok(receipt.fare.discount > 0);
    assert.equal((await call('GET', `/api/trips/${tripId}/receipt`, { token: await login('priya@example.com', 'Pass@123') })).status, 404);
    assert.equal((await call('POST', `/api/passenger/trips/${tripId}/pay`, { token: p, body: { payment_method: 'UPI' } })).status, 200);
    assert.equal((await call('POST', `/api/passenger/trips/${tripId}/pay`, { token: p, body: { payment_method: 'UPI' } })).status, 409);
    assert.equal((await call('POST', `/api/passenger/trips/${tripId}/review`, { token: p, body: { rating: 4, comment: 'Good' } })).status, 201);
    assert.equal((await call('POST', `/api/passenger/trips/${tripId}/review`, { token: p, body: { rating: 4 } })).status, 409);
    assert.equal((await call('GET', '/api/driver/reviews', { token: d })).data.rating, 4);
  });

  await t.test('cancel after accept charges the cancellation fee', async () => {
    let r = await call('POST', '/api/passenger/bookings', { token: p, body: { pickup_area_id: 2, drop_area_id: 3, vehicle_type: 'SUV' } });
    const id = r.data.request_id;
    await call('POST', `/api/driver/requests/${id}/accept`, { token: d });
    r = await call('POST', `/api/passenger/bookings/${id}/cancel`, { token: p });
    assert.equal(r.data.charge, 80);
    r = await call('POST', '/api/passenger/bookings', { token: p, body: { pickup_area_id: 2, drop_area_id: 3, vehicle_type: 'SUV' } });
    assert.equal(r.status, 409); // the fee must be paid first
  });

  await t.test('support ticket raised and resolved with refund', async () => {
    let r = await call('POST', '/api/tickets', { token: p, body: { request_id: requestId, category: 'FARE', message: 'The fare looks higher than expected.' } });
    assert.equal(r.status, 201);
    r = await call('PUT', `/api/admin/tickets/${r.data.ticket_id}`, { token: support, body: { admin_reply: 'Refunded, sorry!', refund: true } });
    assert.equal(r.status, 200);
    const trips = (await call('GET', '/api/passenger/trips', { token: p })).data;
    assert.equal(trips.find((x) => x.request_id === requestId).payment_status, 'REFUNDED');
  });

  await t.test('admin blocks a passenger, who can no longer use the API', async () => {
    const users = (await call('GET', `/api/admin/passengers?q=${pEmail}`, { token: admin })).data;
    assert.equal((await call('PUT', `/api/admin/users/${users[0].user_id}/status`, { token: admin, body: { status: 'BLOCKED' } })).status, 200);
    assert.equal((await call('GET', '/api/passenger/trips', { token: p })).status, 401);
    assert.equal((await call('POST', '/api/auth/login', { body: { email: pEmail, password: 'secret12' } })).status, 403);
  });

  await t.test('reports, CSV export, logs', async () => {
    const r = (await call('GET', '/api/admin/reports', { token: admin })).data;
    assert.ok(r.totals.bookings >= 1 && r.byDay.length >= 1);
    const csv = await call('GET', '/api/admin/bookings/export', { token: admin });
    assert.match(String(csv.data), /^booking,requested_at,stage/);
    const logs = (await call('GET', '/api/admin/logs?action=SOS', { token: admin })).data;
    assert.ok(logs.length >= 1);
  });

  await t.test('super admin manages admins, permissions and settings', async () => {
    let r = await call('POST', '/api/superadmin/admins', { token: superAdmin, body: { name: 'New Admin', email: `adm${run}@cabgo.in`, mobile: '9000000099', password: 'secret12', permissions: ['VIEW_REPORTS'] } });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    const id = r.data.user_id;
    const a = await login(`adm${run}@cabgo.in`, 'secret12');
    assert.equal((await call('GET', '/api/admin/reports', { token: a })).status, 200);
    assert.equal((await call('GET', '/api/admin/drivers', { token: a })).status, 403);
    await call('PUT', `/api/superadmin/admins/${id}/permissions`, { token: superAdmin, body: { permissions: ['MANAGE_DRIVERS'] } });
    assert.equal((await call('GET', '/api/admin/drivers', { token: a })).status, 200);
    assert.equal((await call('PUT', '/api/superadmin/settings', { token: admin, body: { settings: { surge_multiplier: 2 } } })).status, 403);
    assert.equal((await call('PUT', '/api/superadmin/settings', { token: superAdmin, body: { settings: { surge_multiplier: 9 } } })).status, 400);
    assert.equal((await call('PUT', '/api/superadmin/settings', { token: superAdmin, body: { settings: { surge_multiplier: 1 } } })).status, 200);
    assert.equal((await call('DELETE', `/api/superadmin/admins/${id}`, { token: superAdmin })).status, 200);
    assert.equal((await call('GET', '/api/admin/reports', { token: a })).status, 401);
  });

  await t.test('forgot-password: nonexistent email returns the same generic message', async () => {
    const r = await call('POST', '/api/auth/forgot-password', { body: { email: 'nonexistent@nowhere.test' } });
    assert.equal(r.status, 200);
    assert.ok(r.data.message.includes('reset instructions'));
  });

  await t.test('forgot-password: invalid email format is rejected', async () => {
    const r = await call('POST', '/api/auth/forgot-password', { body: { email: 'not-an-email' } });
    assert.equal(r.status, 400);
  });

  await t.test('reset-password: invalid token is rejected', async () => {
    const r = await call('POST', '/api/auth/reset-password', { body: { token: 'bogus', newPassword: 'NewPass@999' } });
    assert.equal(r.status, 400);
    assert.ok(r.data.error.includes('Invalid'));
  });

  await t.test('reset-password: weak password is rejected', async () => {
    const r = await call('POST', '/api/auth/reset-password', { body: { token: 'x'.repeat(64), newPassword: '12' } });
    assert.equal(r.status, 400);
  });

  await t.test('forgot-password: existing email returns identical generic message', async () => {
    const r = await call('POST', '/api/auth/forgot-password', { body: { email: dEmail } });
    assert.equal(r.status, 200);
    assert.ok(r.data.message.includes('reset instructions'));
  });
  await t.test('driver goes offline', async () => {
    assert.equal((await call('PUT', '/api/driver/availability', { token: d, body: { availability: 'OFFLINE' } })).data.availability, 'OFFLINE');
  });
});
