/**
 * GL Bajaj Attendance System — v7.2 (Security Edition)
 * FIX: demo creds production me hidden · first-run admin setup wizard
 * Rotating QR · Geo-fence · Face · Parent Portal · Marks · Register · Certificate · RFID
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let DatabaseSync;
try { ({ DatabaseSync } = require('node:sqlite')); }
catch { console.error(`❌ node:sqlite needs Node 22.5+ (you have ${process.version})`); process.exit(1); }

let mailer = null;
try {
  if (process.env.SMTP_HOST) {
    const nd = require('nodemailer');
    mailer = nd.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === '1', auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined });
  }
} catch { console.log('  ℹ️ nodemailer nahi hai — emails console mode me.'); }

const app = express();
const BASE_PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'glbajaj-attendance.db');
const VALID_STATUSES = ['present', 'late', 'absent'];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const EDIT_LOCK_MS = 24 * 3600 * 1000;
const CAMPUS = { lat: Number(process.env.GL_CAMPUS_LAT || 28.4702), lng: Number(process.env.GL_CAMPUS_LNG || 77.6718), radius: Number(process.env.GL_CAMPUS_RADIUS || 800) };

const PROGRAMS = {
  'B.Tech': { sems: 8, branches: ['CSE','CSE (Artificial Intelligence)','CSE (Data Science)','CSE (Artificial Intelligence and Machine Learning)','Computer Science and Information Technology','CSE (in Hindi)','Electronics and Communication Engineering','Electrical and Computer Engineering','Mechanical Engineering'] },
  'BCA': { sems: 6, branches: ['General'] }, 'BBA': { sems: 6, branches: ['General'] },
  'MCA': { sems: 4, branches: ['General'] }, 'MBA': { sems: 4, branches: ['General'] },
  'PGDM': { sems: 6, branches: ['General'] },
  'M.Tech': { sems: 4, branches: ['CSE','Electronics and Communication Engineering','Mechanical Engineering'] },
};

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'selfies'), { recursive: true });
const db = new DatabaseSync(DB_FILE);

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, role TEXT NOT NULL, name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
  program TEXT DEFAULT '', branch TEXT DEFAULT '', semester INTEGER, section TEXT DEFAULT '',
  roll_no TEXT DEFAULT '', email TEXT DEFAULT '', subjects TEXT DEFAULT '[]',
  face TEXT DEFAULT '', card_id TEXT DEFAULT '', parent_of TEXT DEFAULT '',
  twofa INTEGER DEFAULT 0, created_at TEXT
);
CREATE TABLE IF NOT EXISTS records (
  id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL,
  program TEXT NOT NULL, branch TEXT DEFAULT '', semester INTEGER NOT NULL, section TEXT DEFAULT '',
  subject TEXT NOT NULL, teacher_id TEXT, note TEXT DEFAULT '', created_at TEXT
);
CREATE TABLE IF NOT EXISTS entries ( id INTEGER PRIMARY KEY AUTOINCREMENT, record_id INTEGER NOT NULL, student_id TEXT NOT NULL, status TEXT NOT NULL );
CREATE INDEX IF NOT EXISTS idx_entries_student ON entries(student_id);
CREATE TABLE IF NOT EXISTS sessions ( token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT NOT NULL );
CREATE TABLE IF NOT EXISTS announcements ( id TEXT PRIMARY KEY, title TEXT, body TEXT, ts TEXT, by TEXT );
CREATE TABLE IF NOT EXISTS audit ( id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, action TEXT, who TEXT, detail TEXT );
CREATE TABLE IF NOT EXISTS timetable ( id INTEGER PRIMARY KEY AUTOINCREMENT, program TEXT, branch TEXT, semester INTEGER, section TEXT DEFAULT '', day TEXT NOT NULL, period INTEGER NOT NULL, subject TEXT NOT NULL, teacher_id TEXT DEFAULT '' );
CREATE TABLE IF NOT EXISTS leaves ( id INTEGER PRIMARY KEY AUTOINCREMENT, student_id TEXT NOT NULL, date TEXT NOT NULL, type TEXT DEFAULT 'casual', reason TEXT DEFAULT '', status TEXT DEFAULT 'pending', decided_by TEXT DEFAULT '', ts TEXT );
CREATE TABLE IF NOT EXISTS corrections ( id INTEGER PRIMARY KEY AUTOINCREMENT, student_id TEXT NOT NULL, entry_id INTEGER NOT NULL, requested TEXT NOT NULL, reason TEXT DEFAULT '', status TEXT DEFAULT 'pending', decided_by TEXT DEFAULT '', ts TEXT );
CREATE TABLE IF NOT EXISTS marks ( id INTEGER PRIMARY KEY AUTOINCREMENT, student_id TEXT NOT NULL, subject TEXT NOT NULL, exam TEXT NOT NULL, score REAL NOT NULL, max REAL NOT NULL, ts TEXT );
CREATE TABLE IF NOT EXISTS certs ( id TEXT PRIMARY KEY, student_id TEXT, name TEXT, roll TEXT, program TEXT, branch TEXT, semester INTEGER, pct INTEGER, total INTEGER, present INTEGER, late INTEGER, absent INTEGER, created_at TEXT );
CREATE TABLE IF NOT EXISTS settings ( key TEXT PRIMARY KEY, value TEXT );
CREATE TABLE IF NOT EXISTS holidays ( date TEXT PRIMARY KEY, title TEXT );
`);
db.exec(`CREATE TABLE IF NOT EXISTS markcodes ( id TEXT PRIMARY KEY, secret TEXT, teacher_id TEXT, program TEXT, branch TEXT, semester INTEGER, section TEXT DEFAULT '', subject TEXT, date TEXT, geo TEXT DEFAULT '', expires_at INTEGER );
CREATE TABLE IF NOT EXISTS selfmarks ( id INTEGER PRIMARY KEY AUTOINCREMENT, session TEXT, student_id TEXT, device TEXT, ip TEXT, flagged INTEGER DEFAULT 0, ts TEXT );
CREATE TABLE IF NOT EXISTS otps ( username TEXT PRIMARY KEY, code TEXT, expires_at INTEGER, attempts INTEGER DEFAULT 0 );`);
const safeAlter = (sql) => { try { db.exec(sql); } catch {} };
safeAlter(`ALTER TABLE users ADD COLUMN section TEXT DEFAULT ''`);
safeAlter(`ALTER TABLE users ADD COLUMN email TEXT DEFAULT ''`);
safeAlter(`ALTER TABLE users ADD COLUMN twofa INTEGER DEFAULT 0`);
safeAlter(`ALTER TABLE records ADD COLUMN section TEXT DEFAULT ''`);
safeAlter(`ALTER TABLE users ADD COLUMN face TEXT DEFAULT ''`);
safeAlter(`ALTER TABLE users ADD COLUMN card_id TEXT DEFAULT ''`);
safeAlter(`ALTER TABLE users ADD COLUMN parent_of TEXT DEFAULT ''`);

/* ---------------- passwords ---------------- */
function hashPassword(pw) { const salt = crypto.randomBytes(16).toString('hex'); return `${salt}:${crypto.scryptSync(String(pw), salt, 64).toString('hex')}`; }
function verifyPassword(pw, stored) {
  const [salt, hash] = String(stored || '').split(':'); if (!salt || !hash) return false;
  const h = crypto.scryptSync(String(pw), salt, 64), hb = Buffer.from(hash, 'hex');
  return hb.length === h.length && crypto.timingSafeEqual(h, hb);
}

/* ---------------- mail / geo / misc ---------------- */
async function sendMail(to, subject, text) {
  if (!to) return false;
  if (!mailer) { console.log(`  📧 [console] to=${to} | ${subject}`); return false; }
  try { await mailer.sendMail({ from: process.env.SMTP_FROM || 'GLBITM Attendance <no-reply@glbitm.ac.in>', to, subject, text }); return true; }
  catch (e) { console.log('  ✉️ mail error:', e.message); return false; }
}
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000, r = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * r / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lng2 - lng1) * r / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}
const nowISO = () => new Date().toISOString();
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
const todayStamp = () => daysAgo(0);
function csvEscape(v) { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
function sendCSV(res, filename, rows) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('\uFEFF' + rows.map((r) => r.map(csvEscape).join(',')).join('\r\n'));
}
function parseSubjectList(input) { const a = typeof input === 'string' ? input.split(',') : Array.isArray(input) ? input : []; return [...new Set(a.map((s) => String(s).trim()).filter(Boolean))]; }
function rotCode(secret, win) {
  const h = crypto.createHmac('sha256', secret).update(String(win)).digest();
  return String(((h[0] << 24 | h[1] << 16 | h[2] << 8 | h[3]) >>> 0) % 1000000).padStart(6, '0');
}
const classLabel = (u) => `${u.program || '—'}${u.branch && u.branch !== 'General' ? ' · ' + u.branch : ''}`;

