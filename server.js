/**
 * GL Bajaj Attendance System — v9.1.0 (Teachers' Requirements Edition)
 * PERSISTENT cloud DB · Rotating QR · Face · Parent Portal · Excel Import · Sections
 * v9.0: Daily Work Report (DWR) · Principal auto-report at compile time · academic_year foundation
 * NEW v9.1: Student Progress Report (SPR) · Assignments + submissions · Internal marks /25
 *           Absent/Debarred status · Manual SGPA/CGPA · Year Rollover · Alumni Archive
 */
const express = require('express');
const crypto = require('crypto');
const postgres = require('postgres');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('\n❌ DATABASE_URL missing! Supabase ka connection string (pooler, port 6543) env me daalo.\n');
  process.exit(1);
}
const needsSSL = !/localhost|127\.0\.0\.1/.test(DATABASE_URL); /* v9: local dev pe SSL off, cloud pe on */
const sql = postgres(DATABASE_URL, { prepare: false, max: 5, ssl: needsSSL ? 'require' : false, connect_timeout: 30 });
/* v8.5.1 compat shim: kuch postgres.js versions me sql.join nahi hota */
if (typeof sql.join !== 'function') {
  sql.join = (chunks, sep) => {
    if (!chunks || !chunks.length) return sql``;
    let out = chunks[0];
    for (let i = 1; i < chunks.length; i++) out = sql`${out} ${sep || sql` `} ${chunks[i]}`;
    return out;
  };
}

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

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '4mb' }));

/* ---------------- security headers (zero-dependency) ---------------- */
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(self), microphone=(self)');
  res.setHeader('Strict-Transport-Security', 'max-age=15552000');
  next();
});

/* ---------------- passwords ---------------- */
function hashPassword(pw) { const salt = crypto.randomBytes(16).toString('hex'); return `${salt}:${crypto.scryptSync(String(pw), salt, 64).toString('hex')}`; }
function verifyPassword(pw, stored) {
  const [salt, hash] = String(stored || '').split(':'); if (!salt || !hash) return false;
  const h = crypto.scryptSync(String(pw), salt, 64), hb = Buffer.from(hash, 'hex');
  return hb.length === h.length && crypto.timingSafeEqual(h, hb);
}

/* ---------------- mail (real SMTP with console fallback) ----------------
   Env vars: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM (optional)
   SMTP set nahi ho to purana behaviour — email console me log hota hai aur
   OTP login screen par devCode ke roop me dikhta hai. */
