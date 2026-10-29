// Super Admin: administrators, their permissions, full system logs and system settings.
const { route, v, HttpError, toCsv } = require('../http');
const { q, one, tx } = require('../db');
const { PERMISSIONS, hashPassword, log } = require('../auth');
const { logs } = require('./admin');

const S = { roles: ['SUPER_ADMIN'] };

const permList = (val) => {
  if (!Array.isArray(val)) throw new HttpError(400, 'permissions must be a list');
  return [...new Set(val.map((p) => v.oneOf(p, 'permission', PERMISSIONS)))];
};

async function setPerms(conn, adminId, perms) {
  await q('DELETE FROM admin_permissions WHERE admin_id = ?', [adminId], conn);
  if (perms.length) await q('INSERT INTO admin_permissions (admin_id, permission_name) VALUES ?', [perms.map((p) => [adminId, p])], conn);
}

async function adminRow(id) {
  const a = await one("SELECT user_id FROM users WHERE user_id = ? AND role = 'ADMIN'", [id]);
  if (!a) throw new HttpError(404, 'Administrator not found');
  return a;
}

route('GET', '/api/superadmin/permissions', async () => PERMISSIONS, S);

route('GET', '/api/superadmin/admins', async () => {
  const rows = await q(
    `SELECT u.user_id, u.name, u.email, u.mobile, u.status, u.created_at,
            GROUP_CONCAT(p.permission_name ORDER BY p.permission_name) AS permissions,
            (SELECT MAX(created_at) FROM system_logs l WHERE l.user_id = u.user_id AND l.action = 'LOGIN') AS last_login
     FROM users u LEFT JOIN admin_permissions p ON p.admin_id = u.user_id
     WHERE u.role = 'ADMIN' GROUP BY u.user_id ORDER BY u.user_id`,
  );
  return rows.map((r) => ({ ...r, permissions: r.permissions ? r.permissions.split(',') : [] }));
}, S);

route('POST', '/api/superadmin/admins', async (ctx) => {
  const b = ctx.body;
  const user = [v.str(b.name, 'name', { min: 2, max: 100 }), v.email(b.email), hashPassword(v.password(b.password)), v.mobile(b.mobile)];
  const perms = permList(b.permissions || []);
  if (await one('SELECT 1 FROM users WHERE email = ?', [user[1]])) throw new HttpError(409, 'An account with this email already exists');
  const id = await tx(async (c) => {
    const r = await q("INSERT INTO users (name, email, password, mobile, role) VALUES (?, ?, ?, ?, 'ADMIN')", user, c);
    await setPerms(c, r.insertId, perms);
    return r.insertId;
  });
  await log(ctx, 'ADMIN_CREATE', `Created admin ${user[1]} with ${perms.length} permissions`);
  return { created: true, user_id: id };
}, S);

route('PUT', '/api/superadmin/admins/:id', async (ctx) => {
  const a = await adminRow(ctx.params.id);
  const b = ctx.body;
  const name = v.str(b.name, 'name', { min: 2, max: 100 });
  const mobile = v.mobile(b.mobile);
  const status = v.oneOf(b.status, 'status', ['ACTIVE', 'INACTIVE']);
  await q('UPDATE users SET name = ?, mobile = ?, status = ? WHERE user_id = ?', [name, mobile, status, a.user_id]);
  if (b.password) await q('UPDATE users SET password = ? WHERE user_id = ?', [hashPassword(v.password(b.password)), a.user_id]);
  await log(ctx, 'ADMIN_UPDATE', `Admin #${a.user_id} updated (${status})`);
  return { message: 'Administrator saved' };
}, S);

route('DELETE', '/api/superadmin/admins/:id', async (ctx) => {
  const a = await adminRow(ctx.params.id);
  await q('DELETE FROM users WHERE user_id = ?', [a.user_id]); // permissions cascade; logs keep a NULL user
  await log(ctx, 'ADMIN_DELETE', `Deleted admin #${a.user_id}`);
  return { message: 'Administrator deleted' };
}, S);

route('PUT', '/api/superadmin/admins/:id/permissions', async (ctx) => {
  const a = await adminRow(ctx.params.id);
  const perms = permList(ctx.body.permissions);
  await tx((c) => setPerms(c, a.user_id, perms));
  await log(ctx, 'PERMISSIONS', `Admin #${a.user_id}: ${perms.join(', ') || 'none'}`);
  return { message: 'Permissions saved', permissions: perms };
}, S);

route('GET', '/api/superadmin/logs', async (ctx) => {
  const rows = await logs(ctx.query, false);
  if (ctx.query.format === 'csv') return { csv: toCsv(rows), filename: 'system_logs.csv' };
  return rows;
}, S);

// each setting has a validator, so a typo can't break fare maths or the site
const SETTING_RULES = {
  app_name: (x) => v.str(x, 'app_name', { min: 2, max: 40 }),
  avg_speed_kmph: (x) => String(v.num(x, 'avg_speed_kmph', { min: 5, max: 120 })),
  road_factor: (x) => String(v.num(x, 'road_factor', { min: 1, max: 3 })),
  platform_commission_pct: (x) => String(v.num(x, 'platform_commission_pct', { min: 0, max: 50 })),
  surge_multiplier: (x) => String(v.num(x, 'surge_multiplier', { min: 1, max: 3 })),
  allow_registrations: (x) => v.oneOf(String(x), 'allow_registrations', ['true', 'false']),
  maintenance_mode: (x) => v.oneOf(String(x), 'maintenance_mode', ['true', 'false']),
};

route('PUT', '/api/superadmin/settings', async (ctx) => {
  const input = ctx.body.settings;
  if (!input || typeof input !== 'object') throw new HttpError(400, 'settings must be an object');
  const clean = Object.entries(input).map(([k, val]) => {
    if (!SETTING_RULES[k]) throw new HttpError(400, `Unknown setting ${k}`);
    return [k, SETTING_RULES[k](val)];
  });
  await tx(async (c) => {
    for (const [k, val] of clean) await q('UPDATE system_settings SET setting_value = ? WHERE setting_key = ?', [val, k], c);
  });
  await log(ctx, 'SETTINGS', clean.map(([k, val]) => `${k}=${val}`).join(', '));
  return { message: 'Settings saved' };
}, S);