/* ---------------- seed / migrate ---------------- */
const insUser = db.prepare(`INSERT OR IGNORE INTO users (id, role, name, username, password_hash, program, branch, semester, section, roll_no, email, subjects, face, card_id, parent_of, twofa, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const insRec = db.prepare(`INSERT INTO records (date, program, branch, semester, section, subject, teacher_id, note, created_at) VALUES (?,?,?,?,?,?,?,?,?)`);
const insEntry = db.prepare(`INSERT INTO entries (record_id, student_id, status) VALUES (?,?,?)`);

function migrateLegacyJSON() {
  let users = [], records = [];
  try { users = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'users.json'), 'utf-8')).users || []; } catch {}
  try { records = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'attendance.json'), 'utf-8')).records || []; } catch {}
  if (!users.length) return false;
  console.log('  🔄 JSON → SQLite migrate...');
  for (const u of users)
    insUser.run(u.id, u.role, u.name, u.username, hashPassword(u.password), u.program || 'B.Tech', u.branch || '', u.semester ?? null, '', u.rollNo || '', u.email || '', JSON.stringify(u.subjects || []), '', '', '', 0, nowISO());
  for (const r of records) {
    const info = insRec.run(r.date, r.program || 'B.Tech', r.branch || '', Number(r.semester), '', r.subject, r.teacherId || null, r.note || '', nowISO());
    for (const e of r.entries || []) insEntry.run(Number(info.lastInsertRowid), e.studentId, e.status);
  }
  return true;
}
function seedIfEmpty() {
  if (db.prepare('SELECT COUNT(*) AS c FROM users').get().c > 0) return;
  /* v7.3: demo data sirf SEED_DEMO=1 pe — production fresh+empty rahega, wizard dikhega */
  if (process.env.SEED_DEMO !== '1') {
    console.log('  ℹ️ DB khaali — demo seed off (SEED_DEMO=1 se on hota hai). Setup wizard se pehla admin banao.');
    return;
  }
  if (migrateLegacyJSON()) { console.log('  ✅ migration done.'); return; }
  console.log('  🆕 Fresh DB — GL Bajaj demo data seed kar raha hoon...');
  const users = [
    ['A1','admin','Dr. Meera Kapoor','admin','admin123','','',null,'','','meera@glbitm.ac.in','[]','','','','0'],
    ['T1','teacher','Prof. Arjun Rao','arjun','teach123','B.Tech','CSE',null,'','','arjun@glbitm.ac.in','["Data Structures","DBMS","Operating Systems"]','','','','0'],
    ['T2','teacher','Prof. Neha Verma','neha','teach123','B.Tech','Electronics and Communication Engineering',null,'','','neha@glbitm.ac.in','["Digital Electronics","Signals & Systems"]','','','','0'],
    ['S1','student','Riya Sharma','riya','stud123','B.Tech','CSE',3,'A','2301641520001','riya@student.glbitm.ac.in','[]','','CARD-001','','0'],
    ['S2','student','Aman Gupta','aman','stud123','B.Tech','CSE',3,'A','2301641520002','aman@student.glbitm.ac.in','[]','','','','0'],
    ['S3','student','Sara Khan','sara','stud123','B.Tech','CSE',3,'B','2301641520003','','[]','','','','0'],
    ['S4','student','Dev Patel','dev','stud123','B.Tech','CSE (Artificial Intelligence)',5,'A','2301641020009','','[]','','','','0'],
    ['S5','student','Ishita Nair','ishita','stud123','B.Tech','Electronics and Communication Engineering',3,'A','2301641510011','','[]','','','','0'],
    ['S6','student','Priya Singh','priya','stud123','B.Tech','CSE (Data Science)',3,'A','2301641530012','','[]','','','','0'],
    ['S7','student','Kabir Khan','kabir','stud123','BCA','General',1,'A','2401642010017','','[]','','','','0'],
    ['S8','student','Nikhil Raj','nikhil','stud123','MBA','General',1,'A','2501644010023','','[]','','','','0'],
  ];
  for (const u of users) {
    const [id, role, name, un, pw] = u;
    insUser.run(id, role, name, un, hashPassword(pw), ...u.slice(5, 12), u[12] ?? '', u[13] ?? '', u[14] ?? '', 0, nowISO());
  }
  const recs = [
    [daysAgo(3),'B.Tech','CSE',3,'A','Data Structures','T1','Arrays & Big-O',[['S1','present'],['S2','present'],['S3','absent'],['S6','present']]],
    [daysAgo(2),'B.Tech','CSE',3,'A','Data Structures','T1','Linked Lists',[['S1','late'],['S2','absent'],['S3','present'],['S6','present']]],
    [daysAgo(1),'B.Tech','CSE',3,'A','DBMS','T1','',[['S1','absent'],['S2','present'],['S3','present'],['S6','late']]],
    [daysAgo(0),'B.Tech','CSE',3,'A','Operating Systems','T1','',[['S1','present'],['S2','present'],['S3','late'],['S6','present']]],
    [daysAgo(2),'B.Tech','Electronics and Communication Engineering',3,'A','Digital Electronics','T2','',[['S5','present']]],
    [daysAgo(1),'BCA','General',1,'A','Business Accounting','T1','',[['S7','present']]],
    [daysAgo(3),'MBA','General',1,'A','Organisational Behaviour','T2','',[['S8','present']]],
  ];
  for (const [date, prog, br, sem, sec, sub, tid, note, entries] of recs) {
    const info = insRec.run(date, prog, br, sem, sec, sub, tid, note, nowISO());
    for (const [sid, st] of entries) insEntry.run(Number(info.lastInsertRowid), sid, st);
  }
  const tt = db.prepare(`INSERT INTO timetable (program, branch, semester, section, day, period, subject, teacher_id) VALUES (?,?,?,?,?,?,?,?)`);
  [['Data Structures',1,'T1'],['DBMS',3,'T1'],['Operating Systems',5,'T1']].forEach(([sub, per, tid]) => { for (const d of ['Monday','Wednesday','Friday']) tt.run('B.Tech','CSE',3,'A',d,per,sub,tid); });
  const mk = db.prepare(`INSERT INTO marks (student_id, subject, exam, score, max, ts) VALUES (?,?,?,?,?,?)`);
  mk.run('S1','Data Structures','MST-1','28','30',nowISO()); mk.run('S1','DBMS','MST-1','24','30',nowISO());
  mk.run('S2','Data Structures','MST-1','22','30',nowISO()); mk.run('S2','DBMS','MST-1','25','30',nowISO());
  mk.run('S3','Data Structures','MST-1','26','30',nowISO()); mk.run('S6','Data Structures','MST-1','29','30',nowISO());
}
seedIfEmpty();

/* self-heal: agar kisi purane seed ne raw password store kiya tha */
for (const u of db.prepare('SELECT id, password_hash FROM users').all()) {
  if (u.password_hash && !String(u.password_hash).includes(':')) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(u.password_hash), u.id);
    console.log(`  🔧 ${u.id}: raw password → hashed (self-heal)`);
  }
}

/* ---------------- helpers ---------------- */
const getUsers = () => db.prepare('SELECT * FROM users ORDER BY role, name').all();
function publicUser(u) {
  if (!u) return null;
  let subjects = []; try { subjects = JSON.parse(u.subjects || '[]'); } catch {}
  return { id: u.id, role: u.role, name: u.name, username: u.username, program: u.program || '', branch: u.branch || '', semester: u.semester ?? null, section: u.section || '', rollNo: u.roll_no || '', email: u.email || '', subjects, hasFace: !!u.face, cardId: u.card_id || '', parentOf: u.parent_of || '', twofa: !!u.twofa };
}
function addAudit(action, who, detail = '') { db.prepare('INSERT INTO audit (ts, action, who, detail) VALUES (?,?,?,?)').run(nowISO(), action, who, String(detail).slice(0, 200)); }
const getSetting = (k, d) => { const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(k); return r ? r.value : d; };
const getThreshold = () => { const v = Number(getSetting('threshold', 75)); return v >= 40 && v <= 95 ? v : 75; };
function getHolidaySet() { return new Set(db.prepare('SELECT date FROM holidays').all().map((h) => h.date)); }

/* ---------------- auth ---------------- */
const SESSION_DAYS = 7;
const fails = new Map();
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const sess = token ? db.prepare('SELECT * FROM sessions WHERE token = ?').get(token) : null;
  if (!sess || sess.expires_at <= nowISO()) {
    if (sess) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(sess.user_id);
  if (!user) return res.status(401).json({ error: 'Session expired.' });
  req.token = token; req.user = user; next();
}
const requireRole = (...roles) => (req, res, next) => { if (!roles.includes(req.user.role)) return res.status(403).json({ error: `Access denied. (${roles.join(' or ')} only)` }); next(); };

app.use(express.json({ limit: '4mb' }));
app.use(express.static(path.join(__dirname, 'public')));

/* ================= FIRST-RUN SETUP WIZARD =================
   Pehla admin khud bana sakta hai — sirf jab tak koi admin na ho.
   Uske baad ye route hamesha 403 dega. (WordPress-style first-run) */
app.get('/api/setup/status', (req, res) => {
  const { c } = db.prepare(`SELECT COUNT(*) AS c FROM users WHERE role = 'admin'`).get();
  res.json({ needsSetup: c === 0, canShowDemo: process.env.SHOW_DEMO_HINTS === '1' });
});
app.post('/api/setup/admin', (req, res) => {
  const { c } = db.prepare(`SELECT COUNT(*) AS c FROM users WHERE role = 'admin'`).get();
  if (c > 0) return res.status(403).json({ error: 'Setup already completed — admin exists. Naya admin existing admin hi bana sakta hai.' });
  const { name, username, password, email } = req.body || {};
  if (!name || !username || !password) return res.status(400).json({ error: 'Name, username, password required.' });
  if (String(password).length < 8) return res.status(400).json({ error: 'Admin password min 8 characters ka rakho.' });
  const un = String(username).trim().toLowerCase();
  if (db.prepare('SELECT id FROM users WHERE username = ?').get(un)) return res.status(409).json({ error: 'Username taken.' });
  const id = 'A' + Date.now().toString(36).toUpperCase();
  insUser.run(id, 'admin', String(name).trim(), un, hashPassword(password), '', '', null, '', '', String(email || '').trim(), '[]', '', '', '', 0, nowISO());
  addAudit('SETUP_ADMIN', un, 'first admin created via setup wizard');
  res.status(201).json({ ok: true, message: 'Admin created! Ab login karo.' });
});

/* ================= AUTH ROUTES ================= */
app.post('/api/login', async (req, res) => {
  const ip = req.socket.remoteAddress || 'unknown';
  const e = fails.get(ip);
  if (e && e.until > Date.now()) return res.status(429).json({ error: `Locked ${Math.ceil((e.until - Date.now()) / 60000)} more minute(s).` });
  const { username, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username || '').trim().toLowerCase());
  if (!user || !verifyPassword(password || '', user.password_hash)) {
    const n = (e && e.until <= Date.now() ? 0 : (e ? e.n : 0)) + 1;
    if (n >= 5) { fails.set(ip, { n: 0, until: Date.now() + 15 * 60 * 1000 }); addAudit('LOCKED', String(username || '?'), ip); } else fails.set(ip, { n, until: 0 });
    addAudit('LOGIN_FAIL', String(username || '?'), ip);
    return res.status(401).json({ error: 'Invalid username or password.' });
  }
  fails.delete(ip);
  if (user.twofa) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    db.prepare('INSERT OR REPLACE INTO otps (username, code, expires_at, attempts) VALUES (?,?,?,0)').run(user.username, code, Date.now() + 5 * 60 * 1000);
    const emailed = await sendMail(user.email, 'GLBITM Login OTP', `Your OTP: ${code} (5 min)`);
    return res.json({ need2fa: true, username: user.username, devCode: emailed ? undefined : code });
  }
  finishLogin(user, ip, res);
});
function finishLogin(user, ip, res) {
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?,?,?)').run(token, user.id, new Date(Date.now() + SESSION_DAYS * 86400000).toISOString());
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(nowISO());
  addAudit('LOGIN_OK', user.username, `ip ${ip} (${user.role})`);
  res.json({ token, user: publicUser(user) });
}
app.post('/api/login/verify', (req, res) => {
  const { username, code } = req.body || {};
  const row = db.prepare('SELECT * FROM otps WHERE username = ?').get(String(username || '').toLowerCase());
  if (!row || row.expires_at < Date.now()) return res.status(400).json({ error: 'OTP expire — dobara login karo.' });
  if (row.attempts >= 5) return res.status(429).json({ error: 'Too many wrong OTPs.' });
  if (String(code).trim() !== row.code) { db.prepare('UPDATE otps SET attempts = attempts + 1 WHERE username = ?').run(row.username); return res.status(401).json({ error: 'Galat OTP.' }); }
  db.prepare('DELETE FROM otps WHERE username = ?').run(row.username);
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(row.username);
  if (!user) return res.status(401).json({ error: 'User not found.' });
  finishLogin(user, req.socket.remoteAddress || 'x', res);
});
app.post('/api/logout', requireAuth, (req, res) => { addAudit('LOGOUT', req.user.username); db.prepare('DELETE FROM sessions WHERE token = ?').run(req.token); res.json({ ok: true }); });
app.get('/api/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));
app.post('/api/me/password', requireAuth, (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!verifyPassword(oldPassword || '', req.user.password_hash)) return res.status(400).json({ error: 'Current password galat hai.' });
  if (!newPassword || String(newPassword).length < 4) return res.status(400).json({ error: 'Min 4 characters.' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), req.user.id);
  addAudit('CHANGE_PW', req.user.username); res.json({ ok: true, message: 'Password changed.' });
});
app.post('/api/me/twofa', requireAuth, (req, res) => {
  const on = req.body && req.body.on ? 1 : 0;
  db.prepare('UPDATE users SET twofa = ? WHERE id = ?').run(on, req.user.id);
  res.json({ ok: true, twofa: !!on, message: on ? '2FA ON — OTP email/console pe.' : '2FA OFF.' });
});
app.post('/api/me/face', requireAuth, (req, res) => {
  const b = req.body || {};
  if (b.clear) { db.prepare('UPDATE users SET face = ? WHERE id = ?').run('', req.user.id); addAudit('FACE_DEL', req.user.username); return res.json({ ok: true, message: 'Face data removed.' }); }
  const d = b.descriptor;
  if (!Array.isArray(d) || d.length !== 128 || d.some((x) => typeof x !== 'number' || !Number.isFinite(x)))
    return res.status(400).json({ error: 'Invalid face descriptor.' });
  db.prepare('UPDATE users SET face = ? WHERE id = ?').run(JSON.stringify(d), req.user.id);
  addAudit('FACE_REG', req.user.username);
  res.json({ ok: true, message: 'Face registered ✅ — ab self-mark par face match hoga.' });
});
app.get('/health', (req, res) => res.json({ ok: true, uptime: process.uptime() }));

/* ================= SETTINGS & HOLIDAYS ================= */
app.get('/api/settings', requireAuth, (req, res) => res.json({ threshold: getThreshold() }));
app.patch('/api/admin/settings', requireAuth, requireRole('admin'), (req, res) => {
  const t = Number((req.body || {}).threshold);
  if (!Number.isFinite(t) || t < 40 || t > 95) return res.status(400).json({ error: 'Threshold 40–95 ke beech rakho.' });
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)').run('threshold', String(t));
  addAudit('SETTINGS', req.user.username, `threshold=${t}`);
  res.json({ ok: true, threshold: t, message: `Threshold set to ${t}%.` });
});
app.get('/api/holidays', requireAuth, (req, res) => res.json({ items: db.prepare('SELECT * FROM holidays ORDER BY date').all() }));
app.post('/api/holidays', requireAuth, requireRole('admin'), (req, res) => {
  const date = String((req.body || {}).date || ''), title = String((req.body || {}).title || 'Holiday').slice(0, 80);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Valid date chuno.' });
  db.prepare('INSERT OR REPLACE INTO holidays (date, title) VALUES (?,?)').run(date, title);
  addAudit('HOLIDAY_ADD', req.user.username, `${date} ${title}`);
  res.status(201).json({ ok: true });
});
app.delete('/api/holidays/:date', requireAuth, requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM holidays WHERE date = ?').run(req.params.date);
  addAudit('HOLIDAY_DEL', req.user.username, req.params.date);
  res.json({ ok: true });
});

/* ================= ADMIN: users ================= */
app.get('/api/users', requireAuth, requireRole('admin'), (req, res) => {
  let users = getUsers().map(publicUser);
  if (req.query.role) users = users.filter((u) => u.role === req.query.role);
  res.json({ users });
});
app.post('/api/users', requireAuth, requireRole('admin'), (req, res) => {
  const { role, name, username, password, program, branch, semester, rollNo, section, email, parentOf } = req.body || {};
  const un = String(username || '').trim().toLowerCase();
  if (!['student', 'teacher', 'parent'].includes(role)) return res.status(400).json({ error: 'Invalid role.' });
  if (!un || !password) return res.status(400).json({ error: 'Username aur password required.' });
  if (db.prepare('SELECT id FROM users WHERE username = ?').get(un)) return res.status(409).json({ error: 'Username already taken.' });

  const id = role[0].toUpperCase() + Date.now().toString(36).toUpperCase();
  if (role === 'parent') {
    const child = db.prepare('SELECT * FROM users WHERE id = ? AND role = ?').get(String(parentOf || ''), 'student');
    if (!child) return res.status(400).json({ error: 'Valid student select karo jiska parent bana hai.' });
    insUser.run(id, 'parent', `Parent of ${child.name}`, un, hashPassword(password), '', '', null, '', '', String(email || '').trim(), '[]', '', '', child.id, 0, nowISO());
    addAudit('USER_ADD', req.user.username, `parent "${un}" → ${child.username}`);
    return res.status(201).json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)) });
  }
  if (!name || !program || !PROGRAMS[program]) return res.status(400).json({ error: 'Name aur valid program required.' });
  if (role === 'student') {
    if (!PROGRAMS[program].branches.includes(branch)) return res.status(400).json({ error: 'Invalid branch.' });
    const s = Number(semester);
    if (!s || s < 1 || s > PROGRAMS[program].sems) return res.status(400).json({ error: `Semester 1–${PROGRAMS[program].sems}.` });
  }
  insUser.run(id, role, String(name).trim(), un, hashPassword(password), program,
    role === 'student' ? branch : String(branch || '').trim(),
    role === 'student' ? Number(semester) : null, String(section || '').trim().toUpperCase(),
    role === 'student' ? String(rollNo || '').trim() : '', String(email || '').trim(),
    JSON.stringify(role === 'teacher' ? parseSubjectList(req.body.subjects) : []),
    '', String(req.body.cardId || '').trim().toUpperCase(), '', 0, nowISO());
  addAudit('USER_ADD', req.user.username, `${role} "${un}" (${program})`);
  res.status(201).json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)) });
});
app.post('/api/users/bulk', requireAuth, requireRole('admin'), (req, res) => {
  const list = Array.isArray(req.body && req.body.students) ? req.body.students : [];
  if (!list.length) return res.status(400).json({ error: 'Koi row nahi mili.' });
  let added = 0, skipped = 0; const errors = [];
  list.forEach((s, i) => {
    const row = i + 2;
    const name = String(s.name || '').trim(), un = String(s.username || '').trim().toLowerCase();
    const program = PROGRAMS[s.program] ? s.program : null;
    const branch = String(s.branch || '').trim(), sem = Number(s.semester), pw = String(s.password || '');
    if (!name || !un || !pw || !program) { errors.push(`Row ${row}: invalid fields`); return; }
    if (!PROGRAMS[program].branches.includes(branch)) { errors.push(`Row ${row}: invalid branch`); return; }
    if (!sem || sem < 1 || sem > PROGRAMS[program].sems) { errors.push(`Row ${row}: semester range`); return; }
    if (db.prepare('SELECT id FROM users WHERE username = ?').get(un)) { skipped++; return; }
    insUser.run('S' + Date.now().toString(36).toUpperCase() + i, 'student', name, un, hashPassword(pw), program, branch, sem, String(s.section || '').toUpperCase(), String(s.rollNo || '').trim(), String(s.email || '').trim(), '[]', '', '', '', 0, nowISO());
    added++;
  });
  addAudit('USER_BULK', req.user.username, `${added} added`);
  res.json({ ok: true, added, skipped, errors: errors.slice(0, 10), message: `${added} added · ${skipped} skipped · ${errors.length} invalid.` });
});
app.post('/api/admin/promote', requireAuth, requireRole('admin'), (req, res) => {
  const program = String((req.body || {}).program || '');
  if (program && !PROGRAMS[program]) return res.status(400).json({ error: 'Invalid program.' });
  const info = program
    ? db.prepare('UPDATE users SET semester = semester + 1 WHERE role = ? AND program = ? AND semester < ?').run('student', program, PROGRAMS[program].sems)
    : db.prepare(`UPDATE users SET semester = semester + 1 WHERE role = 'student' AND semester < (CASE program ${Object.entries(PROGRAMS).map(([p, v]) => `WHEN '${p}' THEN ${v.sems}`).join(' ')} END)`).run();
  addAudit('PROMOTE', req.user.username, `${info.changes} students`);
  res.json({ ok: true, message: `${info.changes} students promoted. 🎓` });
});
app.patch('/api/users/:id', requireAuth, requireRole('admin'), (req, res) => {
  const b = req.body || {};
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'User not found.' });
  const sets = [], vals = [];
  const prog = b.program || row.program;
  const put = (col, val) => { sets.push(`${col}=?`); vals.push(val); };
  if ('name' in b && String(b.name).trim()) put('name', String(b.name).trim());
  if ('program' in b) { if (!PROGRAMS[b.program]) return res.status(400).json({ error: 'Invalid program.' }); put('program', b.program); }
  if ('branch' in b) { if (!PROGRAMS[prog] || !PROGRAMS[prog].branches.includes(b.branch)) return res.status(400).json({ error: 'Invalid branch.' }); put('branch', b.branch); }
  if ('semester' in b) { const s = Number(b.semester); if (PROGRAMS[prog] && (s < 1 || s > PROGRAMS[prog].sems)) return res.status(400).json({ error: 'Semester range galat.' }); put('semester', s); }
  if ('section' in b) put('section', String(b.section || '').trim().toUpperCase());
  if ('email' in b) put('email', String(b.email || '').trim());
  if ('rollNo' in b) put('roll_no', String(b.rollNo || '').trim());
  if ('cardId' in b) put('card_id', String(b.cardId || '').trim().toUpperCase());
  if ('subjects' in b) { if (row.role !== 'teacher') return res.status(400).json({ error: 'Teachers only.' }); put('subjects', JSON.stringify(parseSubjectList(b.subjects))); }
  if ('password' in b) { const p = String(b.password || ''); if (p.length < 4) return res.status(400).json({ error: 'Min 4 chars.' }); put('password_hash', hashPassword(p)); }
  if ('twofa' in b) put('twofa', b.twofa ? 1 : 0);
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update.' });
  vals.push(row.id);
  db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  addAudit('USER_EDIT', req.user.username, row.username);
  res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(row.id)) });
});
app.delete('/api/users/:id', requireAuth, requireRole('admin'), (req, res) => {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'User not found.' });
  if (row.role === 'admin') return res.status(400).json({ error: 'Admin cannot be removed.' });
  db.prepare('DELETE FROM entries WHERE student_id = ?').run(row.id);
  db.prepare('DELETE FROM marks WHERE student_id = ?').run(row.id);
  db.prepare('DELETE FROM leaves WHERE student_id = ?').run(row.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(row.id);
  addAudit('USER_DEL', req.user.username, row.username);
  res.json({ ok: true, removedId: row.id });
});

/* ================= TEACHER: roster & attendance ================= */
app.get('/api/students', requireAuth, requireRole('teacher', 'admin'), (req, res) => {
  let sql = `SELECT * FROM users WHERE role = 'student'`; const params = [];
  if (req.query.program) { sql += ' AND program = ?'; params.push(req.query.program); }
  if (req.query.branch) { sql += ' AND branch = ?'; params.push(req.query.branch); }
  if (req.query.semester) { sql += ' AND semester = ?'; params.push(Number(req.query.semester)); }
  if (req.query.section) { sql += ' AND section = ?'; params.push(String(req.query.section).toUpperCase()); }
  sql += ' ORDER BY roll_no, name';
  res.json({ students: db.prepare(sql).all(...params).map(publicUser) });
});
app.get('/api/attendance/class', requireAuth, requireRole('teacher', 'admin'), (req, res) => {
  const rec = db.prepare(`SELECT * FROM records WHERE date=? AND program=? AND branch=? AND semester=? AND section=? AND subject=?`)
    .get(String(req.query.date), String(req.query.program), String(req.query.branch || ''), Number(req.query.semester), String(req.query.section || ''), String(req.query.subject));
  if (!rec) return res.json({ record: null, locked: false, note: '' });
  res.json({ record: { ...rec, entries: db.prepare('SELECT student_id AS studentId, status FROM entries WHERE record_id = ?').all(rec.id) }, locked: Date.now() - Date.parse(rec.created_at) > EDIT_LOCK_MS });
});
app.post('/api/attendance', requireAuth, requireRole('teacher', 'admin'), (req, res) => {
  const { date } = req.body || {};
  const program = String((req.body || {}).program || '').trim();
  const branch = String((req.body || {}).branch || '').trim();
  const section = String((req.body || {}).section || '').trim().toUpperCase();
  const semester = Number((req.body || {}).semester);
  const subject = String((req.body || {}).subject || '').trim();
  const note = String((req.body || {}).note || '').slice(0, 200);
  if (!date || !program || !semester || !subject) return res.status(400).json({ error: 'Program, semester, subject, date required.' });
  const assigned = Array.isArray(req.user.subjects) ? req.user.subjects.filter(Boolean) : [];
  if (assigned.length && !assigned.includes(subject)) return res.status(403).json({ error: `"${subject}" tumhara subject nahi. Yours: ${assigned.join(', ')}.` });
  if (!Array.isArray(req.body.entries) || !req.body.entries.length) return res.status(400).json({ error: 'No entries.' });
  const clean = req.body.entries.filter((e) => e && e.studentId && VALID_STATUSES.includes(e.status)).map((e) => ({ studentId: e.studentId, status: e.status }));
  if (!clean.length) return res.status(400).json({ error: 'Entries need studentId + status.' });

  const old = db.prepare(`SELECT * FROM records WHERE date=? AND program=? AND branch=? AND semester=? AND section=? AND subject=?`).get(date, program, branch, semester, section, subject);
  if (old && Date.now() - Date.parse(old.created_at) > EDIT_LOCK_MS && req.user.role !== 'admin')
    return res.status(403).json({ error: '🔒 24h+ purana session — edit lock hai. Admin se contact karo.' });
  if (old) { db.prepare('DELETE FROM entries WHERE record_id = ?').run(old.id); db.prepare('DELETE FROM records WHERE id = ?').run(old.id); if (req.user.role === 'admin') addAudit('ATT_EDIT_LATE', req.user.username, `record ${old.id}`); }
  const info = insRec.run(date, program, branch, semester, section, subject, req.user.id, note, nowISO());
  for (const e of clean) insEntry.run(Number(info.lastInsertRowid), e.studentId, e.status);
  addAudit('ATT_SAVE', req.user.username, `${program} sem${semester} ${subject} ${date} (${clean.length})`);
  res.status(201).json({ ok: true, message: `Saved for ${clean.length} students.` });
});

/* ================= TIMETABLE ================= */
app.get('/api/timetable', requireAuth, (req, res) => {
  let program, branch, semester, section;
  if (req.user.role === 'student') ({ program, branch, semester, section } = req.user);
  else if (req.user.role === 'parent') {
    const child = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.parent_of);
    if (!child) return res.json({ items: [] });
    ({ program, branch, semester, section } = child);
  } else { program = req.query.program; branch = req.query.branch; semester = req.query.semester; section = req.query.section; }
  const rows = db.prepare(`SELECT t.*, u.name AS teacherName FROM timetable t LEFT JOIN users u ON u.id = t.teacher_id WHERE t.program=? AND t.branch=? AND t.semester=? AND t.section=? ORDER BY t.period`).all(program, branch || '', Number(semester), String(section || ''));
  res.json({ items: rows, days: DAYS });
});
app.post('/api/timetable', requireAuth, requireRole('admin'), (req, res) => {
  const { program, branch, semester, section, day, period, subject, teacherId } = req.body || {};
  if (!PROGRAMS[program] || !DAYS.includes(day)) return res.status(400).json({ error: 'Invalid program/day.' });
  const p = Number(period);
  if (!p || p < 1 || p > 8) return res.status(400).json({ error: 'Period 1–8.' });
  if (!String(subject || '').trim()) return res.status(400).json({ error: 'Subject required.' });
  db.prepare('INSERT INTO timetable (program, branch, semester, section, day, period, subject, teacher_id) VALUES (?,?,?,?,?,?,?,?)')
    .run(program, branch || '', Number(semester), String(section || '').toUpperCase(), day, p, String(subject).trim(), String(teacherId || ''));
  addAudit('TT_ADD', req.user.username, `${program} sem${semester} ${day} P${p} ${subject}`);
  res.status(201).json({ ok: true });
});
app.patch('/api/timetable/:id', requireAuth, requireRole('admin'), (req, res) => {
  const tid = String((req.body || {}).teacherId || '');
  db.prepare('UPDATE timetable SET teacher_id = ? WHERE id = ?').run(tid, req.params.id);
  addAudit('TT_SUB', req.user.username, `slot ${req.params.id} → ${tid || 'none'}`);
  res.json({ ok: true, message: 'Teacher reassigned (substitution done).' });
});
app.delete('/api/timetable/:id', requireAuth, requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM timetable WHERE id = ?').run(req.params.id);
  addAudit('TT_DEL', req.user.username, req.params.id);
  res.json({ ok: true });
});

/* ================= LEAVES ================= */
app.post('/api/leaves', requireAuth, requireRole('student'), (req, res) => {
  const date = String((req.body || {}).date || ''), type = String((req.body || {}).type || 'casual'), reason = String((req.body || {}).reason || '').slice(0, 300);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Valid date.' });
  if (!['casual', 'medical', 'duty'].includes(type)) return res.status(400).json({ error: 'Invalid type.' });
  db.prepare('INSERT INTO leaves (student_id, date, type, reason, ts) VALUES (?,?,?,?,?)').run(req.user.id, date, type, reason, nowISO());
  addAudit('LEAVE_NEW', req.user.username, `${type} ${date}`);
  res.status(201).json({ ok: true, message: 'Leave submitted.' });
});
app.get('/api/leaves', requireAuth, (req, res) => {
  if (req.user.role === 'student') return res.json({ items: db.prepare('SELECT * FROM leaves WHERE student_id = ? ORDER BY id DESC').all(req.user.id) });
  if (req.user.role === 'parent') {
    const child = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.parent_of);
    return res.json({ items: child ? db.prepare('SELECT * FROM leaves WHERE student_id = ? ORDER BY id DESC').all(child.id) : [] });
  }
  res.json({ items: db.prepare('SELECT l.*, u.name AS studentName, u.roll_no AS rollNo FROM leaves l JOIN users u ON u.id = l.student_id ORDER BY CASE l.status WHEN "pending" THEN 0 ELSE 1 END, l.id DESC').all() });
});
app.post('/api/leaves/:id/decide', requireAuth, requireRole('admin'), (req, res) => {
  const decision = (req.body || {}).decision;
  if (!['approved', 'rejected'].includes(decision)) return res.status(400).json({ error: 'Invalid decision.' });
  const row = db.prepare('SELECT * FROM leaves WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found.' });
  db.prepare('UPDATE leaves SET status = ?, decided_by = ? WHERE id = ?').run(decision, req.user.username, row.id);
  const stu = db.prepare('SELECT * FROM users WHERE id = ?').get(row.student_id);
  if (stu) sendMail(stu.email, `Leave ${decision}`, `Your ${row.type} leave for ${row.date}: ${decision}.`);
  addAudit(decision === 'approved' ? 'LEAVE_OK' : 'LEAVE_NO', req.user.username, `#${row.id}`);
  res.json({ ok: true, message: `Leave ${decision}.` });
});