let nodemailer = null;
try { nodemailer = require('nodemailer'); } catch {}
let mailer = null;
(function initMailer() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!nodemailer || !SMTP_HOST || !SMTP_USER || !SMTP_PASS) { console.log('  ℹ️ SMTP off — emails console hook pe jayenge (OTP devCode mode).'); return; }
  const port = Number(SMTP_PORT || (String(SMTP_HOST).includes('gmail') ? 465 : 587));
  mailer = nodemailer.createTransport({ host: SMTP_HOST, port, secure: port === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } });
  console.log(`  📧 SMTP ready → ${SMTP_HOST}:${port}`);
})();
const MAIL_FROM = process.env.SMTP_FROM || process.env.SMTP_USER || 'glbitm-attendance';
async function sendMail(to, subject, text) {
  if (!to) return false;
  if (!mailer) { console.log(`  📧 [email hook] to=${to} | ${subject} | ${String(text).slice(0, 80)}`); return false; }
  try { await mailer.sendMail({ from: MAIL_FROM, to, subject, text }); return true; }
  catch (e) { console.error(`  📧 send fail (${to}):`, e.message); return false; }
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

/* ---------------- schema ---------------- */
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, role TEXT NOT NULL, name TEXT NOT NULL, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, program TEXT DEFAULT '', branch TEXT DEFAULT '', semester INTEGER, section TEXT DEFAULT '', roll_no TEXT DEFAULT '', email TEXT DEFAULT '', subjects TEXT DEFAULT '[]', face TEXT DEFAULT '', card_id TEXT DEFAULT '', parent_of TEXT DEFAULT '', twofa INTEGER DEFAULT 0, created_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS records (id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, date TEXT NOT NULL, program TEXT NOT NULL, branch TEXT DEFAULT '', semester INTEGER NOT NULL, section TEXT DEFAULT '', subject TEXT NOT NULL, teacher_id TEXT, note TEXT DEFAULT '', created_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS entries (id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, record_id BIGINT NOT NULL, student_id TEXT NOT NULL, status TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_entries_student ON entries(student_id)`,
  `CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS announcements (id TEXT PRIMARY KEY, title TEXT, body TEXT, ts TEXT, by TEXT)`,
  `CREATE TABLE IF NOT EXISTS audit (id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, ts TEXT, action TEXT, who TEXT, detail TEXT)`,
  `CREATE TABLE IF NOT EXISTS timetable (id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, program TEXT, branch TEXT, semester INTEGER, section TEXT DEFAULT '', day TEXT NOT NULL, period INTEGER NOT NULL, subject TEXT NOT NULL, teacher_id TEXT DEFAULT '')`,
  `CREATE TABLE IF NOT EXISTS leaves (id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, student_id TEXT NOT NULL, date TEXT NOT NULL, type TEXT DEFAULT 'casual', reason TEXT DEFAULT '', status TEXT DEFAULT 'pending', decided_by TEXT DEFAULT '', ts TEXT)`,
  `CREATE TABLE IF NOT EXISTS corrections (id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, student_id TEXT NOT NULL, entry_id BIGINT NOT NULL, requested TEXT NOT NULL, reason TEXT DEFAULT '', status TEXT DEFAULT 'pending', decided_by TEXT DEFAULT '', ts TEXT)`,
  `CREATE TABLE IF NOT EXISTS marks (id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, student_id TEXT NOT NULL, subject TEXT NOT NULL, exam TEXT NOT NULL, score REAL NOT NULL, max REAL NOT NULL, ts TEXT)`,
  `CREATE TABLE IF NOT EXISTS certs (id TEXT PRIMARY KEY, student_id TEXT, name TEXT, roll TEXT, program TEXT, branch TEXT, semester INTEGER, pct INTEGER, total INTEGER, present INTEGER, late INTEGER, absent INTEGER, created_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`,
  `CREATE TABLE IF NOT EXISTS holidays (date TEXT PRIMARY KEY, title TEXT)`,
  `CREATE TABLE IF NOT EXISTS markcodes (id TEXT PRIMARY KEY, secret TEXT, teacher_id TEXT, program TEXT, branch TEXT, semester INTEGER, section TEXT DEFAULT '', subject TEXT, date TEXT, geo TEXT DEFAULT '', expires_at BIGINT)`,
  `CREATE TABLE IF NOT EXISTS selfmarks (id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, session TEXT, student_id TEXT, device TEXT, ip TEXT, flagged INTEGER DEFAULT 0, ts TEXT)`,
  `CREATE TABLE IF NOT EXISTS otps (username TEXT PRIMARY KEY, code TEXT, expires_at BIGINT, attempts INTEGER DEFAULT 0)`,
  /* ---- v9.0: Daily Work Report ---- */
  `CREATE TABLE IF NOT EXISTS dwr (id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, date TEXT NOT NULL, period INTEGER NOT NULL, program TEXT NOT NULL, branch TEXT DEFAULT '', semester INTEGER NOT NULL, section TEXT DEFAULT '', subject TEXT NOT NULL, teacher_id TEXT, taught TEXT DEFAULT '', present_count INTEGER, total_count INTEGER, assignment_title TEXT DEFAULT '', assignment_due TEXT DEFAULT '', remarks TEXT DEFAULT '', academic_year TEXT DEFAULT '', created_at TEXT, updated_at TEXT, UNIQUE (date, program, branch, semester, section, period))`,
  `CREATE INDEX IF NOT EXISTS idx_dwr_date ON dwr(date)`,
  `CREATE TABLE IF NOT EXISTS dwr_days (id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, date TEXT NOT NULL, program TEXT NOT NULL, branch TEXT DEFAULT '', semester INTEGER NOT NULL, section TEXT DEFAULT '', expected INTEGER DEFAULT 0, filled INTEGER DEFAULT 0, status TEXT DEFAULT 'open', sent_at TEXT, academic_year TEXT DEFAULT '', UNIQUE (date, program, branch, semester, section))`,
  /* ---- v9.0: Progress Report foundation (Phase 2 use karega) ---- */
  `CREATE TABLE IF NOT EXISTS assignments (id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, subject TEXT NOT NULL, program TEXT NOT NULL, branch TEXT DEFAULT '', semester INTEGER NOT NULL, section TEXT DEFAULT '', title TEXT NOT NULL, unit TEXT DEFAULT '', due_date TEXT DEFAULT '', teacher_id TEXT, academic_year TEXT DEFAULT '', created_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS assignment_subs (id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, assignment_id BIGINT NOT NULL, student_id TEXT NOT NULL, submitted INTEGER DEFAULT 0, submitted_at TEXT, score REAL, UNIQUE (assignment_id, student_id))`,
  `CREATE TABLE IF NOT EXISTS results (id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, student_id TEXT NOT NULL, semester INTEGER NOT NULL, sgpa REAL, cgpa REAL, remark TEXT DEFAULT '', updated_by TEXT, ts TEXT, UNIQUE (student_id, semester))`,
];

/* v9.0: existing tables me naye columns — safe idempotent migrations */
const MIGRATIONS = [
  `ALTER TABLE records ADD COLUMN IF NOT EXISTS academic_year TEXT DEFAULT ''`,
  `ALTER TABLE marks ADD COLUMN IF NOT EXISTS academic_year TEXT DEFAULT ''`,
  `ALTER TABLE marks ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'scored'`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS batch TEXT DEFAULT ''`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS graduated_on TEXT DEFAULT ''`,
];

let readyPromise = null;
function ready() {
  if (!readyPromise) {
    readyPromise = (async () => {
      for (const stmt of SCHEMA) await sql.unsafe(stmt);
      for (const stmt of MIGRATIONS) await sql.unsafe(stmt);
      const [{ c }] = await sql`SELECT COUNT(*)::int AS c FROM users`;
      if (c === 0) {
        if (process.env.SEED_DEMO === '1') await seedDemo();
        else console.log('  ℹ️ DB khaali — demo seed off (SEED_DEMO=1 se on hota hai). Setup wizard se pehla admin banao.');
      }
      console.log('  ✅ Database ready (Supabase Postgres) — data PERSISTENT ab!');
    })().catch((e) => { readyPromise = null; throw e; });
  }
  return readyPromise;
}

async function seedDemo() {
  console.log('  🆕 SEED_DEMO=1 — GL Bajaj demo data seed...');
  const users = [
    ['A1','admin','Dr. Meera Kapoor','admin','admin123','','',null,'','','meera@glbitm.ac.in','[]'],
    ['T1','teacher','Prof. Arjun Rao','arjun','teach123','B.Tech','CSE',null,'','','arjun@glbitm.ac.in','["Data Structures","DBMS","Operating Systems"]'],
    ['T2','teacher','Prof. Neha Verma','neha','teach123','B.Tech','Electronics and Communication Engineering',null,'','','neha@glbitm.ac.in','["Digital Electronics","Signals & Systems"]'],
    ['S1','student','Riya Sharma','riya','stud123','B.Tech','CSE',3,'A','2301641520001','riya@student.glbitm.ac.in','[]'],
    ['S2','student','Aman Gupta','aman','stud123','B.Tech','CSE',3,'A','2301641520002','aman@student.glbitm.ac.in','[]'],
    ['S3','student','Sara Khan','sara','stud123','B.Tech','CSE',3,'B','2301641520003','','[]'],
    ['S4','student','Dev Patel','dev','stud123','B.Tech','CSE (Artificial Intelligence)',5,'A','2301641020009','','[]'],
    ['S5','student','Ishita Nair','ishita','stud123','B.Tech','Electronics and Communication Engineering',3,'A','2301641510011','','[]'],
    ['S6','student','Priya Singh','priya','stud123','B.Tech','CSE (Data Science)',3,'A','2301641530012','','[]'],
    ['S7','student','Kabir Khan','kabir','stud123','BCA','General',1,'A','2401642010017','','[]'],
    ['S8','student','Nikhil Raj','nikhil','stud123','MBA','General',1,'A','2501644010023','','[]'],
  ];
  for (const u of users) {
    const [id, role, name, un, pw] = u;
    await sql`INSERT INTO users (id, role, name, username, password_hash, program, branch, semester, section, roll_no, email, subjects, face, card_id, parent_of, twofa, created_at) VALUES (${id}, ${role}, ${name}, ${un}, ${hashPassword(pw)}, ${u[5]}, ${u[6]}, ${u[7]}, ${u[8]}, ${u[9]}, ${u[10]}, ${u[11]}, '', '', '', 0, ${nowISO()}) ON CONFLICT DO NOTHING`;
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
    const [rec] = await sql`INSERT INTO records (date, program, branch, semester, section, subject, teacher_id, note, created_at) VALUES (${date}, ${prog}, ${br}, ${sem}, ${sec}, ${sub}, ${tid}, ${note}, ${nowISO()}) RETURNING id`;
    for (const [sid, st] of entries) await sql`INSERT INTO entries (record_id, student_id, status) VALUES (${rec.id}, ${sid}, ${st})`;
  }
  for (const [sub, per, tid] of [['Data Structures',1,'T1'],['DBMS',3,'T1'],['Operating Systems',5,'T1']])
    for (const d of ['Monday','Wednesday','Friday'])
      await sql`INSERT INTO timetable (program, branch, semester, section, day, period, subject, teacher_id) VALUES ('B.Tech','CSE',3,'A',${d},${per},${sub},${tid})`;
  for (const [sid, sub, sc] of [['S1','Data Structures',28],['S1','DBMS',24],['S2','Data Structures',22],['S2','DBMS',25],['S3','Data Structures',26],['S6','Data Structures',29]])
    await sql`INSERT INTO marks (student_id, subject, exam, score, max, ts) VALUES (${sid}, ${sub}, 'MST-1', ${sc}, 30, ${nowISO()})`;
}

/* ---------------- helpers ---------------- */
async function addAudit(action, who, detail = '') {
  await sql`INSERT INTO audit (ts, action, who, detail) VALUES (${nowISO()}, ${action}, ${who}, ${String(detail).slice(0, 200)})`;
}
async function getThreshold() {
  const r = await sql`SELECT value FROM settings WHERE key = 'threshold'`;
  const v = Number(r[0]?.value ?? 75);
  return v >= 40 && v <= 95 ? v : 75;
}
async function getSections() {
  const r = await sql`SELECT value FROM settings WHERE key = 'sections'`;
  try { const arr = JSON.parse(r[0]?.value || '[]'); return Array.isArray(arr) && arr.length ? arr : ['A', 'B', 'C']; } catch { return ['A', 'B', 'C']; }
}
async function saveSections(list) {
  let arr = [];
  if (Array.isArray(list)) arr = list;
  else if (typeof list === 'string') arr = list.split(',');
  else if (list && typeof list === 'object' && list.sections) arr = Array.isArray(list.sections) ? list.sections : String(list.sections).split(',');
  const clean = [...new Set(arr.map((s) => String(s).trim().toUpperCase()).filter((s) => s && s.length <= 20))].slice(0, 20);
  if (!clean.length) throw new Error('Kam se kam ek section chahiye (comma-separated).');
  await sql`INSERT INTO settings (key, value) VALUES ('sections', ${JSON.stringify(clean)}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
  return clean;
}
/* v9.0: academic year (July session start) + DWR config helpers */
function defaultAcademicYear() {
  const d = new Date();
  const y = d.getMonth() >= 5 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${String(y + 1).slice(2)}`;
}
async function getAcademicYear() {
  const r = await sql`SELECT value FROM settings WHERE key = 'academic_year'`;
  return r[0]?.value || defaultAcademicYear();
}
async function getDwrConfig() {
  const r = await sql`SELECT key, value FROM settings WHERE key IN ('dwr_compile_time','dwr_periods')`;
  const m = Object.fromEntries(r.map((x) => [x.key, x.value]));
  return { compileTime: m.dwr_compile_time || '16:30', periods: Math.min(12, Math.max(1, Number(m.dwr_periods) || 7)) };
}

/* ---------------- v16.0.0: marks = ENTRY-ONLY (no auto calculation) ----------------
   Ye system marks sirf RECORD karta hai — koi internal/25 conversion NAHI.
   College apne hisaab se internal calculate karke Marks Entry me manually enter karti hai
   (e.g. Exam = "Internal", Max = 25). SPR me wahi raw entries dikhti hain. */
async function getResults(studentId) {
  return sql`SELECT semester, sgpa, cgpa, remark, ts FROM results WHERE student_id = ${studentId} ORDER BY semester`;
}
/* v9.1: teacher subject-guard — req.user raw DB row hota hai (subjects JSON string), isliye parse karke do */
function assignedSubjects(u) {
  if (Array.isArray(u && u.subjects)) return u.subjects.filter(Boolean);
  try { const a = JSON.parse((u && u.subjects) || '[]'); return Array.isArray(a) ? a.filter(Boolean) : []; } catch { return []; }
}
/* v9.1: active-student condition (rollover ke baad alumni rosters me nahi dikhne chahiye) */
const isActiveUser = (col) => sql`(${sql(col)} = 'active' OR ${sql(col)} = '' OR ${sql(col)} IS NULL)`;
function publicUser(u) {
  if (!u) return null;
  let subjects = []; try { subjects = JSON.parse(u.subjects || '[]'); } catch {}
  return { id: u.id, role: u.role, name: u.name, username: u.username, program: u.program || '', branch: u.branch || '', semester: u.semester ?? null, section: u.section || '', rollNo: u.roll_no || '', email: u.email || '', subjects, hasFace: !!u.face, cardId: u.card_id || '', parentOf: u.parent_of || '', twofa: !!u.twofa, batch: u.batch || '', status: u.status || 'active', graduatedOn: u.graduated_on || '' };
}

/* ---------------- auth middleware ---------------- */
const SESSION_DAYS = 7;
const fails = new Map();
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const sess = token ? (await sql`SELECT * FROM sessions WHERE token = ${token}`)[0] : null;
  if (!sess || sess.expires_at <= nowISO()) {
    if (sess) await sql`DELETE FROM sessions WHERE token = ${token}`;
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
  const user = (await sql`SELECT * FROM users WHERE id = ${sess.user_id}`)[0];
  if (!user) return res.status(401).json({ error: 'Session expired.' });
  req.token = token; req.user = user; next();
}
const requireRole = (...roles) => (req, res, next) => { if (!roles.includes(req.user.role)) return res.status(403).json({ error: `Access denied. (${roles.join(' or ')} only)` }); next(); };
const H = (fn) => (req, res) => fn(req, res).catch((e) => { console.error(e); res.status(500).json({ error: 'Server error — logs dekho.' }); });

/* ================= HEALTH ================= */
app.get('/health', H(async (req, res) => {
  await sql`SELECT 1`;
  res.json({ ok: true, db: 'connected', uptime: Math.round(process.uptime()) });
}));

/* ================= FIRST-RUN SETUP WIZARD ================= */
app.get('/api/setup/status', H(async (req, res) => {
  const [{ c }] = await sql`SELECT COUNT(*)::int AS c FROM users WHERE role = 'admin'`;
  res.json({ needsSetup: c === 0, canShowDemo: process.env.SHOW_DEMO_HINTS === '1' });
}));
app.post('/api/setup/admin', H(async (req, res) => {
  const [{ c }] = await sql`SELECT COUNT(*)::int AS c FROM users WHERE role = 'admin'`;
  if (c > 0) return res.status(403).json({ error: 'Setup already completed — admin exists. Naya admin existing admin hi bana sakta hai.' });
  const { name, username, password, email } = req.body || {};
  if (!name || !username || !password) return res.status(400).json({ error: 'Name, username, password required.' });
  if (String(password).length < 8) return res.status(400).json({ error: 'Admin password min 8 characters ka rakho.' });
  const un = String(username).trim().toLowerCase();
  if ((await sql`SELECT id FROM users WHERE username = ${un}`).length) return res.status(409).json({ error: 'Username taken.' });
  const id = 'A' + Date.now().toString(36).toUpperCase();
  await sql`INSERT INTO users (id, role, name, username, password_hash, email, created_at) VALUES (${id}, 'admin', ${String(name).trim()}, ${un}, ${hashPassword(password)}, ${String(email || '').trim()}, ${nowISO()})`;
  await addAudit('SETUP_ADMIN', un, 'first admin created via setup wizard');
  res.status(201).json({ ok: true, message: 'Admin created! Ab login karo.' });
}));

/* ================= AUTH ================= */
app.post('/api/login', H(async (req, res) => {
  await ready();
  const ip = req.socket.remoteAddress || 'unknown';
  const e = fails.get(ip);
  if (e && e.until > Date.now()) return res.status(429).json({ error: `Locked ${Math.ceil((e.until - Date.now()) / 60000)} more minute(s).` });
  const { username, password } = req.body || {};
  const user = (await sql`SELECT * FROM users WHERE username = ${String(username || '').trim().toLowerCase()}`)[0];
  if (!user || !verifyPassword(password || '', user.password_hash)) {
    const n = (e && e.until <= Date.now() ? 0 : (e ? e.n : 0)) + 1;
    if (n >= 5) { fails.set(ip, { n: 0, until: Date.now() + 15 * 60 * 1000 }); await addAudit('LOCKED', String(username || '?'), ip); } else fails.set(ip, { n, until: 0 });
    await addAudit('LOGIN_FAIL', String(username || '?'), ip);
    return res.status(401).json({ error: 'Invalid username or password.' });
  }
  fails.delete(ip);
  if (user.twofa) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    await sql`INSERT INTO otps (username, code, expires_at, attempts) VALUES (${user.username}, ${code}, ${Date.now() + 5 * 60 * 1000}, 0) ON CONFLICT (username) DO UPDATE SET code = EXCLUDED.code, expires_at = EXCLUDED.expires_at, attempts = 0`;
    const emailed = await sendMail(user.email, 'GLBITM Login OTP', `Your OTP: ${code} (5 min)`);
    return res.json({ need2fa: true, username: user.username, devCode: emailed ? undefined : code });
  }
  finishLogin(user, ip, res);
}));
async function finishLogin(user, ip, res) {
  const token = crypto.randomBytes(24).toString('hex');
  await sql`INSERT INTO sessions (token, user_id, expires_at) VALUES (${token}, ${user.id}, ${new Date(Date.now() + SESSION_DAYS * 86400000).toISOString()})`;
  await sql`DELETE FROM sessions WHERE expires_at <= ${nowISO()}`;
  await addAudit('LOGIN_OK', user.username, `ip ${ip} (${user.role})`);
  res.json({ token, user: publicUser(user) });
}
app.post('/api/login/verify', H(async (req, res) => {
  const { username, code } = req.body || {};
  const row = (await sql`SELECT * FROM otps WHERE username = ${String(username || '').toLowerCase()}`)[0];
  if (!row || row.expires_at < Date.now()) return res.status(400).json({ error: 'OTP expire — dobara login karo.' });
  if (row.attempts >= 5) return res.status(429).json({ error: 'Too many wrong OTPs.' });
  if (String(code).trim() !== row.code) { await sql`UPDATE otps SET attempts = attempts + 1 WHERE username = ${row.username}`; return res.status(401).json({ error: 'Galat OTP.' }); }
  await sql`DELETE FROM otps WHERE username = ${row.username}`;
  const user = (await sql`SELECT * FROM users WHERE username = ${row.username}`)[0];
  if (!user) return res.status(401).json({ error: 'User not found.' });
  finishLogin(user, req.socket.remoteAddress || 'x', res);
}));
app.post('/api/logout', requireAuth, H(async (req, res) => { await addAudit('LOGOUT', req.user.username); await sql`DELETE FROM sessions WHERE token = ${req.token}`; res.json({ ok: true }); }));
app.get('/api/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));
app.post('/api/me/password', requireAuth, H(async (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!verifyPassword(oldPassword || '', req.user.password_hash)) return res.status(400).json({ error: 'Current password galat hai.' });
  if (!newPassword || String(newPassword).length < 4) return res.status(400).json({ error: 'Min 4 characters.' });
  await sql`UPDATE users SET password_hash = ${hashPassword(newPassword)} WHERE id = ${req.user.id}`;
  await addAudit('CHANGE_PW', req.user.username); res.json({ ok: true, message: 'Password changed.' });
}));
/* v8.6: self profile edit (naam/email) — koi bhi role */
app.patch('/api/me/profile', requireAuth, H(async (req, res) => {
  const b = req.body || {};
  const sets = [];
  if ('name' in b && String(b.name).trim()) sets.push(sql`name = ${String(b.name).trim()}`);
  if ('email' in b) sets.push(sql`email = ${String(b.email || '').trim()}`);
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update.' });
  await sql`UPDATE users SET ${sql.join(sets, sql`, `)} WHERE id = ${req.user.id}`;
  await addAudit('PROFILE_EDIT', req.user.username);
  const user = (await sql`SELECT * FROM users WHERE id = ${req.user.id}`)[0];
  res.json({ ok: true, user: publicUser(user), message: 'Profile updated ✏️' });
}));
app.post('/api/me/twofa', requireAuth, H(async (req, res) => {
  const on = req.body && req.body.on ? 1 : 0;
  await sql`UPDATE users SET twofa = ${on} WHERE id = ${req.user.id}`;
  res.json({ ok: true, twofa: !!on, message: on ? '2FA ON — OTP console/email pe.' : '2FA OFF.' });
}));
app.post('/api/me/face', requireAuth, H(async (req, res) => {
  const b = req.body || {};
  if (b.clear) { await sql`UPDATE users SET face = '' WHERE id = ${req.user.id}`; await addAudit('FACE_DEL', req.user.username); return res.json({ ok: true, message: 'Face data removed.' }); }
  const d = b.descriptor;
  if (!Array.isArray(d) || d.length !== 128 || d.some((x) => typeof x !== 'number' || !Number.isFinite(x))) return res.status(400).json({ error: 'Invalid face descriptor.' });
  await sql`UPDATE users SET face = ${JSON.stringify(d)} WHERE id = ${req.user.id}`;
  await addAudit('FACE_REG', req.user.username);
  res.json({ ok: true, message: 'Face registered ✅ — ab self-mark par face match hoga.' });
}));

/* ================= SETTINGS & HOLIDAYS & SECTIONS ================= */
app.get('/api/settings', requireAuth, H(async (req, res) => res.json({ threshold: await getThreshold(), sections: await getSections(), academicYear: await getAcademicYear(), dwr: await getDwrConfig() })));
app.patch('/api/admin/settings', requireAuth, requireRole('admin'), H(async (req, res) => {
  const t = Number((req.body || {}).threshold);
  if (!Number.isFinite(t) || t < 40 || t > 95) return res.status(400).json({ error: 'Threshold 40–95 ke beech rakho.' });
  await sql`INSERT INTO settings (key, value) VALUES ('threshold', ${String(t)}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
  /* v9.0: optional academic year + DWR config in same settings call */
  const b = req.body || {};
  let extra = '';
  if (b.academicYear && /^\d{4}-\d{2}$/.test(String(b.academicYear))) { await sql`INSERT INTO settings (key, value) VALUES ('academic_year', ${String(b.academicYear)}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`; extra += ` · AY ${b.academicYear}`; }
  if (b.dwrCompileTime && /^\d{2}:\d{2}$/.test(String(b.dwrCompileTime))) { await sql`INSERT INTO settings (key, value) VALUES ('dwr_compile_time', ${String(b.dwrCompileTime)}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`; extra += ` · DWR compile ${b.dwrCompileTime}`; }
  if (b.dwrPeriods && Number(b.dwrPeriods) >= 1 && Number(b.dwrPeriods) <= 12) { await sql`INSERT INTO settings (key, value) VALUES ('dwr_periods', ${String(Number(b.dwrPeriods))}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`; extra += ` · periods ${Number(b.dwrPeriods)}`; }
  await addAudit('SETTINGS', req.user.username, `threshold=${t}${extra}`);
  res.json({ ok: true, threshold: t, message: `Threshold set to ${t}%.${extra}` });
}));
app.put('/api/admin/sections', requireAuth, requireRole('admin'), H(async (req, res) => {
  const b = req.body || {};
  const list = Array.isArray(b.sections) ? b.sections : String(b.sections || '').split(',');
  const clean = await saveSections(list);
  await addAudit('SECTIONS', req.user.username, clean.join(', '));
  res.json({ ok: true, sections: clean, message: `Sections set: ${clean.join(', ')}` });
}));
app.get('/api/holidays', requireAuth, H(async (req, res) => res.json({ items: await sql`SELECT * FROM holidays ORDER BY date` })));
app.post('/api/holidays', requireAuth, requireRole('admin'), H(async (req, res) => {
  const date = String((req.body || {}).date || ''), title = String((req.body || {}).title || 'Holiday').slice(0, 80);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Valid date chuno.' });
  await sql`INSERT INTO holidays (date, title) VALUES (${date}, ${title}) ON CONFLICT (date) DO UPDATE SET title = EXCLUDED.title`;
  await addAudit('HOLIDAY_ADD', req.user.username, `${date} ${title}`);
  res.status(201).json({ ok: true });
}));
app.delete('/api/holidays/:date', requireAuth, requireRole('admin'), H(async (req, res) => {
  await sql`DELETE FROM holidays WHERE date = ${req.params.date}`;
  await addAudit('HOLIDAY_DEL', req.user.username, req.params.date);
  res.json({ ok: true });
}));

/* ================= ADMIN: users ================= */
app.get('/api/users', requireAuth, requireRole('admin'), H(async (req, res) => {
  let rows = await sql`SELECT * FROM users ORDER BY role, name`;
  if (req.query.role) rows = rows.filter((u) => u.role === req.query.role);
  res.json({ users: rows.map(publicUser) });
}));
app.post('/api/users', requireAuth, requireRole('admin'), H(async (req, res) => {
  const { role, name, username, password, program, branch, semester, rollNo, section, email, parentOf } = req.body || {};
  const un = String(username || '').trim().toLowerCase();
  if (!['student', 'teacher', 'parent'].includes(role)) return res.status(400).json({ error: 'Invalid role.' });
  if (!un || !password) return res.status(400).json({ error: 'Username aur password required.' });
  if ((await sql`SELECT id FROM users WHERE username = ${un}`).length) return res.status(409).json({ error: 'Username already taken.' });
  const id = role[0].toUpperCase() + Date.now().toString(36).toUpperCase();
  if (role === 'parent') {
    const child = (await sql`SELECT * FROM users WHERE id = ${String(parentOf || '')} AND role = 'student'`)[0];
    if (!child) return res.status(400).json({ error: 'Valid student select karo jiska parent bana hai.' });
    await sql`INSERT INTO users (id, role, name, username, password_hash, email, parent_of, created_at) VALUES (${id}, 'parent', ${'Parent of ' + child.name}, ${un}, ${hashPassword(password)}, ${String(email || '').trim()}, ${child.id}, ${nowISO()})`;
    await addAudit('USER_ADD', req.user.username, `parent "${un}" → ${child.username}`);
    return res.status(201).json({ user: publicUser((await sql`SELECT * FROM users WHERE id = ${id}`)[0]) });
  }
  if (!name || !program || !PROGRAMS[program]) return res.status(400).json({ error: 'Name aur valid program required.' });
  if (role === 'student') {
    if (!PROGRAMS[program].branches.includes(branch)) return res.status(400).json({ error: 'Invalid branch.' });
    const s = Number(semester);
    if (!s || s < 1 || s > PROGRAMS[program].sems) return res.status(400).json({ error: `Semester 1–${PROGRAMS[program].sems}.` });
  }
  await sql`INSERT INTO users (id, role, name, username, password_hash, program, branch, semester, section, roll_no, email, subjects, card_id, created_at) VALUES (${id}, ${role}, ${String(name).trim()}, ${un}, ${hashPassword(password)}, ${program}, ${role === 'student' ? branch : String(branch || '').trim()}, ${role === 'student' ? Number(semester) : null}, ${String(section || '').trim().toUpperCase()}, ${role === 'student' ? String(rollNo || '').trim() : ''}, ${String(email || '').trim()}, ${JSON.stringify(role === 'teacher' ? parseSubjectList(req.body.subjects) : [])}, ${String(req.body.cardId || '').trim().toUpperCase()}, ${nowISO()})`;
  await addAudit('USER_ADD', req.user.username, `${role} "${un}" (${program})`);
  res.status(201).json({ user: publicUser((await sql`SELECT * FROM users WHERE id = ${id}`)[0]) });
}));
app.post('/api/users/bulk', requireAuth, requireRole('admin'), H(async (req, res) => {
  const list = Array.isArray(req.body && req.body.students) ? req.body.students : [];
  if (!list.length) return res.status(400).json({ error: 'Koi row nahi mili.' });
  let added = 0, skipped = 0, skippedEmpty = 0; const errors = [];
  for (let i = 0; i < list.length; i++) {
    const s = list[i], row = i + 2;
    const name = String(s.name || '').trim(), un = String(s.username || '').trim().toLowerCase();
    const pw = String(s.password || '');
    if (!name && !un && !pw) { skippedEmpty++; continue; }
    if (!name || !un || !pw) { errors.push(`Row ${row}: name/username/password khaali`); continue; }
    if ((await sql`SELECT id FROM users WHERE username = ${un}`).length) { skipped++; continue; }
    const role = String(s.role || 'student').trim().toLowerCase() === 'teacher' ? 'teacher' : 'student';
    if (role === 'teacher') {
      const program = PROGRAMS[s.program] ? s.program : '';
      await sql`INSERT INTO users (id, role, name, username, password_hash, program, branch, email, subjects, created_at) VALUES (${'T' + Date.now().toString(36).toUpperCase() + i}, 'teacher', ${name}, ${un}, ${hashPassword(pw)}, ${program}, ${String(s.branch || '').trim()}, ${String(s.email || '').trim()}, ${JSON.stringify(parseSubjectList(s.subjects))}, ${nowISO()})`;
    } else {
      const program = PROGRAMS[s.program] ? s.program : null;
      const branch = String(s.branch || '').trim(), sem = Number(s.semester);
      if (!program) { errors.push(`Row ${row}: program invalid (B.Tech/BCA/MBA...)`); continue; }
      if (!PROGRAMS[program].branches.includes(branch)) { errors.push(`Row ${row}: branch "${branch}" ${program} ke liye invalid`); continue; }
      if (!sem || sem < 1 || sem > PROGRAMS[program].sems) { errors.push(`Row ${row}: semester 1–${PROGRAMS[program].sems}`); continue; }
      await sql`INSERT INTO users (id, role, name, username, password_hash, program, branch, semester, section, roll_no, email, created_at) VALUES (${'S' + Date.now().toString(36).toUpperCase() + i}, 'student', ${name}, ${un}, ${hashPassword(pw)}, ${program}, ${branch}, ${sem}, ${String(s.section || '').toUpperCase()}, ${String(s.rollNo || '').trim()}, ${String(s.email || '').trim()}, ${nowISO()})`;
    }
    added++;
  }
  await addAudit('USER_BULK', req.user.username, `${added} added (${skipped} dup, ${skippedEmpty} empty, ${errors.length} invalid)`);
  res.json({ ok: true, added, skipped, skippedEmpty, errors: errors.slice(0, 15), message: `${added} added · ${skipped} duplicate skip · ${skippedEmpty} empty ignored · ${errors.length} invalid.` });
}));
app.post('/api/admin/promote', requireAuth, requireRole('admin'), H(async (req, res) => {
  const program = String((req.body || {}).program || '');
  if (program && !PROGRAMS[program]) return res.status(400).json({ error: 'Invalid program.' });
  const caseSql = sql.join(Object.entries(PROGRAMS).map(([p, v]) => sql`WHEN ${p} THEN ${v.sems}`), sql` `);
  const r = program
    ? await sql`UPDATE users SET semester = semester + 1 WHERE role = 'student' AND program = ${program} AND semester < ${PROGRAMS[program].sems}`
    : await sql`UPDATE users SET semester = semester + 1 WHERE role = 'student' AND semester < (CASE program ${caseSql} END)::int`;
  await addAudit('PROMOTE', req.user.username, `${r.count} students`);
  res.json({ ok: true, message: `${r.count} students promoted. 🎓` });
}));
/* v8.6: PATCH me role change support (promote/demote) */
app.patch('/api/users/:id', requireAuth, requireRole('admin'), H(async (req, res) => {
  const b = req.body || {};
  const row = (await sql`SELECT * FROM users WHERE id = ${req.params.id}`)[0];
  if (!row) return res.status(404).json({ error: 'User not found.' });
  const sets = [];
  if ('role' in b) {
    const newRole = String(b.role).trim().toLowerCase();
    if (!['student', 'teacher', 'admin'].includes(newRole)) return res.status(400).json({ error: 'Invalid role.' });
    if (newRole !== row.role && row.role === 'admin') {
      const [{ c }] = await sql`SELECT COUNT(*)::int AS c FROM users WHERE role = 'admin'`;
      if (c <= 1) return res.status(400).json({ error: '🛡️ Last admin demote nahi ho sakta! Pehle kisi aur ko admin banao.' });
      await addAudit('ROLE_DEMOTE', req.user.username, `${row.username} admin → ${newRole}`);
    }
    if (newRole !== row.role && newRole === 'admin') await addAudit('ROLE_PROMOTE', req.user.username, `${row.username} → admin`);
    sets.push(sql`role = ${newRole}`);
    if (newRole === 'admin') sets.push(sql`subjects = '[]'`);
    if (newRole === 'student') {
      sets.push(sql`branch = COALESCE(NULLIF(branch, ''), 'General')`);
      sets.push(sql`semester = COALESCE(semester, 1)`);
      if (!PROGRAMS[row.program]) sets.push(sql`program = 'B.Tech'`);
    }
  }
  if ('name' in b && String(b.name).trim()) sets.push(sql`name = ${String(b.name).trim()}`);
  if ('program' in b) { if (!PROGRAMS[b.program]) return res.status(400).json({ error: 'Invalid program.' }); sets.push(sql`program = ${b.program}`); }
  if ('branch' in b) { if (!PROGRAMS[b.program || row.program] || !PROGRAMS[b.program || row.program].branches.includes(b.branch)) return res.status(400).json({ error: 'Invalid branch.' }); sets.push(sql`branch = ${b.branch}`); }
  if ('semester' in b) { const s = Number(b.semester); if (PROGRAMS[b.program || row.program] && (s < 1 || s > PROGRAMS[b.program || row.program].sems)) return res.status(400).json({ error: 'Semester range galat.' }); sets.push(sql`semester = ${s}`); }
  if ('section' in b) sets.push(sql`section = ${String(b.section || '').trim().toUpperCase()}`);
  if ('email' in b) sets.push(sql`email = ${String(b.email || '').trim()}`);
  if ('rollNo' in b) sets.push(sql`roll_no = ${String(b.rollNo || '').trim()}`);
  if ('batch' in b) sets.push(sql`batch = ${String(b.batch || '').trim().slice(0, 30)}`);
  if ('status' in b && ['active', 'alumni'].includes(String(b.status))) { sets.push(sql`status = ${String(b.status)}`); if (String(b.status) === 'alumni' && !row.graduated_on) sets.push(sql`graduated_on = ${todayStamp()}`); if (String(b.status) === 'active') sets.push(sql`graduated_on = ''`); }
  if ('cardId' in b) sets.push(sql`card_id = ${String(b.cardId || '').trim().toUpperCase()}`);
  if ('subjects' in b) { if (row.role !== 'teacher' && !(('role' in b) && b.role === 'teacher')) return res.status(400).json({ error: 'Teachers only.' }); sets.push(sql`subjects = ${JSON.stringify(parseSubjectList(b.subjects))}`); }
  if ('password' in b) { const p = String(b.password || ''); if (p.length < 4) return res.status(400).json({ error: 'Min 4 chars.' }); sets.push(sql`password_hash = ${hashPassword(p)}`); }
  if ('twofa' in b) sets.push(sql`twofa = ${b.twofa ? 1 : 0}`);
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update.' });
  await sql`UPDATE users SET ${sql.join(sets, sql`, `)} WHERE id = ${row.id}`;
  if (!('role' in b)) await addAudit('USER_EDIT', req.user.username, row.username);
  res.json({ user: publicUser((await sql`SELECT * FROM users WHERE id = ${row.id}`)[0]) });
}));
/* v8.6: last-admin delete protection */
app.delete('/api/users/:id', requireAuth, requireRole('admin'), H(async (req, res) => {
  const row = (await sql`SELECT * FROM users WHERE id = ${req.params.id}`)[0];
  if (!row) return res.status(404).json({ error: 'User not found.' });
  if (row.role === 'admin') {
    const [{ c }] = await sql`SELECT COUNT(*)::int AS c FROM users WHERE role = 'admin'`;
    if (c <= 1) return res.status(400).json({ error: '🛡️ Last admin delete nahi ho sakta! Pehle kisi aur ko admin banao.' });
  }
  await sql`DELETE FROM entries WHERE student_id = ${row.id}`;
  await sql`DELETE FROM marks WHERE student_id = ${row.id}`;
  await sql`DELETE FROM leaves WHERE student_id = ${row.id}`;
  await sql`DELETE FROM sessions WHERE user_id = ${row.id}`;
  await sql`DELETE FROM users WHERE id = ${row.id}`;
  await addAudit('USER_DEL', req.user.username, row.username);
  res.json({ ok: true, removedId: row.id });
}));

/* ================= TEACHER: roster & attendance ================= */
app.get('/api/students', requireAuth, requireRole('teacher', 'admin'), H(async (req, res) => {
  const conds = [sql`role = 'student'`, isActiveUser('status')];
  if (req.query.program) conds.push(sql`program = ${req.query.program}`);
  if (req.query.branch) conds.push(sql`branch = ${req.query.branch}`);
  if (req.query.semester) conds.push(sql`semester = ${Number(req.query.semester)}`);
  if (req.query.section) conds.push(sql`section = ${String(req.query.section).toUpperCase()}`);
  const rows = await sql`SELECT * FROM users WHERE ${sql.join(conds, sql` AND `)} ORDER BY roll_no, name`;
  res.json({ students: rows.map(publicUser) });
}));
app.get('/api/attendance/class', requireAuth, requireRole('teacher', 'admin'), H(async (req, res) => {
  const rec = (await sql`SELECT * FROM records WHERE date = ${String(req.query.date)} AND program = ${String(req.query.program)} AND branch = ${String(req.query.branch || '')} AND semester = ${Number(req.query.semester)} AND section = ${String(req.query.section || '')} AND subject = ${String(req.query.subject)}`)[0];
  if (!rec) return res.json({ record: null, locked: false, note: '' });
  const entries = await sql`SELECT student_id AS "studentId", status FROM entries WHERE record_id = ${rec.id}`;
  res.json({ record: { ...rec, entries }, locked: Date.now() - Date.parse(rec.created_at) > EDIT_LOCK_MS });
}));
app.post('/api/attendance', requireAuth, requireRole('teacher', 'admin'), H(async (req, res) => {
  const { date } = req.body || {};
  const program = String((req.body || {}).program || '').trim();
  const branch = String((req.body || {}).branch || '').trim();
  const section = String((req.body || {}).section || '').trim().toUpperCase();
  const semester = Number((req.body || {}).semester);
  const subject = String((req.body || {}).subject || '').trim();
  const note = String((req.body || {}).note || '').slice(0, 200);
  if (!date || !program || !semester || !subject) return res.status(400).json({ error: 'Program, semester, subject, date required.' });
  const assigned = assignedSubjects(req.user);
  if (assigned.length && !assigned.includes(subject)) return res.status(403).json({ error: `"${subject}" tumhara subject nahi. Yours: ${assigned.join(', ')}.` });
  if (!Array.isArray(req.body.entries) || !req.body.entries.length) return res.status(400).json({ error: 'No entries.' });
  const clean = req.body.entries.filter((e) => e && e.studentId && VALID_STATUSES.includes(e.status)).map((e) => ({ studentId: e.studentId, status: e.status }));
  if (!clean.length) return res.status(400).json({ error: 'Entries need studentId + status.' });
  const old = (await sql`SELECT * FROM records WHERE date = ${date} AND program = ${program} AND branch = ${branch} AND semester = ${semester} AND section = ${section} AND subject = ${subject}`)[0];
  if (old && Date.now() - Date.parse(old.created_at) > EDIT_LOCK_MS && req.user.role !== 'admin')
    return res.status(403).json({ error: '🔒 24h+ purana session — edit lock hai. Admin se contact karo.' });
  if (old) { await sql`DELETE FROM entries WHERE record_id = ${old.id}`; await sql`DELETE FROM records WHERE id = ${old.id}`; if (req.user.role === 'admin') await addAudit('ATT_EDIT_LATE', req.user.username, `record ${old.id}`); }
  const [rec] = await sql`INSERT INTO records (date, program, branch, semester, section, subject, teacher_id, note, created_at) VALUES (${date}, ${program}, ${branch}, ${semester}, ${section}, ${subject}, ${req.user.id}, ${note}, ${nowISO()}) RETURNING id`;
  for (const e of clean) await sql`INSERT INTO entries (record_id, student_id, status) VALUES (${rec.id}, ${e.studentId}, ${e.status})`;
  await addAudit('ATT_SAVE', req.user.username, `${program} sem${semester} ${subject} ${date} (${clean.length})`);
  res.status(201).json({ ok: true, message: `Saved for ${clean.length} students.` });
}));

/* ================= TIMETABLE ================= */
app.get('/api/timetable', requireAuth, H(async (req, res) => {
  let program, branch, semester, section;
  if (req.user.role === 'student') ({ program, branch, semester, section } = req.user);
  else if (req.user.role === 'parent') {
    const child = (await sql`SELECT * FROM users WHERE id = ${req.user.parent_of}`)[0];
    if (!child) return res.json({ items: [] });
    ({ program, branch, semester, section } = child);
  } else { program = req.query.program; branch = req.query.branch; semester = req.query.semester; section = req.query.section; }
  const rows = await sql`SELECT t.id, t.program, t.branch, t.semester, t.section, t.day, t.period, t.subject, t.teacher_id, u.name AS "teacherName" FROM timetable t LEFT JOIN users u ON u.id = t.teacher_id WHERE t.program = ${program} AND t.branch = ${branch || ''} AND t.semester = ${Number(semester)} AND t.section = ${String(section || '')} ORDER BY t.period`;
  res.json({ items: rows, days: DAYS });
}));
app.post('/api/timetable', requireAuth, requireRole('admin'), H(async (req, res) => {
  const { program, branch, semester, section, day, period, subject, teacherId } = req.body || {};
  if (!PROGRAMS[program] || !DAYS.includes(day)) return res.status(400).json({ error: 'Invalid program/day.' });
  const p = Number(period);
  if (!p || p < 1 || p > 8) return res.status(400).json({ error: 'Period 1–8.' });
  if (!String(subject || '').trim()) return res.status(400).json({ error: 'Subject required.' });
  await sql`INSERT INTO timetable (program, branch, semester, section, day, period, subject, teacher_id) VALUES (${program}, ${branch || ''}, ${Number(semester)}, ${String(section || '').toUpperCase()}, ${day}, ${p}, ${String(subject).trim()}, ${String(teacherId || '')})`;
  await addAudit('TT_ADD', req.user.username, `${program} sem${semester} ${day} P${p} ${subject}`);
  res.status(201).json({ ok: true });
}));
app.patch('/api/timetable/:id', requireAuth, requireRole('admin'), H(async (req, res) => {
  await sql`UPDATE timetable SET teacher_id = ${String((req.body || {}).teacherId || '')} WHERE id = ${req.params.id}`;
  await addAudit('TT_SUB', req.user.username, `slot ${req.params.id}`);
  res.json({ ok: true, message: 'Teacher reassigned (substitution done).' });
}));
app.delete('/api/timetable/:id', requireAuth, requireRole('admin'), H(async (req, res) => {
  await sql`DELETE FROM timetable WHERE id = ${req.params.id}`;
  await addAudit('TT_DEL', req.user.username, req.params.id);
  res.json({ ok: true });
}));

/* ================= LEAVES ================= */
app.post('/api/leaves', requireAuth, requireRole('student'), H(async (req, res) => {
  const date = String((req.body || {}).date || ''), type = String((req.body || {}).type || 'casual'), reason = String((req.body || {}).reason || '').slice(0, 300);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Valid date.' });
  if (!['casual', 'medical', 'duty'].includes(type)) return res.status(400).json({ error: 'Invalid type.' });
  await sql`INSERT INTO leaves (student_id, date, type, reason, ts) VALUES (${req.user.id}, ${date}, ${type}, ${reason}, ${nowISO()})`;
  await addAudit('LEAVE_NEW', req.user.username, `${type} ${date}`);
  res.status(201).json({ ok: true, message: 'Leave submitted.' });
}));
app.get('/api/leaves', requireAuth, H(async (req, res) => {
  if (req.user.role === 'student') return res.json({ items: await sql`SELECT * FROM leaves WHERE student_id = ${req.user.id} ORDER BY id DESC` });
  if (req.user.role === 'parent') return res.json({ items: await sql`SELECT * FROM leaves WHERE student_id = ${req.user.parent_of} ORDER BY id DESC` });
  res.json({ items: await sql`SELECT l.*, u.name AS "studentName", u.roll_no AS "rollNo" FROM leaves l JOIN users u ON u.id = l.student_id ORDER BY CASE l.status WHEN 'pending' THEN 0 ELSE 1 END, l.id DESC` });
}));
app.post('/api/leaves/:id/decide', requireAuth, requireRole('admin'), H(async (req, res) => {
  const decision = (req.body || {}).decision;
  if (!['approved', 'rejected'].includes(decision)) return res.status(400).json({ error: 'Invalid decision.' });
  const row = (await sql`SELECT * FROM leaves WHERE id = ${req.params.id}`)[0];
  if (!row) return res.status(404).json({ error: 'Not found.' });
  await sql`UPDATE leaves SET status = ${decision}, decided_by = ${req.user.username} WHERE id = ${row.id}`;
  const stu = (await sql`SELECT * FROM users WHERE id = ${row.student_id}`)[0];
  if (stu) sendMail(stu.email, `Leave ${decision}`, `Your ${row.type} leave for ${row.date}: ${decision}.`);
  await addAudit(decision === 'approved' ? 'LEAVE_OK' : 'LEAVE_NO', req.user.username, `#${row.id}`);
  res.json({ ok: true, message: `Leave ${decision}.` });
}));

/* ================= CORRECTIONS ================= */
app.post('/api/corrections', requireAuth, requireRole('student'), H(async (req, res) => {
  const entryId = Number((req.body || {}).entryId), requested = String((req.body || {}).requested);
  const reason = String((req.body || {}).reason || '').slice(0, 300);
  if (!VALID_STATUSES.includes(requested)) return res.status(400).json({ error: 'Invalid status.' });
  const entry = (await sql`SELECT * FROM entries WHERE id = ${entryId} AND student_id = ${req.user.id}`)[0];
  if (!entry) return res.status(404).json({ error: 'Entry not found.' });
  if ((await sql`SELECT id FROM corrections WHERE entry_id = ${entryId} AND status = 'pending'`).length) return res.status(409).json({ error: 'Already pending.' });
  await sql`INSERT INTO corrections (student_id, entry_id, requested, reason, ts) VALUES (${req.user.id}, ${entryId}, ${requested}, ${reason}, ${nowISO()})`;
  await addAudit('FIX_REQ', req.user.username, `#${entryId} → ${requested}`);
  res.status(201).json({ ok: true, message: 'Correction request bheji gayi.' });
}));
app.get('/api/corrections', requireAuth, requireRole('admin'), H(async (req, res) => {
  res.json({ items: await sql`SELECT c.*, u.name AS "studentName", e.status AS current, r.date, r.subject FROM corrections c JOIN users u ON u.id = c.student_id JOIN entries e ON e.id = c.entry_id JOIN records r ON r.id = e.record_id ORDER BY CASE c.status WHEN 'pending' THEN 0 ELSE 1 END, c.id DESC LIMIT 100` });
}));
app.post('/api/corrections/:id/decide', requireAuth, requireRole('admin'), H(async (req, res) => {
  const decision = (req.body || {}).decision;
  const row = (await sql`SELECT * FROM corrections WHERE id = ${req.params.id}`)[0];
  if (!row) return res.status(404).json({ error: 'Not found.' });
  if (decision === 'approved') await sql`UPDATE entries SET status = ${row.requested} WHERE id = ${row.entry_id}`;
  await sql`UPDATE corrections SET status = ${decision}, decided_by = ${req.user.username} WHERE id = ${row.id}`;
  await addAudit(decision === 'approved' ? 'FIX_OK' : 'FIX_NO', req.user.username, `#${row.id}`);
  res.json({ ok: true, message: `Correction ${decision}.` });
}));

/* ================= MARKS ================= */
app.post('/api/marks/bulk', requireAuth, requireRole('teacher', 'admin'), H(async (req, res) => {
  const { subject, exam } = req.body || {};
  const max = Number((req.body || {}).max);
  if (!subject || !exam || !max || max <= 0) return res.status(400).json({ error: 'Subject, exam, max required.' });
  const assigned = assignedSubjects(req.user);
  if (assigned.length && !assigned.includes(subject)) return res.status(403).json({ error: `"${subject}" tumhara nahi hai.` });
  /* v9.1: status support — scored (default) / absent / debarred. Absent/Debarred me score optional (0 count hota hai). */
  const list = Array.isArray(req.body.entries) ? req.body.entries.filter((e) => e && e.studentId
    && (Number.isFinite(Number(e.score)) || ['absent', 'debarred'].includes(String(e.status || '')))) : [];
  if (!list.length) return res.status(400).json({ error: 'No valid scores.' });
  const ay = await getAcademicYear();
  let n = 0;
  for (const e of list) {
    const status = ['absent', 'debarred'].includes(String(e.status)) ? String(e.status) : 'scored';
    const rawScore = Number(e.score);
    const score = Number.isFinite(rawScore) ? Math.max(0, Math.min(max, rawScore)) : 0;
    await sql`DELETE FROM marks WHERE student_id = ${e.studentId} AND subject = ${subject} AND exam = ${exam}`;
    await sql`INSERT INTO marks (student_id, subject, exam, score, max, status, academic_year, ts) VALUES (${e.studentId}, ${subject}, ${exam}, ${score}, ${max}, ${status}, ${ay}, ${nowISO()})`;
    n++;
  }
  await addAudit('MARKS', req.user.username, `${subject} ${exam} (${n})`);
  res.json({ ok: true, message: `${n} marks saved for ${subject} · ${exam}.` });
}));
app.get('/api/marks/mine', requireAuth, requireRole('student'), H(async (req, res) => {
  res.json({ items: await sql`SELECT subject, exam, score, max, ts FROM marks WHERE student_id = ${req.user.id} ORDER BY subject, exam` });
}));
app.get('/api/marks/child', requireAuth, requireRole('parent'), H(async (req, res) => {
  res.json({ items: await sql`SELECT subject, exam, score, max, ts FROM marks WHERE student_id = ${req.user.parent_of} ORDER BY subject, exam` });
}));
app.get('/api/marks/class', requireAuth, requireRole('teacher', 'admin'), H(async (req, res) => {
  res.json({ items: await sql`SELECT m.student_id, m.score, m.max, m.status, m.ts FROM marks m JOIN users u ON u.id = m.student_id WHERE m.subject = ${String(req.query.subject)} AND m.exam = ${String(req.query.exam)} AND u.program = ${String(req.query.program)} AND u.branch = ${String(req.query.branch || '')} AND u.semester = ${Number(req.query.semester)} AND u.section = ${String(req.query.section || '')}` });
}));

/* ================= ROTATING QR SELF-MARK ================= */
app.post('/api/selfmark/open', requireAuth, requireRole('teacher'), H(async (req, res) => {
  const { program, branch, semester, section, subject, date, useGeo } = req.body || {};
  if (!program || !semester || !subject || !date) return res.status(400).json({ error: 'Class details missing.' });
  const session = crypto.randomBytes(5).toString('hex').toUpperCase();
  const secret = crypto.randomBytes(24).toString('hex');
  await sql`INSERT INTO markcodes (id, secret, teacher_id, program, branch, semester, section, subject, date, geo, expires_at) VALUES (${session}, ${secret}, ${req.user.id}, ${program}, ${String(branch || '')}, ${Number(semester)}, ${String(section || '').toUpperCase()}, ${subject}, ${date}, ${useGeo ? `${CAMPUS.lat},${CAMPUS.lng},${CAMPUS.radius}` : ''}, ${Date.now() + 15 * 60 * 1000})`;
  await addAudit('SM_OPEN', req.user.username, `${subject} ${date} geo=${!!useGeo}`);
  res.status(201).json({ ok: true, session, minutes: 15, campus: CAMPUS });
}));
app.get('/api/selfmark/rotate', requireAuth, requireRole('teacher', 'admin'), H(async (req, res) => {
  const row = (await sql`SELECT * FROM markcodes WHERE id = ${String(req.query.session || '')}`)[0];
  if (!row || row.expires_at < Date.now()) return res.status(400).json({ error: 'Session invalid/expired.' });
  res.json({ code: rotCode(row.secret, Math.floor(Date.now() / 30000)) });
}));
app.get('/api/selfmark/status', requireAuth, requireRole('teacher', 'admin'), H(async (req, res) => {
  const row = (await sql`SELECT * FROM markcodes WHERE id = ${String(req.query.session || '')}`)[0];
  if (!row) return res.json({ closed: true, items: [] });
  const items = await sql`SELECT s.*, u.name, u.roll_no AS "rollNo" FROM selfmarks s JOIN users u ON u.id = s.student_id WHERE s.session = ${row.id} ORDER BY s.id DESC`;
  res.json({ closed: row.expires_at < Date.now(), items, geo: !!row.geo });
}));
app.post('/api/selfmark/close', requireAuth, requireRole('teacher'), H(async (req, res) => {
  await sql`DELETE FROM markcodes WHERE id = ${String((req.body || {}).session || '')} AND teacher_id = ${req.user.id}`;
  res.json({ ok: true, message: 'Session closed.' });
}));
app.post('/api/selfmark/mark', requireAuth, requireRole('student'), H(async (req, res) => {
  const session = String((req.body || {}).session || '').trim();
  const code = String((req.body || {}).code || '').trim();
  const mc = (await sql`SELECT * FROM markcodes WHERE id = ${session}`)[0];
  if (!mc || mc.expires_at < Date.now()) return res.status(400).json({ error: 'Session invalid ya expire.' });
  const win = Math.floor(Date.now() / 30000);
  if (![rotCode(mc.secret, win), rotCode(mc.secret, win - 1), rotCode(mc.secret, win + 1)].includes(code))
    return res.status(401).json({ error: '⏱️ Code galat/purana — CURRENT code lo (har 30s badalta hai).' });
  const me = req.user;
  if (me.program !== mc.program || me.semester !== mc.semester || (me.branch || '') !== (mc.branch || '') || (me.section || '') !== (mc.section || ''))
    return res.status(403).json({ error: 'Ye class tumhari nahi hai.' });
  const device = String((req.body || {}).device || ''), ip = req.socket.remoteAddress || 'unknown';
  const devClash = device ? (await sql`SELECT student_id FROM selfmarks WHERE session = ${session} AND device = ${device} AND student_id != ${me.id}`)[0] : null;
  if (devClash) {
    await sql`INSERT INTO selfmarks (session, student_id, device, ip, flagged, ts) VALUES (${session}, ${me.id}, ${device}, ${ip}, 1, ${nowISO()})`;
    await addAudit('PROXY_FLAG', me.username, `device clash ${session}`);
    return res.status(403).json({ error: '🚫 Proxy! Ye device is session me already use ho chuka hai.' });
  }
  if ((await sql`SELECT COUNT(DISTINCT student_id)::int AS c FROM selfmarks WHERE session = ${session} AND ip = ${ip}`)[0].c >= 4)
    return res.status(403).json({ error: '🚫 Is IP se bahut zyada marks — proxy flag!' });
  if (mc.geo) {
    const [clat, clng, crad] = mc.geo.split(',').map(Number);
    const lat = Number((req.body || {}).lat), lng = Number((req.body || {}).lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return res.status(400).json({ error: 'Location allow karo.' });
    const dist = haversine(lat, lng, clat, clng);
    if (dist > crad) return res.status(403).json({ error: `📍 Campus ke bahar (${dist}m). Radius ${crad}m.` });
  }
  const faceStored = (await sql`SELECT face FROM users WHERE id = ${me.id}`)[0].face;
  if (faceStored) {
    const fd = (req.body || {}).face;
    if (!Array.isArray(fd) || fd.length !== 128) return res.status(400).json({ error: '🧠 Face scan required — selfie+face ON karke try karo.' });
    const a = JSON.parse(faceStored);
    let sum = 0; for (let i = 0; i < 128; i++) sum += (a[i] - fd[i]) ** 2;
    const dist = Math.sqrt(sum);
    if (dist > 0.55) { await addAudit('FACE_FAIL', me.username, `dist=${dist.toFixed(2)} session ${session}`); return res.status(403).json({ error: '🧠 Face match nahi hua! Sirf khud ki attendance mark karo.' }); }
    await addAudit('FACE_OK', me.username, `dist=${dist.toFixed(2)}`);
  }
  let rec = (await sql`SELECT * FROM records WHERE date = ${mc.date} AND program = ${mc.program} AND branch = ${mc.branch} AND semester = ${mc.semester} AND section = ${mc.section} AND subject = ${mc.subject}`)[0];
  if (!rec) {
    const [nr] = await sql`INSERT INTO records (date, program, branch, semester, section, subject, teacher_id, note, created_at) VALUES (${mc.date}, ${mc.program}, ${mc.branch}, ${mc.semester}, ${mc.section}, ${mc.subject}, ${mc.teacher_id}, 'Self-marked', ${nowISO()}) RETURNING id`;
    rec = { id: nr.id };
  }
  const existing = (await sql`SELECT * FROM entries WHERE record_id = ${rec.id} AND student_id = ${me.id}`)[0];
  if (existing && existing.status !== 'absent') return res.status(409).json({ error: 'Already marked.' });
  if (existing) await sql`UPDATE entries SET status = 'present' WHERE id = ${existing.id}`;
  else await sql`INSERT INTO entries (record_id, student_id, status) VALUES (${rec.id}, ${me.id}, 'present')`;
  await sql`INSERT INTO selfmarks (session, student_id, device, ip, ts) VALUES (${session}, ${me.id}, ${device}, ${ip}, ${nowISO()})`;
  await addAudit('SELFMARK', me.username, `${mc.subject} ${mc.date}`);
  res.status(201).json({ ok: true, message: '✅ Self-marked present!' });
}));

/* ================= ANALYTICS ================= */
async function studentStats(studentId, opts = {}) {
  const holidays = new Set((await sql`SELECT date FROM holidays`).map((h) => h.date));
  const conds = [sql`e.student_id = ${studentId}`];
  if (opts.from) conds.push(sql`r.date >= ${opts.from}`);
  if (opts.to) conds.push(sql`r.date <= ${opts.to}`);
  const rows = await sql`SELECT r.date, r.subject, e.status, e.id AS "entryId" FROM entries e JOIN records r ON r.id = e.record_id WHERE ${sql.join(conds, sql` AND `)} ORDER BY r.date`;
  let total = 0, present = 0, late = 0;
  const subjectMap = {}; const logs = [];
  for (const r of rows) {
    if (holidays.has(r.date)) continue;
    total += 1;
    if (r.status === 'present') present += 1; else if (r.status === 'late') late += 1;
    const s = subjectMap[r.subject] || (subjectMap[r.subject] = { total: 0, present: 0, late: 0 });
    s.total += 1;
    if (r.status === 'present') s.present += 1; else if (r.status === 'late') s.late += 1;
    logs.push({ date: r.date, subject: r.subject, status: r.status, entryId: Number(r.entryId) });
  }
  logs.sort((a, b) => b.date.localeCompare(a.date));
  const pct = (p, l, t) => (t ? Math.round(((p + l) / t) * 100) : 0);
  return {
    total, present, late, absent: total - present - late, attended: present + late,
    percentage: pct(present, late, total), threshold: await getThreshold(),
    subjects: Object.entries(subjectMap).map(([subject, s]) => ({ subject, total: s.total, present: s.present, late: s.late, percentage: pct(s.present, s.late, s.total) })),
    logs,
  };
}
app.get('/api/me/attendance', requireAuth, requireRole('student'), H(async (req, res) => res.json(await studentStats(req.user.id, { from: req.query.from, to: req.query.to }))));
app.get('/api/parent/child', requireAuth, requireRole('parent'), H(async (req, res) => {
  const child = (await sql`SELECT * FROM users WHERE id = ${req.user.parent_of}`)[0];
  if (!child) return res.status(404).json({ error: 'Child link missing.' });
  res.json({ user: publicUser(child), stats: await studentStats(child.id) });
}));

/* ================= ADMIN REPORTS (batch — N+1 eliminated) ================= */
async function batchStats(opts = {}) {
  const holidays = new Set((await sql`SELECT date FROM holidays`).map((h) => h.date));
  const conds = [sql`u.role = 'student'`, isActiveUser('u.status')];
  if (opts.from) conds.push(sql`r.date >= ${opts.from}`);
  if (opts.to) conds.push(sql`r.date <= ${opts.to}`);
  const rows = await sql`SELECT u.id AS sid, u.name, u.roll_no AS "rollNo", u.program, u.branch, u.semester, u.section, r.date, r.subject, e.status
    FROM entries e
    JOIN records r ON r.id = e.record_id
    JOIN users u ON u.id = e.student_id
    WHERE ${sql.join(conds, sql` AND `)}`;
  const map = new Map();
  for (const r of rows) {
    if (holidays.has(r.date)) continue;
    let st = map.get(r.sid);
    if (!st) {
      st = { id: r.sid, name: r.name, rollNo: r.rollNo, program: r.program, branch: r.branch, semester: r.semester, section: r.section, total: 0, present: 0, late: 0, subjectMap: {}, logs: [] };
      map.set(r.sid, st);
    }
    st.total += 1;
    if (r.status === 'present') st.present += 1; else if (r.status === 'late') st.late += 1;
    const sb = st.subjectMap[r.subject] || (st.subjectMap[r.subject] = { total: 0, present: 0, late: 0 });
    sb.total += 1;
    if (r.status === 'present') sb.present += 1; else if (r.status === 'late') sb.late += 1;
    st.logs.push({ date: r.date, subject: r.subject, status: r.status });
  }
  const pct = (p, l, t) => (t ? Math.round(((p + l) / t) * 100) : 0);
  const th = await getThreshold();
  const out = new Map();
  for (const st of map.values()) {
    st.absent = st.total - st.present - st.late;
    st.attended = st.present + st.late;
    st.percentage = pct(st.present, st.late, st.total);
    st.threshold = th;
    st.subjects = Object.entries(st.subjectMap).map(([subject, s]) => ({ subject, total: s.total, present: s.present, late: s.late, percentage: pct(s.present, s.late, s.total) }));
    delete st.subjectMap;
    st.logs.sort((a, b) => b.date.localeCompare(a.date));
    out.set(st.id, st);
  }
  return out;
}
const EMPTY_STATS = () => ({ total: 0, present: 0, late: 0, absent: 0, attended: 0, percentage: 0, subjects: [], logs: [] });
app.get('/api/leaderboard', requireAuth, H(async (req, res) => {
  const stats = await batchStats();
  const list = [];
  for (const st of stats.values()) { if (st.total > 0) list.push({ id: st.id, name: st.name, label: classLabel(st), semester: st.semester, pct: st.percentage, total: st.total }); }
  list.sort((a, b) => b.pct - a.pct);
  const meIdx = list.findIndex((r) => r.id === req.user.id);
  res.json({ top: list.slice(0, 5), myRank: meIdx >= 0 ? meIdx + 1 : null, classSize: list.length });
}));
app.get('/api/reports/summary', requireAuth, requireRole('admin'), H(async (req, res) => {
  const stats = await batchStats();
  let total = 0, attended = 0;
  for (const st of stats.values()) { total += st.total; attended += st.attended; }
  const [{ c: students }] = await sql`SELECT COUNT(*)::int AS c FROM users WHERE role = 'student'`;
  const [{ c: teachers }] = await sql`SELECT COUNT(*)::int AS c FROM users WHERE role = 'teacher'`;
  const [{ c: sessions }] = await sql`SELECT COUNT(*)::int AS c FROM records`;
  res.json({ totalStudents: students, totalTeachers: teachers, sessionsMarked: sessions, overallPercentage: total ? Math.round((attended / total) * 100) : 0, threshold: await getThreshold() });
}));
app.get('/api/reports/overall', requireAuth, requireRole('admin'), H(async (req, res) => {
  const range = { from: req.query.from, to: req.query.to };
  const stats = await batchStats(range);
  const students = await sql`SELECT * FROM users WHERE role = 'student' ORDER BY roll_no, name`;
  const report = students.map((s) => ({ id: s.id, name: s.name, rollNo: s.roll_no, program: s.program, branch: s.branch, semester: s.semester, section: s.section, ...(stats.get(s.id) || EMPTY_STATS()) }));
  res.json({ report });
}));
app.get('/api/reports/export', requireAuth, requireRole('admin'), H(async (req, res) => {
  const range = { from: req.query.from, to: req.query.to };
  const stats = await batchStats(range);
  const rows = [['Roll No','Name','Program','Branch','Semester','Section','Total','Present','Late','Absent','%']];
  for (const s of await sql`SELECT * FROM users WHERE role = 'student' ORDER BY roll_no`) {
    const st = stats.get(s.id) || EMPTY_STATS();
    rows.push([s.roll_no, s.name, s.program, s.branch, s.semester ?? '', s.section || '', st.total, st.present, st.late, st.absent, st.percentage]);
  }
  sendCSV(res, `attendance-${range.from || 'all'}-${range.to || todayStamp()}.csv`, rows);
}));
app.get('/api/reports/workload', requireAuth, requireRole('admin'), H(async (req, res) => {
  const rows = await sql`SELECT u.name, u.username, COUNT(DISTINCT r.id)::int AS sessions, COUNT(e.id)::int AS marked, COALESCE(SUM(CASE WHEN e.status IN ('present','late') THEN 1 ELSE 0 END), 0)::int AS attended FROM users u LEFT JOIN records r ON r.teacher_id = u.id LEFT JOIN entries e ON e.record_id = r.id WHERE u.role = 'teacher' GROUP BY u.id, u.name, u.username ORDER BY sessions DESC`;
  res.json({ items: rows.map((r) => ({ ...r, avg: r.marked ? Math.round((r.attended / r.marked) * 100) : null })) });
}));
app.get('/api/reports/subjects', requireAuth, requireRole('admin'), H(async (req, res) => {
  const rows = await sql`SELECT r.subject, COUNT(DISTINCT r.id)::int AS sessions, COUNT(e.id)::int AS total, COALESCE(SUM(CASE WHEN e.status IN ('present','late') THEN 1 ELSE 0 END), 0)::int AS attended FROM records r LEFT JOIN entries e ON e.record_id = r.id GROUP BY r.subject ORDER BY sessions DESC`;
  res.json({ items: rows.map((r) => ({ ...r, pct: r.total ? Math.round((r.attended / r.total) * 100) : 0 })) });
}));
app.get('/api/reports/correlation', requireAuth, requireRole('admin'), H(async (req, res) => {
  const stats = await batchStats();
  const mkRows = await sql`SELECT student_id, ROUND(AVG(score * 100.0 / max))::int AS m FROM marks GROUP BY student_id`;
  const mkMap = new Map(mkRows.map((m) => [m.student_id, m.m]));
  const out = [];
  for (const st of stats.values()) {
    if (mkMap.has(st.id)) out.push({ name: st.name, pct: st.percentage, marksPct: mkMap.get(st.id) });
  }
  res.json({ items: out });
}));
app.get('/api/register', requireAuth, requireRole('teacher', 'admin'), H(async (req, res) => {
  const { program, branch, semester, section, subject } = req.query;
  const month = String(req.query.month || '');
  if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'Month YYYY-MM chuno.' });
  const like = `${month}%`;
  const dates = (await sql`SELECT DISTINCT date FROM records WHERE program = ${program} AND branch = ${branch || ''} AND semester = ${Number(semester)} AND section = ${String(section || '').toUpperCase()} AND subject = ${subject} AND date LIKE ${like} ORDER BY date`).map((r) => r.date);
  const students = await sql`SELECT * FROM users WHERE role = 'student' AND program = ${program} AND branch = ${branch || ''} AND semester = ${Number(semester)} AND section = ${String(section || '').toUpperCase()} ORDER BY roll_no, name`;
  const cells = await sql`SELECT e.student_id, r.date, e.status FROM entries e JOIN records r ON r.id = e.record_id WHERE r.program = ${program} AND r.branch = ${branch || ''} AND r.semester = ${Number(semester)} AND r.section = ${String(section || '').toUpperCase()} AND r.subject = ${subject} AND r.date LIKE ${like}`;
  const cellMap = new Map(cells.map((c) => [`${c.student_id}|${c.date}`, c.status]));
  const rows = students.map((s) => {
    const cs = dates.map((d) => cellMap.get(`${s.id}|${d}`) || '');
    const P = cs.filter((c) => c === 'present').length, L = cs.filter((c) => c === 'late').length, A = cs.filter((c) => c === 'absent').length;
    const t = P + L + A;
    return { rollNo: s.roll_no, name: s.name, cells: cs, P, L, A, pct: t ? Math.round(((P + L) / t) * 100) : null };
  });
  res.json({ dates, rows, month });
}));
app.post('/api/reports/email-defaulters', requireAuth, requireRole('admin'), H(async (req, res) => {
  const th = await getThreshold(); let sent = 0, skipped = 0;
  const stats = await batchStats();
  for (const st of stats.values()) {
    if (st.percentage < th) {
      const row = (await sql`SELECT email FROM users WHERE id = ${st.id}`)[0];
      if (!row || !row.email) { skipped++; continue; }
      (await sendMail(row.email, '⚠️ Low Attendance — GLBITM', `Attendance: ${st.percentage}% (min ${th}%)`)) ? sent++ : skipped++;
    }
  }
  await addAudit('MAIL_DEFAULTERS', req.user.username, `${sent} sent`);
  res.json({ ok: true, message: `${sent} emails (console mode), ${skipped} skipped.` });
}));
app.get('/api/admin/audit', requireAuth, requireRole('admin'), H(async (req, res) => res.json({ logs: await sql`SELECT * FROM audit ORDER BY id DESC LIMIT 100` })));
app.get('/api/admin/backup', requireAuth, requireRole('admin'), H(async (req, res) => {
  await addAudit('BACKUP', req.user.username, '');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="glbajaj-backup-${todayStamp()}.json"`);
  res.send(JSON.stringify({ exportedAt: nowISO(),
    users: await sql`SELECT * FROM users`, records: await sql`SELECT * FROM records`, entries: await sql`SELECT * FROM entries`,
    announcements: await sql`SELECT * FROM announcements`, timetable: await sql`SELECT * FROM timetable`,
    leaves: await sql`SELECT * FROM leaves`, corrections: await sql`SELECT * FROM corrections`,
    marks: await sql`SELECT * FROM marks`, holidays: await sql`SELECT * FROM holidays`, settings: await sql`SELECT * FROM settings` }, null, 2));
}));
app.post('/api/admin/restore', requireAuth, requireRole('admin'), H(async (req, res) => {
  const b = req.body || {};
  if (!Array.isArray(b.users) || !Array.isArray(b.records) || !Array.isArray(b.entries)) return res.status(400).json({ error: 'Invalid backup.' });
  try {
    await sql.begin(async (tx) => {
      for (const t of ['sessions','entries','records','users','announcements','timetable','leaves','corrections','marks','certs','holidays','settings']) await tx.unsafe(`DELETE FROM ${t}`);
      for (const u of b.users) await tx`INSERT INTO users (id, role, name, username, password_hash, program, branch, semester, section, roll_no, email, subjects, face, card_id, parent_of, twofa, created_at) VALUES (${u.id}, ${u.role}, ${u.name}, ${u.username}, ${u.password_hash}, ${u.program || ''}, ${u.branch || ''}, ${u.semester ?? null}, ${u.section || ''}, ${u.roll_no || ''}, ${u.email || ''}, ${u.subjects || '[]'}, ${u.face || ''}, ${u.card_id || ''}, ${u.parent_of || ''}, ${u.twofa || 0}, ${u.created_at || nowISO()}) ON CONFLICT DO NOTHING`;
      for (const r of b.records) await tx`INSERT INTO records (id, date, program, branch, semester, section, subject, teacher_id, note, created_at) VALUES (${r.id}, ${r.date}, ${r.program}, ${r.branch || ''}, ${r.semester}, ${r.section || ''}, ${r.subject}, ${r.teacher_id || null}, ${r.note || ''}, ${r.created_at || nowISO()}) ON CONFLICT DO NOTHING`;
      for (const e of b.entries) await tx`INSERT INTO entries (id, record_id, student_id, status) VALUES (${e.id}, ${e.record_id}, ${e.student_id}, ${e.status}) ON CONFLICT DO NOTHING`;
      for (const m of b.marks || []) await tx`INSERT INTO marks (id, student_id, subject, exam, score, max, ts) VALUES (${m.id}, ${m.student_id}, ${m.subject}, ${m.exam}, ${m.score}, ${m.max}, ${m.ts || nowISO()}) ON CONFLICT DO NOTHING`;
      for (const h of b.holidays || []) await tx`INSERT INTO holidays (date, title) VALUES (${h.date}, ${h.title}) ON CONFLICT (date) DO UPDATE SET title = EXCLUDED.title`;
      for (const s of b.settings || []) await tx`INSERT INTO settings (key, value) VALUES (${s.key}, ${s.value}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
    });
  } catch (err) { return res.status(400).json({ error: `Restore failed: ${err.message}` }); }
  await addAudit('RESTORE', req.user.username, `${b.users.length} users`);
  res.json({ ok: true, message: `Restored ${b.users.length} users.` });
}));

/* ================= ANNOUNCEMENTS ================= */
app.get('/api/announcements', requireAuth, H(async (req, res) => res.json({ items: await sql`SELECT * FROM announcements ORDER BY ts DESC LIMIT 10` })));
app.post('/api/announcements', requireAuth, requireRole('admin'), H(async (req, res) => {
  const title = String((req.body || {}).title || '').trim(), body = String((req.body || {}).body || '').trim();
  if (!title) return res.status(400).json({ error: 'Title required.' });
  await sql`INSERT INTO announcements (id, title, body, ts, by) VALUES (${'N' + Date.now().toString(36)}, ${title}, ${body}, ${nowISO()}, ${req.user.name})`;
  await addAudit('ANN_ADD', req.user.username, title);
  res.status(201).json({ ok: true, emailed: 0 });
}));
app.delete('/api/announcements/:id', requireAuth, requireRole('admin'), H(async (req, res) => {
  await sql`DELETE FROM announcements WHERE id = ${req.params.id}`;
  await addAudit('ANN_DEL', req.user.username, req.params.id);
  res.json({ ok: true });
}));

/* ================= TEACHER SESSIONS ================= */
app.get('/api/me/sessions', requireAuth, requireRole('teacher'), H(async (req, res) => {
  const recs = await sql`SELECT * FROM records WHERE teacher_id = ${req.user.id} ORDER BY date DESC`;
  const list = [];
  for (const r of recs) {
    const entries = await sql`SELECT status FROM entries WHERE record_id = ${r.id}`;
    list.push({ id: Number(r.id), date: r.date, program: r.program, branch: r.branch, semester: r.semester, section: r.section, subject: r.subject, note: r.note || '', total: entries.length, present: entries.filter((e) => e.status === 'present').length, late: entries.filter((e) => e.status === 'late').length });
  }
  res.json({ sessions: list });
}));
app.get('/api/me/sessions/export', requireAuth, requireRole('teacher'), H(async (req, res) => {
  const rows = [['Date','Program','Branch','Semester','Section','Subject','Present','Late','Total']];
  for (const r of await sql`SELECT * FROM records WHERE teacher_id = ${req.user.id} ORDER BY date DESC`) {
    const entries = await sql`SELECT status FROM entries WHERE record_id = ${r.id}`;
    rows.push([r.date, r.program, r.branch, r.semester, r.section, r.subject, entries.filter((e) => e.status === 'present').length, entries.filter((e) => e.status === 'late').length, entries.length]);
  }
  sendCSV(res, `my-sessions-${todayStamp()}.csv`, rows);
}));

/* ================= CERTIFICATE ================= */
app.post('/api/certificate', requireAuth, requireRole('student'), H(async (req, res) => {
  const st = await studentStats(req.user.id);
  const id = crypto.randomBytes(6).toString('hex');
  await sql`INSERT INTO certs (id, student_id, name, roll, program, branch, semester, pct, total, present, late, absent, created_at) VALUES (${id}, ${req.user.id}, ${req.user.name}, ${req.user.roll_no}, ${req.user.program}, ${req.user.branch}, ${req.user.semester}, ${st.percentage}, ${st.total}, ${st.present}, ${st.late}, ${st.absent}, ${nowISO()})`;
  await addAudit('CERT', req.user.username, id);
  res.json({ id, url: `/verify/${id}` });
}));
app.get('/verify/:id', H(async (req, res) => {
  await ready();
  const c = (await sql`SELECT * FROM certs WHERE id = ${req.params.id}`)[0];
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
}));

/* ================= RFID HOOK ================= */
app.post('/api/hardware/rfid', H(async (req, res) => {
  await ready();
  if (req.headers['x-device-key'] !== (process.env.HARDWARE_KEY || 'demo-hardware-key')) return res.status(403).json({ error: 'Invalid device key.' });
  const { cardId, program, branch, semester, section, subject } = req.body || {};
  const date = String((req.body || {}).date || todayStamp());
  const stu = (await sql`SELECT * FROM users WHERE card_id = ${String(cardId || '').toUpperCase()} AND role = 'student'`)[0];
  if (!stu) return res.status(404).json({ error: 'Card not registered.' });
  if (!program || !semester || !subject) return res.status(400).json({ error: 'Class fields required.' });
  let rec = (await sql`SELECT * FROM records WHERE date = ${date} AND program = ${program} AND branch = ${String(branch || '')} AND semester = ${Number(semester)} AND section = ${String(section || '').toUpperCase()} AND subject = ${subject}`)[0];
  if (!rec) {
    const [nr] = await sql`INSERT INTO records (date, program, branch, semester, section, subject, teacher_id, note, created_at) VALUES (${date}, ${program}, ${String(branch || '')}, ${Number(semester)}, ${String(section || '').toUpperCase()}, ${subject}, null, 'RFID tap', ${nowISO()}) RETURNING id`;
    rec = { id: nr.id };
  }
  const ex = (await sql`SELECT * FROM entries WHERE record_id = ${rec.id} AND student_id = ${stu.id}`)[0];
  if (ex) return res.json({ ok: true, message: `${stu.name} already marked (${ex.status}).` });
  await sql`INSERT INTO entries (record_id, student_id, status) VALUES (${rec.id}, ${stu.id}, 'present')`;
  await addAudit('RFID', stu.username, `${subject} ${date}`);
  res.status(201).json({ ok: true, message: `${stu.name} marked present via RFID.` });
}));

/* ================= fallbacks & start ================= */
/* ================= v9.0: DAILY WORK REPORT (DWR) =================
   Flow: teacher har lecture ka report bharta hai → compile time (default 4:30 PM) pe
   har class ka combined report dwr_days me 'sent' mark hota hai → Principal dashboard. */
function dwrDayName(date) { return new Date(date + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }); }
/* v9.0.1 fix: compile time ko IST (Asia/Kolkata) me compare karo — Render server UTC pe chalta hai */
function istParts(d = new Date()) {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  const g = (t) => Number(((p.find((x) => x.type === t) || {}).value));
  return { hh: g('hour'), mm: g('minute') };
}
async function upsertDwrDay(date, program, branch, semester, section, ay) {
  const day = dwrDayName(date);
  const [tt] = await sql`SELECT COUNT(*)::int AS c FROM timetable WHERE day = ${day} AND program = ${program} AND branch = ${branch} AND semester = ${semester} AND section = ${section}`;
  const [dw] = await sql`SELECT COUNT(*)::int AS c FROM dwr WHERE date = ${date} AND program = ${program} AND branch = ${branch} AND semester = ${semester} AND section = ${section}`;
  await sql`INSERT INTO dwr_days (date, program, branch, semester, section, expected, filled, status, academic_year)
    VALUES (${date}, ${program}, ${branch}, ${semester}, ${section}, ${tt.c}, ${dw.c}, ${tt.c > 0 && dw.c >= tt.c ? 'complete' : 'open'}, ${ay})
    ON CONFLICT (date, program, branch, semester, section)
    DO UPDATE SET expected = EXCLUDED.expected, filled = EXCLUDED.filled,
      status = CASE WHEN dwr_days.status = 'sent' THEN 'sent'
                    WHEN EXCLUDED.expected > 0 AND EXCLUDED.filled >= EXCLUDED.expected THEN 'complete'
                    ELSE 'open' END`;
}
async function compileDwrDay(date) {
  const cfg = await getDwrConfig();
  const [hh, mm] = String(cfg.compileTime || '16:30').split(':').map(Number);
  const { hh: nowH, mm: nowM } = istParts();
  const isToday = date === todayStamp();
  const afterCompile = !isToday || nowH > hh || (nowH === hh && nowM >= mm);
  if (!afterCompile) return { compiled: 0, note: `Compile time ${cfg.compileTime} IST abhi nahi hua.` };
  const pend = await sql`SELECT id FROM dwr_days WHERE date = ${date} AND status <> 'sent'`;
  for (const d of pend) await sql`UPDATE dwr_days SET status = 'sent', sent_at = ${nowISO()} WHERE id = ${d.id}`;
  return { compiled: pend.length };
}
app.get('/api/dwr/mine', requireAuth, requireRole('teacher', 'admin'), H(async (req, res) => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date)) ? String(req.query.date) : todayStamp();
  const ay = await getAcademicYear();
  const day = dwrDayName(date);
  const slots = await sql`SELECT t.period, t.subject, t.program, t.branch, t.semester, t.section FROM timetable t WHERE t.day = ${day} AND t.teacher_id = ${req.user.id} ORDER BY t.period`;
  const mine = await sql`SELECT * FROM dwr WHERE date = ${date} AND teacher_id = ${req.user.id}`;
  const eMap = new Map(mine.map((e) => [e.period, e]));
  const items = [];
  for (const s of slots) {
    const e = eMap.get(s.period) || null;
    let autoPresent = null, autoTotal = null;
    const [rec] = await sql`SELECT id FROM records WHERE date = ${date} AND program = ${s.program} AND branch = ${s.branch} AND semester = ${s.semester} AND section = ${s.section} AND subject = ${s.subject}`;
    if (rec) {
      const [c] = await sql`SELECT COUNT(*)::int AS total, COALESCE(SUM(CASE WHEN status IN ('present','late') THEN 1 ELSE 0 END),0)::int AS present FROM entries WHERE record_id = ${rec.id}`;
      autoPresent = c.present; autoTotal = c.total;
    }
    items.push({ ...s, entry: e, autoPresent, autoTotal });
  }
  res.json({ date, day, academicYear: ay, items });
}));
app.post('/api/dwr', requireAuth, requireRole('teacher', 'admin'), H(async (req, res) => {
  const b = req.body || {};
  const date = String(b.date || ''), period = Number(b.period), program = String(b.program || '').trim();
  const branch = String(b.branch || '').trim(), semester = Number(b.semester), section = String(b.section || '').trim().toUpperCase();
  const subject = String(b.subject || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !period || period < 1 || period > 12 || !program || !semester || !subject)
    return res.status(400).json({ error: 'date, period (1-12), program, semester, subject required.' });
  /* v9.1.1: subject-guard — attendance/marks/assignments jaisa hi (apne subject hi report ho sake) */
  const assigned = assignedSubjects(req.user);
  if (assigned.length && !assigned.includes(subject)) return res.status(403).json({ error: `"${subject}" tumhara subject nahi. Yours: ${assigned.join(', ')}.` });
  const taught = String(b.taught || '').slice(0, 1000);
  const pc = (b.presentCount === '' || b.presentCount == null) ? null : Math.max(0, Math.min(9999, Math.floor(Number(b.presentCount))));
  const tc = (b.totalCount === '' || b.totalCount == null) ? null : Math.max(0, Math.min(9999, Math.floor(Number(b.totalCount))));
  const asn = String(b.assignmentTitle || '').slice(0, 200);
  const due = /^\d{4}-\d{2}-\d{2}$/.test(String(b.assignmentDue || '')) ? String(b.assignmentDue) : '';
  const rem = String(b.remarks || '').slice(0, 300);
  const ay = await getAcademicYear();
  await sql`INSERT INTO dwr (date, period, program, branch, semester, section, subject, teacher_id, taught, present_count, total_count, assignment_title, assignment_due, remarks, academic_year, created_at, updated_at)
    VALUES (${date}, ${period}, ${program}, ${branch}, ${semester}, ${section}, ${subject}, ${req.user.id}, ${taught}, ${pc}, ${tc}, ${asn}, ${due}, ${rem}, ${ay}, ${nowISO()}, ${nowISO()})
    ON CONFLICT (date, program, branch, semester, section, period)
    DO UPDATE SET subject = EXCLUDED.subject, teacher_id = EXCLUDED.teacher_id, taught = EXCLUDED.taught,
      present_count = EXCLUDED.present_count, total_count = EXCLUDED.total_count,
      assignment_title = EXCLUDED.assignment_title, assignment_due = EXCLUDED.assignment_due,
      remarks = EXCLUDED.remarks, updated_at = EXCLUDED.updated_at`;
  await upsertDwrDay(date, program, branch, semester, section, ay);
  await addAudit('DWR_SAVE', req.user.username, `${date} P${period} ${program} sem${semester} ${subject}`);
  res.status(201).json({ ok: true, message: `Period ${period} report saved ✅` });
}));
app.get('/api/dwr/day', requireAuth, requireRole('teacher', 'admin'), H(async (req, res) => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date)) ? String(req.query.date) : todayStamp();
  const secF = String(req.query.section || '') ? sql` AND d.section = ${String(req.query.section).toUpperCase()}` : sql``; /* v9.1.1: khali = All */
  const rows = await sql`SELECT d.*, u.name AS "teacherName" FROM dwr d LEFT JOIN users u ON u.id = d.teacher_id
    WHERE d.date = ${date} AND d.program = ${String(req.query.program || '')} AND d.branch = ${String(req.query.branch || '')}
      AND d.semester = ${Number(req.query.semester)}${secF} ORDER BY d.period`;
  const [day] = await sql`SELECT * FROM dwr_days WHERE date = ${date} AND program = ${String(req.query.program || '')} AND branch = ${String(req.query.branch || '')} AND semester = ${Number(req.query.semester)} ${String(req.query.section || '') ? sql` AND section = ${String(req.query.section).toUpperCase()}` : sql``}`;
  res.json({ date, items: rows, day: day || null });
}));
app.get('/api/dwr/principal', requireAuth, requireRole('admin'), H(async (req, res) => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date)) ? String(req.query.date) : todayStamp();
  const cfg = await getDwrConfig();
  const comp = await compileDwrDay(date);
  const classes = await sql`SELECT * FROM dwr_days WHERE date = ${date} ORDER BY program, branch, semester, section`;
  const rows = await sql`SELECT d.*, u.name AS "teacherName" FROM dwr d LEFT JOIN users u ON u.id = d.teacher_id WHERE d.date = ${date} ORDER BY d.program, d.branch, d.semester, d.section, d.period`;
  res.json({ date, compileTime: cfg.compileTime, compiled: comp.compiled || 0, classes, rows });
}));
app.get('/api/dwr/principal.csv', requireAuth, requireRole('admin'), H(async (req, res) => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date)) ? String(req.query.date) : todayStamp();
  const rows = [['Date', 'Class', 'Period', 'Subject', 'Teacher', 'Present', 'Total', 'Topics Taught', 'Assignment', 'Due Date', 'Remarks']];
  const items = await sql`SELECT d.*, u.name AS "teacherName" FROM dwr d LEFT JOIN users u ON u.id = d.teacher_id WHERE d.date = ${date} ORDER BY d.program, d.branch, d.semester, d.section, d.period`;
  for (const r of items) rows.push([r.date, `${r.program}${r.branch && r.branch !== 'General' ? ' ' + r.branch : ''} sem${r.semester}${r.section ? ' sec' + r.section : ''}`, r.period, r.subject, r.teacherName || '', r.present_count ?? '', r.total_count ?? '', r.taught, r.assignment_title, r.assignment_due, r.remarks]);
  sendCSV(res, `dwr-${date}.csv`, rows);
}));
app.post('/api/dwr/compile', requireAuth, requireRole('admin'), H(async (req, res) => {
  const out = await compileDwrDay(String((req.body || {}).date || todayStamp()));
  await addAudit('DWR_COMPILE', req.user.username, JSON.stringify(out));
  res.json({ ok: true, ...out });
}));
/* cron-job.org isko roz compile time ke thodi der baad ping karega (token env me: DWR_CRON_TOKEN) */
app.post('/api/cron/dwr', H(async (req, res) => {
  const token = String(req.query.token || req.headers['x-cron-token'] || '');
  const secret = String(process.env.DWR_CRON_TOKEN || '');
  if (!secret || token !== secret) return res.status(403).json({ error: 'Invalid cron token.' });
  await ready();
  const today = todayStamp();
  const out = await compileDwrDay(today);
  const [agg] = await sql`SELECT COUNT(*)::int AS classes, COALESCE(SUM(filled),0)::int AS reports FROM dwr_days WHERE date = ${today}`;
  res.json({ ok: true, date: today, ...out, classes: agg.classes, reports: agg.reports });
}));

