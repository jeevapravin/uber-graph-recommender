// Passwords (scrypt), signed bearer tokens (HMAC), the current user, permissions, logs and settings.
const crypto = require('node:crypto');
const { q, one } = require('./db');
const { HttpError } = require('./http');

const SECRET = process.env.APP_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.APP_SECRET) console.warn('APP_SECRET not set: using a random one, logins reset on restart');
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;

const PERMISSIONS = ['MANAGE_PASSENGERS', 'MANAGE_DRIVERS', 'MANAGE_VEHICLES', 'MANAGE_TRIPS', 'MANAGE_FARES', 'VIEW_REPORTS', 'VIEW_LOGS'];

function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(plain, salt, 64).toString('hex')}`;
}

function verifyPassword(plain, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const a = Buffer.from(hash, 'hex');
  const b = crypto.scryptSync(plain, salt, 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const b64 = (s) => Buffer.from(s).toString('base64url');
const sign = (data) => crypto.createHmac('sha256', SECRET).update(data).digest('base64url');

function issueToken(userId) {
  const payload = b64(JSON.stringify({ uid: userId, exp: Date.now() + TOKEN_TTL_MS }));
  return `${payload}.${sign(payload)}`;
}

function readToken(header) {
  const m = /^Bearer (.+)\.(.+)$/.exec(header || '');
  if (!m) return null;
  const expected = Buffer.from(sign(m[1]));
  const given = Buffer.from(m[2]);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(m[1], 'base64url').toString());
    return data.exp > Date.now() ? data.uid : null;
  } catch {
    return null;
  }
}

// the role and status are read fresh on every request, so blocking someone takes effect at once
async function currentUser(req) {
  const uid = readToken(req.headers.authorization);
  if (!uid) return null;
  const user = await one('SELECT user_id, name, email, mobile, role, status FROM users WHERE user_id = ?', [uid]);
  if (!user || user.status !== 'ACTIVE') return null;
  user.permissions =
    user.role === 'SUPER_ADMIN'
      ? PERMISSIONS
      : user.role === 'ADMIN'
        ? (await q('SELECT permission_name FROM admin_permissions WHERE admin_id = ?', [uid])).map((r) => r.permission_name)
        : [];
  return user;
}

// roles: allowed roles; a SUPER_ADMIN can use every ADMIN route. perm: required admin permission.
function authorize(user, roles, perm) {
  if (!user) throw new HttpError(401, 'Please log in');
  const allowed = roles.includes(user.role) || (user.role === 'SUPER_ADMIN' && roles.includes('ADMIN'));
  if (!allowed) throw new HttpError(403, 'Your role cannot do this');
  if (perm && !user.permissions.includes(perm)) throw new HttpError(403, `Missing permission ${perm}`);
}

function requirePerm(user, perm) {
  if (!user.permissions.includes(perm)) throw new HttpError(403, `Missing permission ${perm}`);
}

async function log(ctx, action, description = '') {
  try {
    await q('INSERT INTO system_logs (user_id, action, description, ip_address) VALUES (?, ?, ?, ?)', [
      ctx.user ? ctx.user.user_id : null,
      action,
      String(description).slice(0, 500),
      ctx.ip,
    ]);
  } catch (err) {
    console.error('log failed', err.message); // a failed log must never fail the request
  }
}

async function getSettings() {
  const rows = await q('SELECT setting_key, setting_value FROM system_settings');
  return Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value]));
}

module.exports = { PERMISSIONS, hashPassword, verifyPassword, issueToken, currentUser, authorize, requirePerm, log, getSettings };
