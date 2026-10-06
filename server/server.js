/* ==========================================================
   🐚  Serveur de la petite sirène — remplace Firebase
   Node ≥ 22.13, zéro dépendance (node:sqlite).

   - Sert le site (index.html, css/, js/) et l'API /api/*
   - Chaque visiteur reçoit une identité anonyme (cookie) :
     c'est ce qui permet de savoir qui a déjà joué.
   - Le capitaine se connecte avec ADMIN_EMAIL / mot de passe.

   Mêmes règles de confidentialité que firestore.rules :
   - pronostics complets : leur auteur et le capitaine,
     puis tout le monde après la naissance
   - réponses anonymes   : ceux qui ont joué et le capitaine
   - mots doux           : leur auteur et le capitaine

   Variables d'environnement :
     ADMIN_EMAIL          email du capitaine
     ADMIN_PASSWORD_HASH  empreinte du mot de passe, générée avec :
                            node server.js hash-password
     DATA_DIR             dossier de la base (défaut : server/data)
     PORT                 défaut : 3000
   ========================================================== */
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

/* ---------------- Outil : empreinte du mot de passe ---------------- */
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 32);
  return `scrypt:${salt.toString('base64')}:${hash.toString('base64')}`;
}
function checkPassword(password, stored) {
  const [algo, salt, hash] = String(stored).split(':');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const got = crypto.scryptSync(String(password), Buffer.from(salt, 'base64'), expected.length);
  return crypto.timingSafeEqual(got, expected);
}
if (process.argv[2] === 'hash-password') {
  const input = fs.readFileSync(0, 'utf8').replace(/\r?\n$/, '');
  if (!input) {
    console.error('Usage : echo "mot de passe" | node server.js hash-password');
    process.exit(1);
  }
  console.log(hashPassword(input));
  process.exit(0);
}

const { DatabaseSync } = require('node:sqlite');

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PUBLIC_DIR = process.env.PUBLIC_DIR || path.join(__dirname, '..');
const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || '';
const ADMIN_SESSION_MS = 30 * 24 * 3600 * 1000;
const MAX_PREDICTIONS_PER_PLAYER = 5;
const MAX_BODY = 16 * 1024;

const DEFAULT_STATE = { open: true, born: false, result: null, deadline: 0 };
const ANSWER_FIELDS = ['avatar', 'date', 'time', 'weight', 'height', 'hair', 'looks', 'papaWhere', 'mamanWhere', 'babyName', 'createdAt'];
const PREDICTION_FIELDS = ['name', 'avatar', 'date', 'time', 'weight', 'height', 'hair', 'looks', 'papaWhere', 'mamanWhere', 'babyName'];
const pick = (o, keys) => keys.reduce((a, k) => (o[k] !== undefined && (a[k] = o[k]), a), {});

/* ---------------- Base de données ---------------- */
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'ocean.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS predictions (
    id TEXT PRIMARY KEY,
    uid TEXT NOT NULL,
    data TEXT NOT NULL,
    message TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  -- Ancienne version (un code par appareil) : lue seulement pour la migration
  CREATE TABLE IF NOT EXISTS recovery (
    uid TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    token TEXT NOT NULL
  );
  -- Un code de bouteille par joueur (= par pronostic)
  CREATE TABLE IF NOT EXISTS codes (
    prediction_id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE
  );
  -- Quels pronostics chaque appareil peut voir : ceux qu'il a lancés
  -- et ceux retrouvés avec un code
  CREATE TABLE IF NOT EXISTS links (
    uid TEXT NOT NULL,
    prediction_id TEXT NOT NULL,
    PRIMARY KEY (uid, prediction_id)
  );