/* ================= v9.1: ASSIGNMENTS (unit-wise homework → submission counts) =================
   Teacher create karta hai → submissions mark karta hai → student panel pe SIRF counts dikhte hain. */
app.get('/api/assignments', requireAuth, requireRole('teacher', 'admin'), H(async (req, res) => {
  const program = String(req.query.program || ''), branch = String(req.query.branch || '');
  const semester = Number(req.query.semester), section = String(req.query.section || '');
  if (!program || !semester) return res.status(400).json({ error: 'Program + semester required.' });
  const secF = section ? sql` AND a.section = ${section}` : sql``; /* v9.1.1: khali section = All */
  const ay = await getAcademicYear();
  const rows = await sql`SELECT a.*, u.name AS "teacherName",
      (SELECT COUNT(*)::int FROM assignment_subs sb WHERE sb.assignment_id = a.id AND sb.submitted = 1) AS done,
      (SELECT COUNT(*)::int FROM users us WHERE us.role = 'student' AND us.program = a.program AND us.branch = a.branch AND us.semester = a.semester AND us.section = a.section AND ${isActiveUser('us.status')}) AS strength
    FROM assignments a LEFT JOIN users u ON u.id = a.teacher_id
    WHERE a.program = ${program} AND a.branch = ${branch} AND a.semester = ${semester} AND a.academic_year = ${ay}${secF}
    ORDER BY a.subject, a.id DESC`;
  res.json({ items: rows.map((r) => ({ id: Number(r.id), subject: r.subject, title: r.title, unit: r.unit || '', dueDate: r.due_date || '', teacherName: r.teacherName || '', done: r.done, strength: r.strength, createdAt: r.created_at })) });
}));
app.post('/api/assignments', requireAuth, requireRole('teacher', 'admin'), H(async (req, res) => {
  const b = req.body || {};
  const subject = String(b.subject || '').trim(), title = String(b.title || '').trim();
  const program = String(b.program || '').trim(), branch = String(b.branch || '').trim();
  const semester = Number(b.semester), section = String(b.section || '').trim().toUpperCase();
  const unit = String(b.unit || '').trim().slice(0, 40);
  const due = /^\d{4}-\d{2}-\d{2}$/.test(String(b.dueDate || '')) ? String(b.dueDate) : '';
  if (!subject || !title || !program || !semester) return res.status(400).json({ error: 'Subject, title, program, semester required.' });
  const assigned = assignedSubjects(req.user);
  if (assigned.length && !assigned.includes(subject)) return res.status(403).json({ error: `"${subject}" tumhara subject nahi. Yours: ${assigned.join(', ')}.` });
  const ay = await getAcademicYear();
  await sql`INSERT INTO assignments (subject, program, branch, semester, section, title, unit, due_date, teacher_id, academic_year, created_at)
    VALUES (${subject}, ${program}, ${branch}, ${semester}, ${section}, ${title.slice(0, 200)}, ${unit}, ${due}, ${req.user.id}, ${ay}, ${nowISO()})`;
  await addAudit('ASSIGN_ADD', req.user.username, `${subject}: ${title.slice(0, 60)}`);
  res.status(201).json({ ok: true, message: 'Assignment created 📚' });
}));
app.delete('/api/assignments/:id', requireAuth, requireRole('teacher', 'admin'), H(async (req, res) => {
  const row = (await sql`SELECT * FROM assignments WHERE id = ${Number(req.params.id)}`)[0];
  if (!row) return res.status(404).json({ error: 'Assignment not found.' });
  if (req.user.role !== 'admin' && row.teacher_id !== req.user.id) return res.status(403).json({ error: 'Sirf apne assignments delete kar sakte ho.' });
  await sql`DELETE FROM assignment_subs WHERE assignment_id = ${row.id}`;
  await sql`DELETE FROM assignments WHERE id = ${row.id}`;
  await addAudit('ASSIGN_DEL', req.user.username, `#${row.id}`);
  res.json({ ok: true, message: 'Assignment deleted.' });
}));
app.get('/api/assignments/:id/submissions', requireAuth, requireRole('teacher', 'admin'), H(async (req, res) => {
  const a = (await sql`SELECT * FROM assignments WHERE id = ${Number(req.params.id)}`)[0];
  if (!a) return res.status(404).json({ error: 'Assignment not found.' });
  const students = await sql`SELECT id, name, roll_no AS "rollNo" FROM users WHERE role = 'student' AND program = ${a.program} AND branch = ${a.branch} AND semester = ${a.semester} AND section = ${a.section} AND ${isActiveUser('status')} ORDER BY roll_no, name`;
  const subs = await sql`SELECT student_id, submitted, submitted_at FROM assignment_subs WHERE assignment_id = ${a.id}`;
  const map = new Map(subs.map((s) => [s.student_id, s]));
  res.json({ assignment: { id: Number(a.id), subject: a.subject, title: a.title, unit: a.unit || '', dueDate: a.due_date || '' }, students: students.map((s) => ({ id: s.id, name: s.name, rollNo: s.rollNo || '', submitted: !!(map.get(s.id) && map.get(s.id).submitted), submittedAt: (map.get(s.id) || {}).submitted_at || null })) });
}));
app.post('/api/assignments/:id/submissions', requireAuth, requireRole('teacher', 'admin'), H(async (req, res) => {
  const a = (await sql`SELECT * FROM assignments WHERE id = ${Number(req.params.id)}`)[0];
  if (!a) return res.status(404).json({ error: 'Assignment not found.' });
  const items = Array.isArray((req.body || {}).items) ? req.body.items.filter((i) => i && i.studentId) : [];
  if (!items.length) return res.status(400).json({ error: 'No students sent.' });
  for (const i of items) {
    const f = i.submitted ? 1 : 0;
    await sql`INSERT INTO assignment_subs (assignment_id, student_id, submitted, submitted_at) VALUES (${a.id}, ${String(i.studentId)}, ${f}, ${f ? nowISO() : null})
      ON CONFLICT (assignment_id, student_id) DO UPDATE SET submitted = EXCLUDED.submitted, submitted_at = EXCLUDED.submitted_at`;
  }
  await addAudit('ASSIGN_SUB', req.user.username, `#${a.id} (${items.length} updated)`);
  res.json({ ok: true, message: `${items.length} students updated.` });
}));
async function assignmentsFor(student) {
  const ay = await getAcademicYear();
  const rows = await sql`SELECT a.id, a.subject, a.title, a.unit, a.due_date AS "dueDate", sb.submitted, sb.submitted_at AS "submittedAt"
    FROM assignments a LEFT JOIN assignment_subs sb ON sb.assignment_id = a.id AND sb.student_id = ${student.id}
    WHERE a.program = ${student.program} AND a.branch = ${student.branch || ''} AND a.semester = ${student.semester} AND a.section = ${student.section || ''} AND a.academic_year = ${ay}
    ORDER BY COALESCE(NULLIF(a.due_date, ''), '9999-12-31'), a.id DESC`;
  const items = rows.map((r) => ({ id: Number(r.id), subject: r.subject, title: r.title, unit: r.unit || '', dueDate: r.dueDate || '', submitted: !!r.submitted, submittedAt: r.submittedAt || null }));
  const bySub = new Map();
  for (const it of items) { const s = bySub.get(it.subject) || { subject: it.subject, done: 0, total: 0 }; s.total++; if (it.submitted) s.done++; bySub.set(it.subject, s); }
  return { academicYear: ay, items, subjects: [...bySub.values()], pending: items.filter((i) => !i.submitted) };
}
app.get('/api/assignments/mine', requireAuth, requireRole('student'), H(async (req, res) => res.json(await assignmentsFor(req.user))));
app.get('/api/assignments/child', requireAuth, requireRole('parent'), H(async (req, res) => {
  const child = (await sql`SELECT * FROM users WHERE id = ${req.user.parent_of}`)[0];
  if (!child) return res.status(404).json({ error: 'Child link missing.' });
  res.json(await assignmentsFor(child));
}));

