// Every role manages its own profile and password.
const { route, v, HttpError } = require('../http');
const { q, one, tx } = require('../db');
const { hashPassword, verifyPassword, log } = require('../auth');
const { ANY } = require('./public');

route('GET', '/api/profile', async (ctx) => {
  const u = ctx.user;
  const profile =
    u.role === 'PASSENGER'
      ? await one('SELECT default_address, emergency_contact FROM passenger_profiles WHERE user_id = ?', [u.user_id])
      : u.role === 'DRIVER'
        ? await one('SELECT license_no, license_expiry, verification_status, rating, availability FROM driver_profiles WHERE user_id = ?', [u.user_id])
        : null;
  const created = await one('SELECT created_at FROM users WHERE user_id = ?', [u.user_id]);
  return { ...u, ...created, profile };
}, { roles: ANY });

route('PUT', '/api/profile', async (ctx) => {
  const b = ctx.body;
  const u = ctx.user;
  const name = v.str(b.name, 'name', { min: 2, max: 100 });
  const mobile = v.mobile(b.mobile);
  await tx(async (c) => {
    await q('UPDATE users SET name = ?, mobile = ? WHERE user_id = ?', [name, mobile, u.user_id], c);
    if (u.role === 'PASSENGER') {
      await q('UPDATE passenger_profiles SET default_address = ?, emergency_contact = ? WHERE user_id = ?', [v.str(b.default_address, 'default_address', { optional: true }), v.mobile(b.emergency_contact, 'emergency_contact', true), u.user_id], c);
    }
    if (u.role === 'DRIVER') {
      const expiry = v.date(b.license_expiry, 'license_expiry');
      if (new Date(expiry) <= new Date()) throw new HttpError(400, 'Driving licence has expired');
      await q('UPDATE driver_profiles SET license_no = ?, license_expiry = ? WHERE user_id = ?', [v.str(b.license_no, 'license_no', { min: 5, max: 30 }).toUpperCase(), expiry, u.user_id], c);
    }
  });
  await log(ctx, 'PROFILE_UPDATE', 'Updated own profile');
  return { message: 'Profile saved' };
}, { roles: ANY });

route('PUT', '/api/profile/password', async (ctx) => {
  const row = await one('SELECT password FROM users WHERE user_id = ?', [ctx.user.user_id]);
  if (!verifyPassword(String(ctx.body.current_password || ''), row.password)) throw new HttpError(400, 'Current password is wrong');
  const next = v.password(ctx.body.new_password, 'new_password');
  await q('UPDATE users SET password = ? WHERE user_id = ?', [hashPassword(next), ctx.user.user_id]);
  await log(ctx, 'PASSWORD_CHANGE', 'Changed own password');
  return { message: 'Password changed' };
}, { roles: ANY });