/* ================= CORRECTIONS ================= */
app.post('/api/corrections', requireAuth, requireRole('student'), (req, res) => {
  const entryId = Number((req.body || {}).entryId), requested = String((req.body || {}).requested);
  const reason = String((req.body || {}).reason || '').slice(0, 300);
  if (!VALID_STATUSES.includes(requested)) return res.status(400).json({ error: 'Invalid status.' });
  const entry = db.prepare('SELECT e.* FROM entries e WHERE e.id = ? AND e.student_id = ?').get(entryId, req.user.id);
  if (!entry) return res.status(404).json({ error: 'Entry not found.' });
  if (db.prepare(`SELECT id FROM corrections WHERE entry_id = ? AND status = 'pending'`).get(entryId)) return res.status(409).json({ error: 'Already pending.' });
  db.prepare('INSERT INTO corrections (student_id, entry_id, requested, reason, ts) VALUES (?,?,?,?,?)').run(req.user.id, entryId, requested, reason, nowISO());
  addAudit('FIX_REQ', req.user.username, `#${entryId} → ${requested}`);
  res.status(201).json({ ok: true, message: 'Correction request bheji gayi.' });
});
app.get('/api/corrections', requireAuth, requireRole('admin'), (req, res) => {
  res.json({ items: db.prepare(`SELECT c.*, u.name AS studentName, e.status AS current, r.date, r.subject FROM corrections c JOIN users u ON u.id=c.student_id JOIN entries e ON e.id=c.entry_id JOIN records r ON r.id=e.record_id ORDER BY CASE c.status WHEN 'pending' THEN 0 ELSE 1 END, c.id DESC LIMIT 100`).all() });
});
app.post('/api/corrections/:id/decide', requireAuth, requireRole('admin'), (req, res) => {
  const decision = (req.body || {}).decision;
  const row = db.prepare('SELECT * FROM corrections WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found.' });
  if (decision === 'approved') db.prepare('UPDATE entries SET status = ? WHERE id = ?').run(row.requested, row.entry_id);
  db.prepare('UPDATE corrections SET status = ?, decided_by = ? WHERE id = ?').run(decision, req.user.username, row.id);
  addAudit(decision === 'approved' ? 'FIX_OK' : 'FIX_NO', req.user.username, `#${row.id}`);
  res.json({ ok: true, message: `Correction ${decision}.` });
});

