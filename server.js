const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Store, summarize } = require('./store');
const { fetchActors } = require('./apify');

const PORT = Number(process.env.PORT || 3010);
const DATA_FILE = process.env.DATA_FILE || path.join(os.homedir(), '.income-dashboard', 'db.json');
const APIFY_TOKEN = process.env.APIFY_TOKEN || '';
const REFRESH_MS = 15 * 60 * 1000;
const PUBLIC = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

const store = new Store(DATA_FILE);
let apify = { username: null, actors: [], refreshedAt: null, error: APIFY_TOKEN ? null : 'APIFY_TOKEN not set' };

async function refreshApify() {
  if (!APIFY_TOKEN) return;
  try {
    apify = { ...(await fetchActors(APIFY_TOKEN)), refreshedAt: new Date().toISOString(), error: null };
  } catch (err) {
    apify = { ...apify, error: err.message };
  }
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 1e5) reject(new Error('Body too large'));
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('Invalid JSON')); }
    });
  });
}

function snapshot() {
  return { ...store.state, summary: summarize(store.state), apify };
}

async function api(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean).slice(1);
  const [resource, id] = parts;
  if (req.method === 'GET' && resource === 'data') return send(res, 200, snapshot());
  if (req.method === 'POST' && resource === 'refresh') { await refreshApify(); return send(res, 200, snapshot()); }
  const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : {};
  if (resource === 'goal' && req.method === 'PUT') store.setGoal(body);
  else if (resource === 'streams' && req.method === 'POST') store.addStream(body);
  else if (resource === 'streams' && req.method === 'DELETE' && id) store.removeStream(id);
  else if (resource === 'entries' && req.method === 'POST') store.addEntry(body);
  else if (resource === 'entries' && req.method === 'PATCH' && id) store.updateEntry(id, body);
  else if (resource === 'entries' && req.method === 'DELETE' && id) store.removeEntry(id);
  else return send(res, 404, { error: 'Not found' });
  return send(res, 200, snapshot());
}

function serveStatic(res, pathname) {
  const file = path.normalize(path.join(PUBLIC, pathname === '/' ? 'index.html' : pathname));
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); return res.end('Not found');
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    return serveStatic(res, url.pathname);
  } catch (err) {
    return send(res, 400, { error: err.message });
  }
});

refreshApify();
setInterval(refreshApify, REFRESH_MS);
server.listen(PORT, () => console.log(`income-dashboard on :${PORT}, data at ${DATA_FILE}`));