/* ================= STUDENT PROGRESS REPORT (SPR) — v16 entry-only =================
   Teacher/Admin: per-subject RAW marks entries (exam, score/max, status — jaisi enter hui waisi) + assignment counts + attendance%.
   Koi internal/25 calculation NAHI — college apne calculated internal ko "Internal" exam entry ke roop me khud enter karti hai.
   Student (/mine): SIRF assignment counts + manual results — koi score leak nahi (teacher ki privacy rule). */
async function buildProgress(program, branch, semester, section, onlyStudentId = null) {
  const ay = await getAcademicYear();
  let students;
  if (onlyStudentId) {
    students = await sql`SELECT u.id, u.name, u.roll_no AS "rollNo", u.section, u.batch, u.program, u.branch, u.semester FROM users u WHERE u.id = ${onlyStudentId}`;
  } else {
    /* v9.1.1: khali section = ALL sections (v8 roster jaisa hi convention) */
    const secF = section ? sql` AND u.section = ${section}` : sql``;
    students = await sql`SELECT u.id, u.name, u.roll_no AS "rollNo", u.section, u.batch FROM users u WHERE u.role = 'student' AND u.program = ${program} AND u.branch = ${branch} AND u.semester = ${semester} AND ${isActiveUser('u.status')}${secF} ORDER BY u.roll_no, u.name`;
  }
  const ids = students.map((s) => s.id);
  if (!ids.length) return { academicYear: ay, subjects: [], rows: [] };

  const attRows = await sql`SELECT e.student_id, r.subject, COUNT(*)::int AS total,
      COALESCE(SUM(CASE WHEN e.status IN ('present','late') THEN 1 ELSE 0 END), 0)::int AS attended
    FROM entries e JOIN records r ON r.id = e.record_id
    WHERE e.student_id IN ${sql(ids)} AND r.date NOT IN (SELECT date FROM holidays)
    GROUP BY e.student_id, r.subject`;
  const attMap = new Map(attRows.map((r) => [`${r.student_id}|${r.subject}`, r]));
  const attTotal = new Map();
  for (const r of attRows) { const t = attTotal.get(r.student_id) || { total: 0, attended: 0 }; t.total += r.total; t.attended += r.attended; attTotal.set(r.student_id, t); }

  /* v16: sab raw entries — jo exam names enter hue wo waise hi (MST-1, ST-1, PUT, Internal, …) */
  const mkRows = await sql`SELECT m.student_id, m.subject, m.exam, m.score, m.max, m.status FROM marks m WHERE m.student_id IN ${sql(ids)} ORDER BY m.subject, m.exam`;
  let asnRows;
  if (onlyStudentId) {
    const st = students[0];
    asnRows = await sql`SELECT id, subject FROM assignments WHERE academic_year = ${ay} AND program = ${st.program} AND branch = ${st.branch || ''} AND semester = ${st.semester} AND section = ${st.section || ''}`;
  } else {
    const secF2 = section ? sql` AND section = ${section}` : sql``;
    asnRows = await sql`SELECT id, subject FROM assignments WHERE academic_year = ${ay} AND program = ${program} AND branch = ${branch} AND semester = ${semester}${secF2}`;
  }
  const asnIds = asnRows.map((a) => a.id);
  const subRows = asnIds.length ? await sql`SELECT assignment_id, student_id, submitted FROM assignment_subs WHERE assignment_id IN ${sql(asnIds)}` : [];
  const asnTotalBySub = new Map();
  for (const a of asnRows) asnTotalBySub.set(a.subject, (asnTotalBySub.get(a.subject) || 0) + 1);
  const asnCount = new Map();
  const asnRowById = new Map(asnRows.map((a) => [a.id, a]));
  for (const s of subRows) {
    const a = asnRowById.get(s.assignment_id); if (!a) continue;
    const key = `${s.student_id}|${a.subject}`;
    const c = asnCount.get(key) || { done: 0, total: 0 };
    c.total++; if (s.submitted) c.done++;
    asnCount.set(key, c);
  }

  const ttRows = onlyStudentId ? [] : await sql`SELECT DISTINCT subject FROM timetable WHERE program = ${program} AND branch = ${branch} AND semester = ${semester} ${section ? sql` AND section = ${section}` : sql``}`;
  const subjSet = new Set([...mkRows.map((m) => m.subject), ...asnRows.map((a) => a.subject), ...ttRows.map((t) => t.subject)]);
  const subjects = [...subjSet].sort((a, b) => a.localeCompare(b));

  const mkMap = new Map();
  for (const m of mkRows) {
    const key = `${m.student_id}|${m.subject}`;
    const g = mkMap.get(key) || { marks: [] };
    g.marks.push({ exam: m.exam, score: Number(m.score), max: Number(m.max), status: String(m.status || 'scored') });
    mkMap.set(key, g);
  }

  const results = await sql`SELECT student_id, semester, sgpa, cgpa, remark FROM results WHERE student_id IN ${sql(ids)} ORDER BY semester`;
  const resMap = new Map();
  for (const r of results) { const a = resMap.get(r.student_id) || []; a.push({ semester: r.semester, sgpa: r.sgpa, cgpa: r.cgpa, remark: r.remark || '' }); resMap.set(r.student_id, a); }

  const rows = students.map((s) => {
    const t = attTotal.get(s.id) || { total: 0, attended: 0 };
    const subj = {};
    for (const sub of subjects) {
      const g = mkMap.get(`${s.id}|${sub}`) || { marks: [] };
      const a = attMap.get(`${s.id}|${sub}`);
      const ac = asnCount.get(`${s.id}|${sub}`) || { done: 0, total: asnTotalBySub.get(sub) || 0 };
      subj[sub] = { marks: g.marks, asgnDone: ac.done, asgnTotal: ac.total, attTotal: a ? a.total : 0, attAttended: a ? a.attended : 0, attPct: a && a.total ? Math.round((a.attended / a.total) * 100) : null };
    }
    return { id: s.id, rollNo: s.rollNo || '', name: s.name, section: s.section || '', batch: s.batch || '', att: { total: t.total, attended: t.attended, pct: t.total ? Math.round((t.attended / t.total) * 100) : 0 }, subjects: subj, results: resMap.get(s.id) || [] };
  });
  return { academicYear: ay, subjects, rows };
}
app.get('/api/progress/class', requireAuth, requireRole('teacher', 'admin'), H(async (req, res) => {
  const program = String(req.query.program || ''), branch = String(req.query.branch || '');
  const semester = Number(req.query.semester), section = String(req.query.section || '');
  if (!program || !semester) return res.status(400).json({ error: 'Program + semester required.' });
  res.json(await buildProgress(program, branch, semester, section));
}));
app.get('/api/progress/class.csv', requireAuth, requireRole('teacher', 'admin'), H(async (req, res) => {
  const program = String(req.query.program || ''), branch = String(req.query.branch || '');
  const semester = Number(req.query.semester), section = String(req.query.section || '');
  if (!program || !semester) return res.status(400).json({ error: 'Program + semester required.' });
  const data = await buildProgress(program, branch, semester, section);
  const rows = [['Roll No', 'Name', ...data.subjects.flatMap((s) => [`${s} Marks (entries)`, `${s} Assignments`, `${s} Att%`]), 'Overall Att%', 'SGPA (latest)', 'CGPA (latest)']];
  for (const r of data.rows) {
    const line = [r.rollNo, r.name];
    for (const s of data.subjects) {
      const x = r.subjects[s];
      line.push(x ? (x.marks || []).map((m) => `${m.exam} ${m.status === 'scored' ? m.score + '/' + m.max : m.status.toUpperCase()}`).join(' | ') : '(no entry)', x ? `${x.asgnDone}/${x.asgnTotal}` : '', x && x.attPct != null ? x.attPct : '');
    }
    const last = r.results[r.results.length - 1] || {};
    line.push(r.att.pct, last.sgpa ?? '', last.cgpa ?? '');
    rows.push(line);
  }
  sendCSV(res, `progress-${program}-sem${semester}-${todayStamp()}.csv`, rows);
}));
app.get('/api/progress/student', requireAuth, requireRole('teacher', 'admin'), H(async (req, res) => {
  const sid = String(req.query.studentId || '');
  const stu = (await sql`SELECT * FROM users WHERE id = ${sid} AND role = 'student'`)[0];
  if (!stu) return res.status(404).json({ error: 'Student not found.' });
  const data = await buildProgress(stu.program, stu.branch || '', stu.semester, stu.section || '', sid);
  res.json({ academicYear: data.academicYear, subjects: data.subjects,
    student: { id: stu.id, name: stu.name, rollNo: stu.roll_no, program: stu.program, branch: stu.branch, semester: stu.semester, section: stu.section, batch: stu.batch || '', status: stu.status || 'active' },
    row: data.rows[0] || null });
}));
app.get('/api/progress/mine', requireAuth, requireRole('student'), H(async (req, res) => {
  /* PRIVACY RULE (teacher requirement): student ko sirf assignment submission counts + manually-entered results.
     Scores / internal marks yahan KABHI nahi jaate — wo sirf teacher/admin SPR me hai. */
  const asn = await assignmentsFor(req.user);
  res.json({ academicYear: asn.academicYear, subjects: asn.subjects, pending: asn.pending.slice(0, 12), results: await getResults(req.user.id) });
}));

