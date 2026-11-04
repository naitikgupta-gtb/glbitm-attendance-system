#!/usr/bin/env node
/* ============================================================
   GLBITM Attendance — post-deploy smoke test (zero dependencies)
   Usage:
     node scripts/smoke.js https://your-app.onrender.com
     node scripts/smoke.js http://localhost:3000 admin admin123
   Optional creds: passes a real login + role-based API checks.
   Exit code 0 = all good, 1 = something failed.
   ============================================================ */
const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/+$/, '');
const USER = process.argv[3] || '';
const PASS = process.argv[4] || '';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? '  ✅' : '  ❌'} ${name}${extra ? ' — ' + extra : ''}`);
  cond ? pass++ : fail++;
};
async function req(path, opts = {}) {
  const res = await fetch(BASE + path, { redirect: 'manual', ...opts });
  let body = null;
  const ct = res.headers.get('content-type') || '';
  try { body = ct.includes('json') ? await res.json() : await res.text(); } catch {}
  return { status: res.status, body, headers: res.headers };
}

(async () => {
  console.log(`\nSmoke test → ${BASE}\n`);

  /* 1. health + DB */
  try {
    const h = await req('/health');
    ok('GET /health', h.status === 200 && h.body && h.body.ok === true, h.body ? `db=${h.body.db}` : '');
    ok('  DB connected', !!h.body && String(h.body.db) === 'connected');
  } catch (e) { ok('GET /health', false, e.message); }

  /* 2. static shell */
  try {
    const p = await req('/');
    ok('GET / (SPA shell)', p.status === 200 && String(p.body).includes('GL Bajaj'), `${p.status}`);
  } catch (e) { ok('GET / (SPA shell)', false, e.message); }

  /* 3. security headers */
  try {
    const p = await req('/');
    ok('  X-Content-Type-Options: nosniff', p.headers.get('x-content-type-options') === 'nosniff');
    ok('  X-Frame-Options set', !!p.headers.get('x-frame-options'));
    ok('  x-powered-by hidden', !p.headers.get('x-powered-by'));
  } catch {}

  /* 4. login (optional) */
  let token = '';
  if (USER && PASS) {
    try {
      const l = await req('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: USER, password: PASS }) });
      if (l.body && l.body.need2fa) {
        ok('POST /api/login', true, '2FA on — OTP bheja gaya (uske baad verify manually). Token check skip.');
      } else {
        token = (l.body && l.body.token) || '';
        ok('POST /api/login', l.status === 200 && !!token, l.body && l.body.error ? l.body.error : (l.body && l.body.user ? `role=${l.body.user.role}` : ''));
      }
    } catch (e) { ok('POST /api/login', false, e.message); }
  } else {
    console.log('  ⏭️  Login skipped (creds nahi diye — role-based checks skip).');
  }

  /* 5. authed role-based checks */
  if (token) {
    const auth = { headers: { Authorization: `Bearer ${token}` } };
    const s = await req('/api/settings', auth);
    ok('GET /api/settings', s.status === 200, '');
    const me = await req('/api/me', auth);
    const role = me.body && me.body.user && me.body.user.role;
    ok('GET /api/me', me.status === 200 && !!role, `role=${role}`);
    if (role === 'admin') {
      const dwr = await req('/api/dwr/principal?date=' + new Date().toISOString().slice(0, 10), auth);
      ok('GET /api/dwr/principal', dwr.status === 200, 'DWR principal view');
      const ab = await req('/api/archive/batches', auth);
      ok('GET /api/archive/batches', ab.status === 200, 'Alumni archive');
    }
    if (role === 'teacher') {
      const mine = await req('/api/dwr/mine?date=' + new Date().toISOString().slice(0, 10), auth);
      ok('GET /api/dwr/mine', mine.status === 200, 'DWR teacher view');
    }
    if (role === 'student') {
      const as = await req('/api/assignments/mine', auth);
      ok('GET /api/assignments/mine', as.status === 200, 'Assignments');
    }
  }

  /* summary */
  console.log(`\n  ${fail === 0 ? '🎉 ALL PASS' : '⚠️ FAILURES'} — ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('Smoke test crash:', e.message); process.exit(1); });