`);
const q = {
  allPredictions: db.prepare('SELECT * FROM predictions ORDER BY created_at'),
  countByUid: db.prepare('SELECT COUNT(*) AS n FROM predictions WHERE uid = ?'),
  insert: db.prepare('INSERT INTO predictions (id, uid, data, message, created_at) VALUES (?, ?, ?, ?, ?)'),
  remove: db.prepare('DELETE FROM predictions WHERE id = ?'),
  removeCode: db.prepare('DELETE FROM codes WHERE prediction_id = ?'),
  removeLinks: db.prepare('DELETE FROM links WHERE prediction_id = ?'),
  getMeta: db.prepare('SELECT value FROM meta WHERE key = ?'),
  setMeta: db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
  oldCodeByUid: db.prepare('SELECT code FROM recovery WHERE uid = ?'),
  allCodes: db.prepare('SELECT prediction_id, code FROM codes'),
  byCode: db.prepare('SELECT prediction_id FROM codes WHERE code = ?'),
  insertCode: db.prepare('INSERT OR IGNORE INTO codes (prediction_id, code) VALUES (?, ?)'),
  linksByUid: db.prepare('SELECT prediction_id FROM links WHERE uid = ?'),
  link: db.prepare('INSERT OR IGNORE INTO links (uid, prediction_id) VALUES (?, ?)'),
};

// Codes lisibles à l'oral : pas de 0/O ni de 1/I/L
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const normalizeCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
function newCode(predictionId) {
  for (;;) {
    const bytes = crypto.randomBytes(8);
    const code = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
    if (q.insertCode.run(predictionId, code).changes) return code;
  }
}
const formatCode = (c) => c.slice(0, 4) + '-' + c.slice(4);

// Migration depuis « un code par appareil » : le 1er pronostic de chaque
// appareil garde l'ancien code, les suivants reçoivent un nouveau code.
// Sans effet une fois faite.
{
  const codes = new Map(q.allCodes.all().map((r) => [r.prediction_id, r.code]));
  const used = new Set(codes.values());
  for (const p of q.allPredictions.all()) {
    q.link.run(p.uid, p.id);
    if (codes.has(p.id)) continue;
    const old = q.oldCodeByUid.get(p.uid)?.code;
    if (old && !used.has(old) && q.insertCode.run(p.id, old).changes) used.add(old);
    else used.add(newCode(p.id));
  }
}

// Secret de signature des cookies, créé une fois et conservé avec la base
let SECRET = q.getMeta.get('secret')?.value;
if (!SECRET) {
  SECRET = crypto.randomBytes(32).toString('base64url');
  q.setMeta.run('secret', SECRET);
}
const hmac = (s) => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');

function getState() {
  const row = q.getMeta.get('state');
  return Object.assign({}, DEFAULT_STATE, row ? JSON.parse(row.value) : {});
}
// Change à chaque écriture : sert d'ETag pour que les navigateurs
// ne retéléchargent les données que si elles ont bougé.
let version = Date.now();

function votingOpen(state) {
  return state.open !== false && state.born !== true && (!state.deadline || Date.now() < state.deadline);
}

/* ---------------- Identité & session capitaine ---------------- */
function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function cookie(name, value, maxAgeSec) {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSec}; HttpOnly; Secure; SameSite=Lax`;
}
// Le cookie contient un jeton secret ; on n'expose jamais que son empreinte
// (uid public), sinon n'importe qui pourrait se faire passer pour un autre joueur.
function identify(req, res) {
  const cookies = parseCookies(req);
  let token = cookies.ocean_id;
  if (!token || !/^[A-Za-z0-9_-]{20,64}$/.test(token)) {
    token = crypto.randomBytes(24).toString('base64url');
    res.setHeader('Set-Cookie', [cookie('ocean_id', token, 2 * 365 * 24 * 3600)]);
  }
  const uid = 'u' + hmac('uid:' + token).slice(0, 22);
  let isAdmin = false;
  const adm = cookies.ocean_admin;
  if (adm && ADMIN_EMAIL) {
    const [exp, sig] = adm.split('.');
    const expected = hmac('admin:' + ADMIN_EMAIL + ':' + exp);
    isAdmin = Number(exp) > Date.now() && !!sig && sig.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  }
  const me = { uid, isAdmin, email: isAdmin ? ADMIN_EMAIL : null };
  // Le jeton n'est jamais renvoyé au navigateur (propriété non sérialisée)
  Object.defineProperty(me, 'token', { value: token });
  return me;
}
function appendCookie(res, value) {
  const prev = res.getHeader('Set-Cookie') || [];
  res.setHeader('Set-Cookie', [].concat(prev, value));
}

// Anti force brute sur la connexion capitaine : 5 essais / 15 min par IP
const attempts = new Map();
function clientIp(req) {
  // Traefik ajoute la vraie IP en dernier dans X-Forwarded-For
  const xff = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
  return xff[xff.length - 1] || req.socket.remoteAddress || '?';
}
function tooManyAttempts(ip, kind = 'login', max = 5) {
  const key = kind + ':' + ip;
  const now = Date.now();
  const a = attempts.get(key);
  if (!a || a.reset < now) {
    attempts.set(key, { n: 1, reset: now + 15 * 60 * 1000 });
    return false;
  }
  a.n += 1;
  return a.n > max;
}

