// Public routes: register, login, session info, service areas and the ride search/estimate.
const { route, v, HttpError } = require('../http');
const { q, one, tx } = require('../db');
const { hashPassword, verifyPassword, issueToken, log, getSettings } = require('../auth');
const { tripEstimate, fareFor } = require('../fare');

const ANY = ['PASSENGER', 'DRIVER', 'ADMIN', 'SUPER_ADMIN'];

route('GET', '/api/config', async () => {
  const s = await getSettings();
  return { app_name: s.app_name, maintenance_mode: s.maintenance_mode === 'true', allow_registrations: s.allow_registrations === 'true', ai_enabled: require('../ai').enabled() };
});

route('POST', '/api/auth/register', async (ctx) => {
  const b = ctx.body;
  const s = await getSettings();
  if (s.allow_registrations !== 'true') throw new HttpError(403, 'New registrations are closed right now');
  const role = v.oneOf(b.role, 'role', ['PASSENGER', 'DRIVER']); // admins are created by the Super Admin only
  const user = {
    name: v.str(b.name, 'name', { min: 2, max: 100 }),
    email: v.email(b.email),
    mobile: v.mobile(b.mobile),
    password: v.password(b.password),
  };
  let driver;
  if (role === 'DRIVER') {
    driver = { license_no: v.str(b.license_no, 'license_no', { min: 5, max: 30 }).toUpperCase(), license_expiry: v.date(b.license_expiry, 'license_expiry') };
    if (new Date(driver.license_expiry) <= new Date()) throw new HttpError(400, 'Driving licence has expired');
  }
  if (await one('SELECT 1 FROM users WHERE email = ?', [user.email])) throw new HttpError(409, 'An account with this email already exists');

  const userId = await tx(async (c) => {
    const r = await q('INSERT INTO users (name, email, password, mobile, role) VALUES (?, ?, ?, ?, ?)', [user.name, user.email, hashPassword(user.password), user.mobile, role], c);
    if (role === 'PASSENGER') await q('INSERT INTO passenger_profiles (user_id, default_address, emergency_contact) VALUES (?, ?, ?)', [r.insertId, v.str(b.default_address, 'default_address', { optional: true }), v.mobile(b.emergency_contact, 'emergency_contact', true)], c);
    else await q('INSERT INTO driver_profiles (user_id, license_no, license_expiry) VALUES (?, ?, ?)', [r.insertId, driver.license_no, driver.license_expiry], c);
    return r.insertId;
  });
  ctx.user = { user_id: userId };
  await log(ctx, 'REGISTER', `${role} ${user.email} registered`);
  return { created: true, message: role === 'DRIVER' ? 'Registered. An admin must approve your profile before you can go online.' : 'Registered. You can log in now.' };
});

route('POST', '/api/auth/login', async (ctx) => {
  const email = v.email(ctx.body.email);
  const password = v.str(ctx.body.password, 'password', { max: 100 });
  const user = await one('SELECT * FROM users WHERE email = ?', [email]);
  if (!user || !verifyPassword(password, user.password)) {
    await log(ctx, 'LOGIN_FAILED', `Failed login for ${email}`);
    throw new HttpError(401, 'Wrong email or password');
  }
  if (user.status === 'BLOCKED') throw new HttpError(403, 'This account is blocked. Contact support.');
  if (user.status === 'INACTIVE') throw new HttpError(403, 'This account is deactivated.');
  ctx.user = user;
  await log(ctx, 'LOGIN', `${user.role} logged in`);
  return { token: issueToken(user.user_id), user: { user_id: user.user_id, name: user.name, email: user.email, role: user.role } };
});

route('POST', '/api/auth/logout', async (ctx) => {
  await log(ctx, 'LOGOUT', 'Logged out');
}, { roles: ANY });

route('GET', '/api/auth/me', async (ctx) => ({ user: ctx.user }), { roles: ANY });

route('GET', '/api/areas', async () => q("SELECT area_id, area_name, city FROM service_areas WHERE status = 'ACTIVE' ORDER BY area_name"));

// estimate for every active vehicle type, with how many matching drivers are free right now
route('GET', '/api/rides/search', async (ctx) => {
  const from = v.num(ctx.query.from, 'from', { int: true, min: 1 });
  const to = v.num(ctx.query.to, 'to', { int: true, min: 1 });
  if (from === to) throw new HttpError(400, 'Pickup and destination must be different');
  const areas = await q("SELECT * FROM service_areas WHERE area_id IN (?, ?) AND status = 'ACTIVE'", [from, to]);
  const a = areas.find((x) => x.area_id === from);
  const b = areas.find((x) => x.area_id === to);
  if (!a || !b) throw new HttpError(404, 'We do not serve one of these areas');
  const settings = await getSettings();
  const { km, minutes } = tripEstimate(a, b, settings);
  const surge = Number(settings.surge_multiplier || 1);
  const rules = await q("SELECT * FROM fare_rules WHERE status = 'ACTIVE' ORDER BY base_fare");
  const free = await q(
    `SELECT v.vehicle_type, COUNT(DISTINCT d.driver_id) AS n
     FROM driver_profiles d JOIN users u ON u.user_id = d.user_id
     JOIN vehicles v ON v.driver_id = d.driver_id AND v.status = 'ACTIVE'
     WHERE d.availability = 'ONLINE' AND d.verification_status = 'APPROVED' AND u.status = 'ACTIVE'
       AND NOT EXISTS (SELECT 1 FROM trips t WHERE t.driver_id = d.driver_id AND t.trip_status IN ('ACCEPTED','STARTED'))
     GROUP BY v.vehicle_type`,
  );
  const freeBy = Object.fromEntries(free.map((f) => [f.vehicle_type, f.n]));
  return {
    pickup: a.area_name,
    destination: b.area_name,
    km,
    minutes,
    surge,
    maintenance_mode: settings.maintenance_mode === 'true',
    options: rules.map((r) => ({
      vehicle_type: r.vehicle_type,
      base_fare: r.base_fare,
      per_km_rate: r.per_km_rate,
      per_minute_rate: r.per_minute_rate,
      cancellation_fee: r.cancellation_fee,
      estimated_fare: fareFor(r, km, minutes, { surge }),
      drivers_available: freeBy[r.vehicle_type] || 0,
    })),
  };
});

module.exports = { ANY };