/* ================= v9.1: RESULTS — manual SGPA/CGPA (auto-calc NAHI hota, teacher ki demand) ================= */
app.post('/api/results', requireAuth, requireRole('teacher', 'admin'), H(async (req, res) => {
  const b = req.body || {};
  const studentId = String(b.studentId || ''), semester = Number(b.semester);
  const sgpa = (b.sgpa === '' || b.sgpa == null) ? null : Number(b.sgpa);
  const cgpa = (b.cgpa === '' || b.cgpa == null) ? null : Number(b.cgpa);
  const remark = String(b.remark || '').slice(0, 120);
  if (!studentId || !semester || semester < 1 || semester > 12) return res.status(400).json({ error: 'studentId + valid semester (1-12) chahiye.' });
  if (sgpa != null && !(sgpa >= 0 && sgpa <= 10)) return res.status(400).json({ error: 'SGPA 0-10 ke beech rakho (ya khaali).' });
  if (cgpa != null && !(cgpa >= 0 && cgpa <= 10)) return res.status(400).json({ error: 'CGPA 0-10 ke beech rakho (ya khaali).' });
  const stu = (await sql`SELECT id FROM users WHERE id = ${studentId} AND role = 'student'`)[0];
  if (!stu) return res.status(404).json({ error: 'Student not found.' });
  await sql`INSERT INTO results (student_id, semester, sgpa, cgpa, remark, updated_by, ts) VALUES (${studentId}, ${semester}, ${sgpa}, ${cgpa}, ${remark}, ${req.user.username}, ${nowISO()})
    ON CONFLICT (student_id, semester) DO UPDATE SET sgpa = EXCLUDED.sgpa, cgpa = EXCLUDED.cgpa, remark = EXCLUDED.remark, updated_by = EXCLUDED.updated_by, ts = EXCLUDED.ts`;
  await addAudit('RESULT_SET', req.user.username, `${studentId} sem${semester}`);
  res.json({ ok: true, message: `Semester ${semester} results saved (manual entry).` });
}));