/* ---------------- Validation (comme firestore.rules) ---------------- */
const str = (v, min, max) => typeof v === 'string' && v.length >= min && v.length <= max;
const num = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
function validPrediction(p) {
  return str(p.name, 1, 40) &&
    str(p.avatar, 1, 16) &&
    typeof p.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.date) &&
    typeof p.time === 'string' && /^\d{2}:\d{2}$/.test(p.time) &&
    num(p.weight, 1000, 6000) &&
    num(p.height, 30, 65) &&
    str(p.hair, 1, 20) &&
    str(p.looks, 1, 20) &&
    str(p.papaWhere, 1, 20) &&
    str(p.mamanWhere, 1, 20) &&
    str(p.babyName ?? '', 0, 30);
}
function validStatePatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return false;
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'open' || k === 'born') { if (typeof v !== 'boolean') return false; }
    else if (k === 'deadline') { if (!num(v, 0, 8.64e15)) return false; }
    else if (k === 'parents') { if (!str(v, 1, 60)) return false; }
    else if (k === 'dueDate') { if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(Date.parse(v))) return false; }
    else if (k === 'result') { if (v !== null && (typeof v !== 'object' || JSON.stringify(v).length > 4000)) return false; }
    else return false;
  }
  return true;
}

/* ---------------- Ce que chacun a le droit de voir ---------------- */
// Capitaine uniquement : le code de bouteille de chaque joueur, pour
// pouvoir le lui renvoyer s'il l'a perdu
function withCodes(preds) {
  const codes = new Map(q.allCodes.all().map((r) => [r.prediction_id, formatCode(r.code)]));
  return preds.map((p) => Object.assign({}, p, { code: codes.get(p.id) || '' }));
}
function snapshot(me) {
  const state = getState();
  const rows = q.allPredictions.all();
  const preds = rows.map((r) => Object.assign({ id: r.id }, JSON.parse(r.data), { uid: r.uid, createdAt: r.created_at }));
  const mineIds = new Set(q.linksByUid.all(me.uid).map((r) => r.prediction_id));
  // Ses propres bouteilles, chacune avec son code
  const mine = withCodes(preds.filter((p) => mineIds.has(p.id)));
  const canSeeAnswers = me.isAdmin || state.born || mine.length > 0;
  const messages = rows
    .filter((r) => r.message && (me.isAdmin || mineIds.has(r.id)))
    .map((r) => {
      const d = JSON.parse(r.data);
      return { id: r.id, uid: r.uid, name: d.name, avatar: d.avatar, text: r.message, createdAt: r.created_at };
    });
  return {
    me,
    state,
    voters: [...new Set(preds.map((p) => p.uid))],
    mine,
    messages,
    answers: canSeeAnswers ? preds.map((p) => Object.assign({ id: p.id }, pick(p, ANSWER_FIELDS))) : undefined,
    predictions: me.isAdmin ? withCodes(preds) : state.born ? preds : undefined,
  };
}

/* ---------------- HTTP ---------------- */
function send(res, status, body, headers = {}) {
  const data = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, headers));
  res.end(data);
}
const fail = (res, status, error) => send(res, status, { error });

