const http = require('http');
// lightweight fetch using built-in http/https
const https = require('https');
function fetch(url, opts={}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const body = opts.body || null;
    const headers = opts.headers || {};
    const req = lib.request(u, { method: opts.method || 'GET', headers }, (res) => {
      let data='';
      res.on('data', c=>data+=c);
      res.on('end', ()=> resolve({ status: res.statusCode, text: async () => data, json: async () => JSON.parse(data) }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function startFakeUpstream() {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ method: req.method, path: req.url, body }));
    });
  });
  return new Promise(resolve => server.listen(0, () => resolve(server)));
}

async function run() {
  const upstream = await startFakeUpstream();
  const upstreamPort = upstream.address().port;
  process.env.UPSTREAM_URL = `http://localhost:${upstreamPort}`;
  process.env.DEBUG_FAKE_USER = '1';

  // require gateway after env is set so UPSTREAM is picked up
  const { createApp } = require('../index');
  const app = createApp();
  const server = app.listen(0);
  const port = server.address().port;

  console.log('Upstream on', upstreamPort, 'gateway on', port);

  // Admin should be allowed to POST to lock
  const adminUser = { uid: 'a', role: 'admin' };
  const nonAdminUser = { uid: 'b', role: 'student' };

  const adminResp = await fetch(`http://localhost:${port}/api/teams/123/lock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-User': JSON.stringify(adminUser) },
    body: JSON.stringify({ action: 'lock' })
  });
  console.log('admin status', adminResp.status);
  if (adminResp.status >= 400) throw new Error('Admin request blocked');

  const nonAdminResp = await fetch(`http://localhost:${port}/api/teams/123/lock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-User': JSON.stringify(nonAdminUser) },
    body: JSON.stringify({ action: 'lock' })
  });
  console.log('non-admin status', nonAdminResp.status);
  if (nonAdminResp.status !== 403) throw new Error('Non-admin request should be 403');

  // Non-lock endpoint should pass through
  const readResp = await fetch(`http://localhost:${port}/api/teams/123/members`, { method: 'GET' });
  console.log('read status', readResp.status);
  if (readResp.status >= 400) throw new Error('Read request blocked');

  console.log('All tests passed');
  server.close();
  upstream.close();
}

run().catch(err => {
  console.error('Tests failed:', err);
  process.exit(1);
});
