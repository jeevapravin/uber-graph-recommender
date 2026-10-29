// Online Cab Booking System: node:http server for the REST API and the static pages.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { HttpError, match, readBody, sendJson } = require('./src/http');
const { currentUser, authorize } = require('./src/auth');
const { seed } = require('./src/seed');

for (const r of ['public', 'profile', 'common', 'passenger', 'driver', 'admin', 'superadmin']) require(`./src/routes/${r}`);

const PUBLIC_DIR = path.join(__dirname, '..', 'frontend');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

const gzipCache = new Map(); // shortcut: unbounded, fine for a fixed set of static files

function serveStatic(pathname, req, res) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return sendJson(res, 400, { error: 'Bad URL' }); // a malformed %-escape used to crash the whole server
  }
  const file = path.normalize(path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : decoded));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return sendJson(res, 403, { error: 'Forbidden' });
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end('<h1>404 Not Found</h1><p><a href="/">Home</a></p>');
    }
    const type = MIME[path.extname(file)] || 'application/octet-stream';
    if (/text|svg|json/.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
      const key = `${file}:${data.length}`;
      if (!gzipCache.has(key)) gzipCache.set(key, zlib.gzipSync(data));
      res.writeHead(200, { 'Content-Type': type, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' });
      return res.end(gzipCache.get(key));
    }
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  });
}

async function handleApi(req, res, url) {
  const found = match(req.method, url.pathname);
  if (found === 'METHOD') throw new HttpError(405, 'Method not allowed');
  if (!found) throw new HttpError(404, 'No such API endpoint');
  const { route, params } = found;
  const ctx = {
    req,
    params,
    query: Object.fromEntries(url.searchParams),
    ip: (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim(),
    user: await currentUser(req),
  };
  if (route.roles) authorize(ctx.user, route.roles, route.perm);
  ctx.body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : {};
  const result = await route.handler(ctx);
  if (result && result.csv !== undefined) {
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${result.filename}"` });
    return res.end(result.csv);
  }
  sendJson(res, req.method === 'POST' && result && result.created ? 201 : 200, result ?? { ok: true });
}

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Method not allowed' });
      return serveStatic(url.pathname, req, res);
    }
    await handleApi(req, res, url);
  } catch (err) {
    if (res.headersSent) return res.destroy();
    if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message });
    if (err.code === 'ER_DUP_ENTRY') return sendJson(res, 409, { error: 'That record already exists' });
    if (err.code === 'ER_ROW_IS_REFERENCED_2') return sendJson(res, 409, { error: 'This record is in use by other records' });
    if (err.code === 'ER_CHECK_CONSTRAINT_VIOLATED') return sendJson(res, 400, { error: 'A value breaks a database rule' });
    console.error(req.method, req.url, err);
    sendJson(res, 500, { error: 'Something went wrong on the server' });
  }
});

const PORT = Number(process.env.PORT || 3000);

// the DB container may still be starting: retry the seed for ~60 s before giving up
(async function start(tries = 30) {
  try {
    await seed();
  } catch (err) {
    if (tries <= 1) throw err;
    console.log('waiting for database...', err.code || err.message);
    await new Promise((r) => setTimeout(r, 2000));
    return start(tries - 1);
  }
  server.listen(PORT, () => console.log(`Cab booking running on http://localhost:${PORT}`));
})();