/* ================= MARKS ================= */
app.post('/api/marks/bulk', requireAuth, requireRole('teacher', 'admin'), (req, res) => {
  const { subject, exam } = req.body || {};
  const max = Number((req.body || {}).max);
  if (!subject || !exam || !max || max <= 0) return res.status(400).json({ error: 'Subject, exam aur max required.' });
  const assigned = Array.isArray(req.user.subjects) ? req.user.subjects.filter(Boolean) : [];
  if (assigned.length && !assigned.includes(subject)) return res.status(403).json({ error: `"${subject}" tumhara nahi hai.` });
  const list = Array.isArray(req.body.entries) ? req.body.entries.filter((e) => e && e.studentId && Number.isFinite(Number(e.score))) : [];
  if (!list.length) return res.status(400).json({ error: 'No valid scores.' });
  const del = db.prepare('DELETE FROM marks WHERE student_id = ? AND subject = ? AND exam = ?');
  const ins = db.prepare('INSERT INTO marks (student_id, subject, exam, score, max, ts) VALUES (?,?,?,?,?,?)');
  let n = 0;
  for (const e of list) {
    const score = Math.max(0, Math.min(max, Number(e.score)));
    del.run(e.studentId, subject, exam); ins.run(e.studentId, subject, exam, score, max, nowISO()); n++;
  }
  addAudit('MARKS', req.user.username, `${subject} ${exam} (${n})`);
  res.json({ ok: true, message: `${n} marks saved for ${subject} · ${exam}.` });
});
app.get('/api/marks/mine', requireAuth, requireRole('student'), (req, res) => {
  res.json({ items: db.prepare('SELECT subject, exam, score, max, ts FROM marks WHERE student_id = ? ORDER BY subject, exam').all(req.user.id) });
});
app.get('/api/marks/child', requireAuth, requireRole('parent'), (req, res) => {
  res.json({ items: db.prepare('SELECT subject, exam, score, max, ts FROM marks WHERE student_id = ? ORDER BY subject, exam').all(req.user.parent_of) });
});
app.get('/api/marks/class', requireAuth, requireRole('teacher', 'admin'), (req, res) => {
  res.json({ items: db.prepare(`SELECT m.student_id, m.score, m.max FROM marks m JOIN users u ON u.id = m.student_id WHERE m.subject=? AND m.exam=? AND u.program=? AND u.branch=? AND u.semester=? AND u.section=?`).all(String(req.query.subject), String(req.query.exam), String(req.query.program), String(req.query.branch || ''), Number(req.query.semester), String(req.query.section || '')) });
});