function readJson(req) {
  return new Promise((resolve, reject) => {
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) return reject(Object.assign(new Error('JSON attendu'), { status: 415 }));
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Requête trop grosse'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (e) {
        reject(Object.assign(new Error('JSON invalide'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

async function api(req, res, url) {
  const me = identify(req, res);
  const route = req.method + ' ' + url.pathname;

  if (route === 'GET /api/health') return send(res, 200, { ok: true });

  if (route === 'GET /api/snapshot') {
    const etag = `W/"${version}-${me.uid}-${me.isAdmin ? 1 : 0}"`;
    if (req.headers['if-none-match'] === etag) return send(res, 304, undefined, { ETag: etag });
    return send(res, 200, snapshot(me), { ETag: etag });
  }

  if (route === 'POST /api/predictions') {
    const body = await readJson(req);
    const state = getState();
    if (!votingOpen(state)) return fail(res, 403, 'Les pronostics sont fermés');
    const p = pick(body.prediction || {}, PREDICTION_FIELDS);
    p.babyName = p.babyName ?? '';
    if (!validPrediction(p)) return fail(res, 400, 'Pronostic invalide');
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (message.length > 280) return fail(res, 400, 'Mot doux trop long');
    if (q.countByUid.get(me.uid).n >= MAX_PREDICTIONS_PER_PLAYER) return fail(res, 429, 'Trop de pronostics depuis cet appareil');
    const id = 'p' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
    q.insert.run(id, me.uid, JSON.stringify(p), message || null, Date.now());
    q.link.run(me.uid, id);
    const code = newCode(id);
    version++;
    return send(res, 201, { id, code: formatCode(code) });
  }

  if (req.method === 'DELETE' && url.pathname.startsWith('/api/predictions/')) {
    if (!me.isAdmin) return fail(res, 403, 'Réservé au capitaine');
    const id = decodeURIComponent(url.pathname.slice('/api/predictions/'.length));
    q.remove.run(id);
    q.removeCode.run(id);
    q.removeLinks.run(id);
    version++;
    return send(res, 200, { ok: true });
  }

  if (route === 'PATCH /api/state') {
    if (!me.isAdmin) return fail(res, 403, 'Réservé au capitaine');
    const patch = await readJson(req);
    if (!validStatePatch(patch)) return fail(res, 400, 'Modification invalide');
    q.setMeta.run('state', JSON.stringify(Object.assign(getState(), patch)));
    version++;
    return send(res, 200, getState());
  }

  if (route === 'POST /api/login') {
    if (tooManyAttempts(clientIp(req))) return fail(res, 429, 'Trop de tentatives, réessaie dans 15 minutes');
    const { email, password } = await readJson(req);
    const ok = ADMIN_EMAIL && ADMIN_PASSWORD_HASH &&
      String(email || '').trim().toLowerCase() === ADMIN_EMAIL &&
      checkPassword(password || '', ADMIN_PASSWORD_HASH);
    if (!ok) return fail(res, 401, 'Identifiants incorrects');
    attempts.delete('login:' + clientIp(req));
    const exp = Date.now() + ADMIN_SESSION_MS;
    appendCookie(res, cookie('ocean_admin', `${exp}.${hmac('admin:' + ADMIN_EMAIL + ':' + exp)}`, ADMIN_SESSION_MS / 1000));
    return send(res, 200, { ok: true });
  }

  if (route === 'POST /api/recover') {
    if (tooManyAttempts(clientIp(req), 'recover', 10)) return fail(res, 429, 'Trop de tentatives, réessaie dans 15 minutes');
    const { code } = await readJson(req);
    const row = q.byCode.get(normalizeCode(code));
    if (!row) return fail(res, 404, 'Code inconnu');
    // L'appareil garde son identité et gagne l'accès à cette bouteille
    q.link.run(me.uid, row.prediction_id);
    version++;
    return send(res, 200, { ok: true });
  }

  if (route === 'POST /api/logout') {
    appendCookie(res, cookie('ocean_admin', '', 0));
    return send(res, 200, { ok: true });
  }

  return fail(res, 404, 'Introuvable');
}

/* ---------------- Fichiers du site ---------------- */
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};
function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/' || p === '/stats') p = '/index.html';
  if (p === '/stats/') {
    res.writeHead(301, { Location: '/stats' });
    return res.end();
  }
  // Seuls index.html, css/ et js/ sont publics (pas server/, .git…)
  if (!(p === '/index.html' || p.startsWith('/css/') || p.startsWith('/js/'))) return notFound(res);
  const file = path.join(PUBLIC_DIR, path.normalize(p));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return notFound(res);
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return notFound(res);
    const lastModified = st.mtime.toUTCString();
    const headers = {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'Last-Modified': lastModified,
    };
    if (req.headers['if-modified-since'] === lastModified) {
      res.writeHead(304, headers);
      return res.end();
    }
    res.writeHead(200, Object.assign(headers, { 'Content-Length': st.size }));
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}
function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Introuvable');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return notFound(res);
    serveStatic(req, res, url);
  } catch (e) {
    if (!e.status) console.error(e);
    if (!res.headersSent) fail(res, e.status || 500, e.status ? e.message : 'Erreur serveur');
  }
});

server.listen(PORT, () => {
  console.log(`🐚 Petite sirène en écoute sur :${PORT}`);
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD_HASH) console.warn('⚠ ADMIN_EMAIL / ADMIN_PASSWORD_HASH absents : espace capitaine désactivé.');
});
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    server.close();
    server.closeAllConnections();
    db.close();
    process.exit(0);
  });
}