/* ================= v9.1: YEAR ROLLOVER + ALUMNI ARCHIVE =================
   Rollover: final-year students → status='alumni' (+graduated_on), baaki semester+1, optional new academic year.
   Archive: purane batches (e.g. 2020 BCA) ke students + unka poora record hamesha searchable. */
const gradCase = () => sql.join(Object.entries(PROGRAMS).map(([p, v]) => sql`WHEN ${p} THEN ${v.sems}`), sql` `);
app.get('/api/admin/rollover/preview', requireAuth, requireRole('admin'), H(async (req, res) => {
  const cs = gradCase();
  const [{ c: grads }] = await sql`SELECT COUNT(*)::int AS c FROM users WHERE role = 'student' AND ${isActiveUser('status')} AND semester >= (CASE program ${cs} END)::int`;
  const [{ c: promo }] = await sql`SELECT COUNT(*)::int AS c FROM users WHERE role = 'student' AND ${isActiveUser('status')} AND semester < (CASE program ${cs} END)::int`;
  const ay = await getAcademicYear();
  const sy = Number(String(ay).split('-')[0]) || new Date().getFullYear();
  res.json({ academicYear: ay, nextAY: `${sy + 1}-${String(sy + 2).slice(2)}`, willGraduate: grads, willPromote: promo });
}));
app.post('/api/admin/rollover', requireAuth, requireRole('admin'), H(async (req, res) => {
  const b = req.body || {};
  if (!b.confirm) return res.status(400).json({ error: 'confirm:true bhejo — ye bulk action hai.' });
  const cs = gradCase();
  const ay = await getAcademicYear();
  let newAY = null;
  if (b.newAcademicYear && /^\d{4}-\d{2}$/.test(String(b.newAcademicYear))) {
    await sql`INSERT INTO settings (key, value) VALUES ('academic_year', ${String(b.newAcademicYear)}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
    newAY = String(b.newAcademicYear);
  }
  const g = await sql`UPDATE users SET status = 'alumni', graduated_on = ${todayStamp()},
      batch = CASE WHEN batch IS NULL OR batch = '' THEN ${ay} ELSE batch END
    WHERE role = 'student' AND ${isActiveUser('status')} AND semester >= (CASE program ${cs} END)::int RETURNING id`;
  const p = await sql`UPDATE users SET semester = semester + 1 WHERE role = 'student' AND ${isActiveUser('status')} AND semester < (CASE program ${cs} END)::int RETURNING id`;
  await addAudit('ROLLOVER', req.user.username, `graduated=${g.length} promoted=${p.length} AY→${newAY || ay}`);
  res.json({ ok: true, graduated: g.length, promoted: p.length, academicYear: newAY || ay, message: `🎓 ${g.length} graduated (alumni) · ${p.length} promoted${newAY ? ` · AY ${newAY}` : ''}.` });
}));
app.get('/api/archive/batches', requireAuth, requireRole('admin'), H(async (req, res) => {
  const rows = await sql`SELECT program, branch, COALESCE(NULLIF(batch, ''), LEFT(graduated_on, 4)) AS batch, COUNT(*)::int AS students
    FROM users WHERE role = 'student' AND status = 'alumni'
    GROUP BY program, branch, 3 ORDER BY program, batch DESC`;
  res.json({ items: rows });
}));
app.get('/api/archive/students', requireAuth, requireRole('admin'), H(async (req, res) => {
  const conds = [sql`role = 'student'`, sql`status = 'alumni'`];
  if (req.query.program) conds.push(sql`program = ${String(req.query.program)}`);
  if (req.query.branch) conds.push(sql`branch = ${String(req.query.branch)}`);
  if (req.query.batch) conds.push(sql`COALESCE(NULLIF(batch, ''), LEFT(graduated_on, 4)) = ${String(req.query.batch)}`);
  if (req.query.q) { const like = `%${String(req.query.q).toLowerCase()}%`; conds.push(sql`(LOWER(name) LIKE ${like} OR LOWER(roll_no) LIKE ${like})`); }
  const rows = await sql`SELECT id, name, roll_no AS "rollNo", program, branch, semester, section, batch, graduated_on AS "graduatedOn"
    FROM users WHERE ${sql.join(conds, sql` AND `)} ORDER BY program, batch DESC, roll_no LIMIT 300`;
  res.json({ items: rows });
}));
app.get('/api/archive/student/:id', requireAuth, requireRole('admin'), H(async (req, res) => {
  const u = (await sql`SELECT * FROM users WHERE id = ${req.params.id} AND role = 'student'`)[0];
  if (!u) return res.status(404).json({ error: 'Student not found.' });
  const stats = await studentStats(u.id);
  const marks = await sql`SELECT subject, exam, score, max, status, academic_year AS "ay" FROM marks WHERE student_id = ${u.id} ORDER BY COALESCE(NULLIF(academic_year, ''), 'zzz'), subject, exam`;
  res.json({ student: { id: u.id, name: u.name, rollNo: u.roll_no, program: u.program, branch: u.branch, semester: u.semester, section: u.section, batch: u.batch || '', status: u.status || 'active', graduatedOn: u.graduated_on || '' },
    attendance: { total: stats.total, present: stats.present, late: stats.late, absent: stats.absent, pct: stats.percentage, subjects: stats.subjects },
    marks, results: await getResults(u.id) });
}));

app.use(express.static(__dirname + '/public', {
  setHeaders(res, filePath) {
    if (filePath.endsWith('sw.js')) res.setHeader('Cache-Control', 'no-cache');
  }
}));
app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }));
app.use((req, res) => res.status(404).sendFile(__dirname + '/public/index.html'));
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body.' });
  console.error('  ⚠️ Unhandled:', err && err.message);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Server error.' });
});

(async () => {
  await ready();
  const BASE_PORT = Number(process.env.PORT) || 3000;
  function startServer(port, tries = 10) {
    const server = app.listen(port, () => {
      console.log('──────────────────────────────────────────────');
      console.log('  🎓 GLBITM Attendance v9.3 — Production Edition');
      console.log(`  ➜  http://localhost:${port}`);
      console.log('  💾 DB: PERSISTENT (cloud) · 👑 Role promote/demote active');
      console.log('──────────────────────────────────────────────');
    });
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE' && tries > 0) { console.log(`  ⚠️ Port ${port} busy → ${port + 1}`); startServer(port + 1, tries - 1); }
      else { console.error(`❌ ${err.message}`); process.exit(1); }
    });
  }
  startServer(BASE_PORT);
})().catch((e) => { console.error('❌ DB connect fail:', e.message); process.exit(1); });