/* ================= ROTATING QR SELF-MARK ================= */
app.post('/api/selfmark/open', requireAuth, requireRole('teacher'), (req, res) => {
  const { program, branch, semester, section, subject, date, useGeo } = req.body || {};
  if (!program || !semester || !subject || !date) return res.status(400).json({ error: 'Class details missing.' });
  const session = crypto.randomBytes(5).toString('hex').toUpperCase();
  const secret = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO markcodes (id, secret, teacher_id, program, branch, semester, section, subject, date, geo, expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(session, secret, req.user.id, program, String(branch || ''), Number(semester), String(section || '').toUpperCase(), subject, date, useGeo ? `${CAMPUS.lat},${CAMPUS.lng},${CAMPUS.radius}` : '', Date.now() + 15 * 60 * 1000);
  addAudit('SM_OPEN', req.user.username, `${subject} ${date} geo=${!!useGeo}`);
  res.status(201).json({ ok: true, session, minutes: 15, campus: CAMPUS });
});
app.get('/api/selfmark/rotate', requireAuth, requireRole('teacher', 'admin'), (req, res) => {
  const row = db.prepare('SELECT * FROM markcodes WHERE id = ?').get(String(req.query.session || ''));
  if (!row || row.expires_at < Date.now()) return res.status(400).json({ error: 'Session invalid/expired.' });
  res.json({ code: rotCode(row.secret, Math.floor(Date.now() / 30000)) });
});
app.get('/api/selfmark/status', requireAuth, requireRole('teacher', 'admin'), (req, res) => {
  const row = db.prepare('SELECT * FROM markcodes WHERE id = ?').get(String(req.query.session || ''));
  if (!row) return res.json({ closed: true, items: [] });
  const items = db.prepare(`SELECT s.*, u.name, u.roll_no AS rollNo FROM selfmarks s JOIN users u ON u.id = s.student_id WHERE s.session = ? ORDER BY s.id DESC`).all(row.id);
  res.json({ closed: row.expires_at < Date.now(), items, geo: !!row.geo });
});
app.post('/api/selfmark/close', requireAuth, requireRole('teacher'), (req, res) => {
  db.prepare('DELETE FROM markcodes WHERE id = ? AND teacher_id = ?').run(String((req.body || {}).session || ''), req.user.id);
  res.json({ ok: true, message: 'Session closed.' });
});
app.post('/api/selfmark/mark', requireAuth, requireRole('student'), (req, res) => {
  const session = String((req.body || {}).session || '').trim();
  const code = String((req.body || {}).code || '').trim();
  const mc = db.prepare('SELECT * FROM markcodes WHERE id = ?').get(session);
  if (!mc || mc.expires_at < Date.now()) return res.status(400).json({ error: 'Session invalid ya expire.' });
  const win = Math.floor(Date.now() / 30000);
  if (![rotCode(mc.secret, win), rotCode(mc.secret, win - 1), rotCode(mc.secret, win + 1)].includes(code))
    return res.status(401).json({ error: '⏱️ Code galat/purana — CURRENT code lo (har 30s badalta hai).' });
  const me = req.user;
  if (me.program !== mc.program || me.semester !== mc.semester || (me.branch || '') !== (mc.branch || '') || (me.section || '') !== (mc.section || ''))
    return res.status(403).json({ error: 'Ye class tumhari nahi hai.' });

  const device = String((req.body || {}).device || ''), ip = req.socket.remoteAddress || 'unknown';
  const devClash = device && db.prepare('SELECT student_id FROM selfmarks WHERE session = ? AND device = ? AND student_id != ?').get(session, device, me.id);
  if (devClash) {
    db.prepare('INSERT INTO selfmarks (session, student_id, device, ip, flagged, ts) VALUES (?,?,?,?,1,?)').run(session, me.id, device, ip, nowISO());
    addAudit('PROXY_FLAG', me.username, `device clash ${session}`);
    return res.status(403).json({ error: '🚫 Proxy! Ye device is session me already use ho chuka hai.' });
  }
  if (db.prepare('SELECT COUNT(DISTINCT student_id) AS c FROM selfmarks WHERE session = ? AND ip = ?').get(session, ip).c >= 4)
    return res.status(403).json({ error: '🚫 Is IP se bahut zyada marks — proxy flag!' });
  if (mc.geo) {
    const [clat, clng, crad] = mc.geo.split(',').map(Number);
    const lat = Number((req.body || {}).lat), lng = Number((req.body || {}).lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return res.status(400).json({ error: 'Location allow karo.' });
    const dist = haversine(lat, lng, clat, clng);
    if (dist > crad) return res.status(403).json({ error: `📍 Campus ke bahar (${dist}m). Radius ${crad}m.` });
  }
  const faceStored = db.prepare('SELECT face FROM users WHERE id = ?').get(me.id).face;
  if (faceStored) {
    const fd = (req.body || {}).face;
    if (!Array.isArray(fd) || fd.length !== 128) return res.status(400).json({ error: '🧠 Face scan required — selfie+face ON karke try karo.' });
    const a = JSON.parse(faceStored);
    let sum = 0; for (let i = 0; i < 128; i++) sum += (a[i] - fd[i]) ** 2;
    const dist = Math.sqrt(sum);
    if (dist > 0.55) { addAudit('FACE_FAIL', me.username, `dist=${dist.toFixed(2)} session ${session}`); return res.status(403).json({ error: '🧠 Face match nahi hua! Sirf khud ki attendance mark karo.' }); }
    addAudit('FACE_OK', me.username, `dist=${dist.toFixed(2)}`);
  }
  const selfie = String((req.body || {}).selfie || '');
  if (selfie.startsWith('data:image/jpeg;base64,')) {
    const b64 = selfie.split(',')[1];
    if (b64 && b64.length < 600000) { try { fs.writeFileSync(path.join(DATA_DIR, 'selfies', `${session}-${me.id}.jpg`), Buffer.from(b64, 'base64')); } catch {} }
  }
  let rec = db.prepare('SELECT * FROM records WHERE date=? AND program=? AND branch=? AND semester=? AND section=? AND subject=?').get(mc.date, mc.program, mc.branch, mc.semester, mc.section, mc.subject);
  if (!rec) { const info = insRec.run(mc.date, mc.program, mc.branch, mc.semester, mc.section, mc.subject, mc.teacher_id, 'Self-marked', nowISO()); rec = { id: Number(info.lastInsertRowid) }; }
  const existing = db.prepare('SELECT * FROM entries WHERE record_id = ? AND student_id = ?').get(rec.id, me.id);
  if (existing && existing.status !== 'absent') return res.status(409).json({ error: 'Already marked.' });
  if (existing) db.prepare('UPDATE entries SET status = ? WHERE id = ?').run('present', existing.id);
  else insEntry.run(rec.id, me.id, 'present');
  db.prepare('INSERT INTO selfmarks (session, student_id, device, ip, ts) VALUES (?,?,?,?,?)').run(session, me.id, device, ip, nowISO());
  addAudit('SELFMARK', me.username, `${mc.subject} ${mc.date}`);
  res.status(201).json({ ok: true, message: '✅ Self-marked present!' });
});

/* ================= ANALYTICS ================= */
function studentStats(studentId, opts = {}) {
  const holidays = getHolidaySet();
  let sql = `SELECT r.date, r.subject, e.status, e.id AS entryId FROM entries e JOIN records r ON r.id = e.record_id WHERE e.student_id = ?`;
  const params = [studentId];
  if (opts.from) { sql += ' AND r.date >= ?'; params.push(opts.from); }
  if (opts.to) { sql += ' AND r.date <= ?'; params.push(opts.to); }
  sql += ' ORDER BY r.date';
  let total = 0, present = 0, late = 0;
  const subjectMap = {}; const logs = [];
  for (const r of db.prepare(sql).all(...params)) {
    if (holidays.has(r.date)) continue;
    total += 1;
    if (r.status === 'present') present += 1; else if (r.status === 'late') late += 1;
    const s = subjectMap[r.subject] || (subjectMap[r.subject] = { total: 0, present: 0, late: 0 });
    s.total += 1;
    if (r.status === 'present') s.present += 1; else if (r.status === 'late') s.late += 1;
    logs.push({ date: r.date, subject: r.subject, status: r.status, entryId: r.entryId });
  }
  logs.sort((a, b) => b.date.localeCompare(a.date));
  const pct = (p, l, t) => (t ? Math.round(((p + l) / t) * 100) : 0);
  return {
    total, present, late, absent: total - present - late, attended: present + late,
    percentage: pct(present, late, total), threshold: getThreshold(),
    subjects: Object.entries(subjectMap).map(([subject, s]) => ({ subject, total: s.total, present: s.present, late: s.late, percentage: pct(s.present, s.late, s.total) })),
    logs,
  };
}
app.get('/api/me/attendance', requireAuth, requireRole('student'), (req, res) => res.json(studentStats(req.user.id, { from: req.query.from, to: req.query.to })));
app.get('/api/parent/child', requireAuth, requireRole('parent'), (req, res) => {
  const child = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.parent_of);
  if (!child) return res.status(404).json({ error: 'Child link missing.' });
  res.json({ user: publicUser(child), stats: studentStats(child.id) });
});
app.get('/api/leaderboard', requireAuth, (req, res) => {
  const list = getUsers().filter((u) => u.role === 'student')
    .map((s) => { const st = studentStats(s.id); return { id: s.id, name: s.name, label: classLabel(s), semester: s.semester, pct: st.percentage, total: st.total }; })
    .filter((r) => r.total > 0).sort((a, b) => b.pct - a.pct);
  const meIdx = list.findIndex((r) => r.id === req.user.id);
  res.json({ top: list.slice(0, 5), myRank: meIdx >= 0 ? meIdx + 1 : null, classSize: list.length });
});

/* ================= ADMIN REPORTS ================= */
app.get('/api/reports/summary', requireAuth, requireRole('admin'), (req, res) => {
  const students = getUsers().filter((u) => u.role === 'student');
  let total = 0, attended = 0;
  for (const s of students) { const st = studentStats(s.id); total += st.total; attended += st.attended; }
  res.json({ totalStudents: students.length, totalTeachers: getUsers().filter((u) => u.role === 'teacher').length, sessionsMarked: db.prepare('SELECT COUNT(*) AS c FROM records').get().c, overallPercentage: total ? Math.round((attended / total) * 100) : 0, threshold: getThreshold() });
});
app.get('/api/reports/overall', requireAuth, requireRole('admin'), (req, res) => {
  const range = { from: req.query.from, to: req.query.to };
  res.json({ report: getUsers().filter((u) => u.role === 'student').map((s) => ({ id: s.id, name: s.name, rollNo: s.roll_no, program: s.program, branch: s.branch, semester: s.semester, section: s.section, ...studentStats(s.id, range) })) });
});
app.get('/api/reports/export', requireAuth, requireRole('admin'), (req, res) => {
  const range = { from: req.query.from, to: req.query.to };
  const rows = [['Roll No', 'Name', 'Program', 'Branch', 'Semester', 'Section', 'Total', 'Present', 'Late', 'Absent', '%']];
  for (const s of getUsers().filter((u) => u.role === 'student')) {
    const st = studentStats(s.id, range);
    rows.push([s.roll_no, s.name, s.program, s.branch, s.semester ?? '', s.section || '', st.total, st.present, st.late, st.absent, st.percentage]);
  }
  sendCSV(res, `attendance-${range.from || 'all'}-${range.to || todayStamp()}.csv`, rows);
});
app.get('/api/reports/workload', requireAuth, requireRole('admin'), (req, res) => {
  const rows = db.prepare(`SELECT u.name, u.username, COUNT(DISTINCT r.id) AS sessions, COUNT(e.id) AS marked,
    SUM(CASE WHEN e.status IN ('present','late') THEN 1 ELSE 0 END) AS attended
    FROM users u LEFT JOIN records r ON r.teacher_id = u.id LEFT JOIN entries e ON e.record_id = r.id
    WHERE u.role = 'teacher' GROUP BY u.id ORDER BY sessions DESC`).all();
  res.json({ items: rows.map((r) => ({ ...r, avg: r.marked ? Math.round((r.attended / r.marked) * 100) : null })) });
});
app.get('/api/reports/subjects', requireAuth, requireRole('admin'), (req, res) => {
  const rows = db.prepare(`SELECT r.subject, COUNT(DISTINCT r.id) AS sessions, COUNT(e.id) AS total,
    SUM(CASE WHEN e.status IN ('present','late') THEN 1 ELSE 0 END) AS attended
    FROM records r LEFT JOIN entries e ON e.record_id = r.id GROUP BY r.subject ORDER BY sessions DESC`).all();
  res.json({ items: rows.map((r) => ({ ...r, pct: r.total ? Math.round((r.attended / r.total) * 100) : 0 })) });
});
app.get('/api/reports/correlation', requireAuth, requireRole('admin'), (req, res) => {
  const out = [];
  for (const s of getUsers().filter((u) => u.role === 'student')) {
    const st = studentStats(s.id);
    if (!st.total) continue;
    const mk = db.prepare('SELECT AVG(score * 100.0 / max) AS m FROM marks WHERE student_id = ?').get(s.id);
    out.push({ name: s.name, pct: st.percentage, marksPct: mk && mk.m != null ? Math.round(mk.m) : null });
  }
  res.json({ items: out.filter((o) => o.marksPct != null) });
});
app.get('/api/register', requireAuth, requireRole('teacher', 'admin'), (req, res) => {
  const { program, branch, semester, section, subject } = req.query;
  const month = String(req.query.month || '');
  if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'Month YYYY-MM chuno.' });
  const like = `${month}%`;
  const dates = db.prepare(`SELECT DISTINCT date FROM records WHERE program=? AND branch=? AND semester=? AND section=? AND subject=? AND date LIKE ? ORDER BY date`)
    .all(program, branch || '', Number(semester), String(section || '').toUpperCase(), subject, like).map((r) => r.date);
  const students = db.prepare(`SELECT * FROM users WHERE role='student' AND program=? AND branch=? AND semester=? AND section=? ORDER BY roll_no, name`)
    .all(program, branch || '', Number(semester), String(section || '').toUpperCase());
  const cellMap = new Map();
  db.prepare(`SELECT e.student_id, r.date, e.status FROM entries e JOIN records r ON r.id = e.record_id WHERE r.program=? AND r.branch=? AND r.semester=? AND r.section=? AND r.subject=? AND r.date LIKE ?`)
    .all(program, branch || '', Number(semester), String(section || '').toUpperCase(), subject, like)
    .forEach((r) => cellMap.set(`${r.student_id}|${r.date}`, r.status));
  const rows = students.map((s) => {
    const cells = dates.map((d) => cellMap.get(`${s.id}|${d}`) || '');
    const P = cells.filter((c) => c === 'present').length, L = cells.filter((c) => c === 'late').length, A = cells.filter((c) => c === 'absent').length;
    const t = P + L + A;
    return { rollNo: s.roll_no, name: s.name, cells, P, L, A, pct: t ? Math.round(((P + L) / t) * 100) : null };
  });
  res.json({ dates, rows, month });
});
app.post('/api/reports/email-defaulters', requireAuth, requireRole('admin'), async (req, res) => {
  const th = getThreshold(); let sent = 0, skipped = 0;
  for (const s of getUsers().filter((u) => u.role === 'student')) {
    const st = studentStats(s.id);
    if (st.total > 0 && st.percentage < th) {
      if (!s.email) { skipped++; continue; }
      const ok = await sendMail(s.email, '⚠️ Low Attendance — GLBITM', `Dear ${s.name},\nAttendance: ${st.percentage}% (min ${th}%).\n\n— GLBITM`);
      ok ? sent++ : skipped++;
    }
  }
  addAudit('MAIL_DEFAULTERS', req.user.username, `${sent} sent`);
  res.json({ ok: true, message: `${sent} emails${mailer ? '' : ' (console mode)'}, ${skipped} skipped.` });
});
app.get('/api/admin/audit', requireAuth, requireRole('admin'), (req, res) => res.json({ logs: db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 100').all() }));
app.get('/api/admin/backup', requireAuth, requireRole('admin'), (req, res) => {
  addAudit('BACKUP', req.user.username, '');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="glbajaj-backup-${todayStamp()}.json"`);
  res.send(JSON.stringify({ exportedAt: nowISO(), users: db.prepare('SELECT * FROM users').all(), records: db.prepare('SELECT * FROM records').all(), entries: db.prepare('SELECT * FROM entries').all(), announcements: db.prepare('SELECT * FROM announcements').all(), timetable: db.prepare('SELECT * FROM timetable').all(), leaves: db.prepare('SELECT * FROM leaves').all(), corrections: db.prepare('SELECT * FROM corrections').all(), marks: db.prepare('SELECT * FROM marks').all(), holidays: db.prepare('SELECT * FROM holidays').all(), settings: db.prepare('SELECT * FROM settings').all() }, null, 2));
});
app.post('/api/admin/restore', requireAuth, requireRole('admin'), (req, res) => {
  const b = req.body || {};
  if (!Array.isArray(b.users) || !Array.isArray(b.records) || !Array.isArray(b.entries)) return res.status(400).json({ error: 'Invalid backup.' });
  db.exec('BEGIN');
  try {
    for (const t of ['sessions','entries','records','users','announcements','timetable','leaves','corrections','marks','certs','holidays','settings']) db.prepare(`DELETE FROM ${t}`).run();
    const iu = db.prepare(`INSERT INTO users (id,role,name,username,password_hash,program,branch,semester,section,roll_no,email,subjects,face,card_id,parent_of,twofa,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    for (const u of b.users) iu.run(u.id, u.role, u.name, u.username, u.password_hash, u.program || '', u.branch || '', u.semester ?? null, u.section || '', u.roll_no || '', u.email || '', u.subjects || '[]', u.face || '', u.card_id || '', u.parent_of || '', u.twofa || 0, u.created_at || nowISO());
    const ir = db.prepare(`INSERT INTO records (id,date,program,branch,semester,section,subject,teacher_id,note,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`);
    for (const r of b.records) ir.run(r.id, r.date, r.program, r.branch || '', r.semester, r.section || '', r.subject, r.teacher_id || null, r.note || '', r.created_at || nowISO());
    const ie = db.prepare('INSERT INTO entries (id, record_id, student_id, status) VALUES (?,?,?,?)');
    for (const e of b.entries) ie.run(e.id, e.record_id, e.student_id, e.status);
    const im = db.prepare('INSERT INTO marks (id, student_id, subject, exam, score, max, ts) VALUES (?,?,?,?,?,?,?)');
    for (const m of b.marks || []) im.run(m.id, m.student_id, m.subject, m.exam, m.score, m.max, m.ts || nowISO());
    const ih = db.prepare('INSERT OR REPLACE INTO holidays (date, title) VALUES (?,?)');
    for (const h of b.holidays || []) ih.run(h.date, h.title);
    const iset = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)');
    for (const s of b.settings || []) iset.run(s.key, s.value);
    db.exec('COMMIT');
  } catch (err) { db.exec('ROLLBACK'); return res.status(400).json({ error: `Restore failed: ${err.message}` }); }
  addAudit('RESTORE', req.user.username, `${b.users.length} users`);
  res.json({ ok: true, message: `Restored ${b.users.length} users.` });
});

/* ================= ANNOUNCEMENTS ================= */
app.get('/api/announcements', requireAuth, (req, res) => res.json({ items: db.prepare('SELECT * FROM announcements ORDER BY ts DESC LIMIT 10').all() }));
app.post('/api/announcements', requireAuth, requireRole('admin'), async (req, res) => {
  const title = String((req.body || {}).title || '').trim(), body = String((req.body || {}).body || '').trim();
  if (!title) return res.status(400).json({ error: 'Title required.' });
  db.prepare('INSERT INTO announcements (id, title, body, ts, by) VALUES (?,?,?,?,?)').run('N' + Date.now().toString(36), title, body, nowISO(), req.user.name);
  addAudit('ANN_ADD', req.user.username, title);
  const targets = db.prepare(`SELECT email FROM users WHERE email != '' AND role != 'admin'`).all();
  if (mailer && targets.length) Promise.allSettled(targets.map((t) => sendMail(t.email, `📢 ${title} — GLBITM`, body || title)));
  res.status(201).json({ ok: true, emailed: mailer ? targets.length : 0 });
});
app.delete('/api/announcements/:id', requireAuth, requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM announcements WHERE id = ?').run(req.params.id);
  addAudit('ANN_DEL', req.user.username, req.params.id);
  res.json({ ok: true });
});

/* ================= TEACHER SESSIONS ================= */
app.get('/api/me/sessions', requireAuth, requireRole('teacher'), (req, res) => {
  const list = db.prepare('SELECT * FROM records WHERE teacher_id = ? ORDER BY date DESC').all(req.user.id)
    .map((r) => {
      const entries = db.prepare('SELECT status FROM entries WHERE record_id = ?').all(r.id);
      return { id: r.id, date: r.date, program: r.program, branch: r.branch, semester: r.semester, section: r.section, subject: r.subject, note: r.note || '', total: entries.length, present: entries.filter((e) => e.status === 'present').length, late: entries.filter((e) => e.status === 'late').length };
    });
  res.json({ sessions: list });
});
app.get('/api/me/sessions/export', requireAuth, requireRole('teacher'), (req, res) => {
  const rows = [['Date','Program','Branch','Semester','Section','Subject','Present','Late','Total']];
  for (const r of db.prepare('SELECT * FROM records WHERE teacher_id = ? ORDER BY date DESC').all(req.user.id)) {
    const entries = db.prepare('SELECT status FROM entries WHERE record_id = ?').all(r.id);
    rows.push([r.date, r.program, r.branch, r.semester, r.section, r.subject, entries.filter((e) => e.status === 'present').length, entries.filter((e) => e.status === 'late').length, entries.length]);
  }
  sendCSV(res, `my-sessions-${todayStamp()}.csv`, rows);
});

/* ================= CERTIFICATE ================= */
app.post('/api/certificate', requireAuth, requireRole('student'), (req, res) => {
  const st = studentStats(req.user.id);
  const id = crypto.randomBytes(6).toString('hex');
  db.prepare('INSERT INTO certs (id, student_id, name, roll, program, branch, semester, pct, total, present, late, absent, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, req.user.id, req.user.name, req.user.roll_no, req.user.program, req.user.branch, req.user.semester, st.percentage, st.total, st.present, st.late, st.absent, nowISO());
  addAudit('CERT', req.user.username, id);
  res.json({ id, url: `/verify/${id}` });
});
app.get('/verify/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM certs WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).send('<h2 style="font-family:sans-serif">❌ Invalid certificate ID</h2>');
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Verify · ${c.id}</title>
  <style>body{font-family:Georgia,serif;display:grid;place-items:center;min-height:100vh;background:#f5f5f5;margin:0}
  .cert{background:#fff;border:3px double #1d4ed8;padding:48px 56px;max-width:640px;text-align:center;box-shadow:0 8px 40px rgba(0,0,0,.12)}
  h1{color:#1d4ed8}small{color:#666}.valid{display:inline-block;background:#059669;color:#fff;padding:6px 20px;border-radius:999px;font-family:sans-serif;font-weight:700;margin-top:12px}</style></head>
  <body><div class="cert"><h1>GL Bajaj Institute of Technology &amp; Management</h1>
  <small>Approved by AICTE · Affiliated to AKTU Lucknow</small><hr style="margin:20px 0;border:none;border-top:1px solid #ddd"/>
  <h2>Attendance Certificate</h2>
  <p>This certifies that <strong>${c.name}</strong> (${c.roll || '—'}), ${c.program}${c.branch && c.branch !== 'General' ? ' · ' + c.branch : ''}, Semester ${c.semester ?? '—'},</p>
  <p>has attendance of <strong style="font-size:1.6em;color:#1d4ed8">${c.pct}%</strong></p>
  <p>(${c.present} present · ${c.late} late · ${c.absent} absent of ${c.total})</p>
  <small>Issued ${String(c.created_at).slice(0, 10)} · ID: <strong>${c.id}</strong></small><br/>
  <span class="valid">✔ VERIFIED — GLBITM Attendance System</span></div></body></html>`);
});

/* ================= RFID HOOK ================= */
app.post('/api/hardware/rfid', (req, res) => {
  if (req.headers['x-device-key'] !== (process.env.HARDWARE_KEY || 'demo-hardware-key'))
    return res.status(403).json({ error: 'Invalid device key.' });
  const { cardId, program, branch, semester, section, subject } = req.body || {};
  const date = String((req.body || {}).date || todayStamp());
  const stu = db.prepare('SELECT * FROM users WHERE card_id = ? AND role = ?').get(String(cardId || '').toUpperCase(), 'student');
  if (!stu) return res.status(404).json({ error: 'Card not registered.' });
  if (!program || !semester || !subject) return res.status(400).json({ error: 'Class fields required.' });
  let rec = db.prepare('SELECT * FROM records WHERE date=? AND program=? AND branch=? AND semester=? AND section=? AND subject=?').get(date, program, String(branch || ''), Number(semester), String(section || '').toUpperCase(), subject);
  if (!rec) { const info = insRec.run(date, program, String(branch || ''), Number(semester), String(section || '').toUpperCase(), subject, null, 'RFID tap', nowISO()); rec = { id: Number(info.lastInsertRowid) }; }
  const ex = db.prepare('SELECT * FROM entries WHERE record_id = ? AND student_id = ?').get(rec.id, stu.id);
  if (ex) return res.json({ ok: true, message: `${stu.name} already marked (${ex.status}).` });
  insEntry.run(rec.id, stu.id, 'present');
  addAudit('RFID', stu.username, `${subject} ${date}`);
  res.status(201).json({ ok: true, message: `${stu.name} marked present via RFID.` });
});

/* ================= fallbacks & smart port ================= */
app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }));
app.use((req, res) => res.status(404).sendFile(path.join(__dirname, 'public', 'index.html')));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Server error.' }); });

function printBanner(port) {
  console.log('──────────────────────────────────────────────');
  console.log('  🎓 GL Bajaj Attendance System v7.2 — Security Edition');
  console.log(`  ➜  http://localhost:${port}`);
  console.log('──────────────────────────────────────────────');
  console.log(`  Email: ${mailer ? '✅ SMTP active' : 'console mode'} · RFID key: ${process.env.HARDWARE_KEY || 'demo-hardware-key'}`);
  console.log(`  Demo hints: ${process.env.SHOW_DEMO_HINTS === '1' ? 'visible' : 'hidden (production) — SHOW_DEMO_HINTS=1 se dikhao'}`);
  console.log('──────────────────────────────────────────────');
}
function startServer(port, tries = 10) {
  const server = app.listen(port, () => printBanner(port));
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && tries > 0) { console.log(`  ⚠️ Port ${port} busy → ${port + 1}`); startServer(port + 1, tries - 1); }
    else { console.error(`❌ ${err.message}`); process.exit(1); }
  });
}
startServer(BASE_PORT);