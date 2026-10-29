// Tiny router + request helpers on top of node:http (no Express).
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const routes = [];

// path params are always numeric ids, e.g. /api/driver/trips/:id/start
function route(method, path, handler, opts = {}) {
  const keys = [];
  const re = new RegExp('^' + path.replace(/:(\w+)/g, (_, k) => (keys.push(k), '(\\d+)')) + '$');
  routes.push({ method, re, keys, handler, roles: opts.roles, perm: opts.perm });
}

function match(method, pathname) {
  let pathFound = false;
  for (const r of routes) {
    const m = r.re.exec(pathname);
    if (!m) continue;
    pathFound = true;
    if (r.method !== method) continue;
    const params = {};
    r.keys.forEach((k, i) => (params[k] = Number(m[i + 1])));
    return { route: r, params };
  }
  return pathFound ? 'METHOD' : null;
}

function readBody(req, limit = 1e6) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, 'Request body too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolve(body && typeof body === 'object' && !Array.isArray(body) ? body : {});
      } catch {
        reject(new HttpError(400, 'Body must be valid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

// ---- validation at the trust boundary: each helper returns the clean value or throws 400 ----
const bad = (msg) => {
  throw new HttpError(400, msg);
};

const v = {
  str(val, field, { min = 1, max = 255, optional = false } = {}) {
    if (val === undefined || val === null || val === '') {
      if (optional) return null;
      bad(`${field} is required`);
    }
    if (typeof val !== 'string' && typeof val !== 'number') bad(`${field} must be text`);
    const s = String(val).trim();
    if (s.length < min || s.length > max) bad(`${field} must be ${min}-${max} characters`);
    return s;
  },
  email(val) {
    const s = v.str(val, 'email', { max: 150 }).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) bad('email is not valid');
    return s;
  },
  mobile(val, field = 'mobile', optional = false) {
    const s = v.str(val, field, { min: 10, max: 10, optional });
    if (s !== null && !/^[0-9]{10}$/.test(s)) bad(`${field} must be 10 digits`);
    return s;
  },
  password(val, field = 'password') {
    if (typeof val !== 'string' || val.length < 6 || val.length > 100) bad(`${field} must be 6-100 characters`);
    return val;
  },
  num(val, field, { min = -Infinity, max = Infinity, int = false } = {}) {
    const n = Number(val);
    if (val === '' || val === null || val === undefined || !Number.isFinite(n)) bad(`${field} must be a number`);
    if (int && !Number.isInteger(n)) bad(`${field} must be a whole number`);
    if (n < min || n > max) bad(`${field} must be between ${min} and ${max}`);
    return n;
  },
  oneOf(val, field, allowed) {
    if (!allowed.includes(val)) bad(`${field} must be one of ${allowed.join(', ')}`);
    return val;
  },
  date(val, field, optional = false) {
    if ((val === undefined || val === null || val === '') && optional) return null;
    if (typeof val !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(val) || isNaN(Date.parse(val))) bad(`${field} must be a date (YYYY-MM-DD)`);
    return val;
  },
};

// rows -> CSV text; cells starting with = + - @ are prefixed so spreadsheets don't run them as formulas
function toCsv(rows) {
  if (!rows.length) return '';
  const cell = (x) => {
    let s = x === null || x === undefined ? '' : typeof x === 'object' ? JSON.stringify(x) : String(x);
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const keys = Object.keys(rows[0]);
  return [keys.join(','), ...rows.map((r) => keys.map((k) => cell(r[k])).join(','))].join('\n');
}

module.exports = { HttpError, route, match, readBody, sendJson, v, toCsv };
