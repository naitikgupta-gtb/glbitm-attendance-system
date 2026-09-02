(() => {
'use strict';
/* ================= helpers ================= */
const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const thisMonth = () => todayISO().slice(0, 7);
const safe = (fn) => async (...a) => { try { await fn(...a); } catch (err) { toast(err.message, 'error'); } };
const classLabel = (u) => `${u.program || '—'}${u.branch && u.branch !== 'General' ? ' · ' + u.branch : ''}`;
const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const DAYS_SHORT = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const PROGRAMS = {
  'B.Tech': { sems: 8, branches: ['CSE','CSE (Artificial Intelligence)','CSE (Data Science)','CSE (Artificial Intelligence and Machine Learning)','Computer Science and Information Technology','CSE (in Hindi)','Electronics and Communication Engineering','Electrical and Computer Engineering','Mechanical Engineering'] },
  'BCA': { sems: 6, branches: ['General'] }, 'BBA': { sems: 6, branches: ['General'] },
  'MCA': { sems: 4, branches: ['General'] }, 'MBA': { sems: 4, branches: ['General'] },
  'PGDM': { sems: 6, branches: ['General'] },
  'M.Tech': { sems: 4, branches: ['CSE','Electronics and Communication Engineering','Mechanical Engineering'] },
};

/* ================= i18n ================= */
const LANG = {
  en: { overview:'Overview', students:'Students', teachers:'Teachers', timetable:'Timetable', reports:'Reports', requests:'Leaves & Fixes', announce:'Announcements', audit:'Audit Log', mark:'Mark Attendance', marks:'Marks Entry', sessions:'My Sessions', attendance:'My Attendance', selfmark:'Self Mark (QR)', leave:'Apply Leave', child:'My Child', save:'Save', load:'Load Students', allPresent:'All Present', print:'Print', export:'Export', threshold:'Attendance Threshold', present:'Present', late:'Late', absent:'Absent', date:'Date', subject:'Subject', program:'Program', branch:'Branch', semester:'Semester', section:'Section' },
  hi: { overview:'अवलोकन', students:'छात्र', teachers:'शिक्षक', timetable:'समय-सारणी', reports:'रिपोर्ट', requests:'अवकाश व सुधार', announce:'सूचनाएँ', audit:'ऑडिट लॉग', mark:'उपस्थिति लगाएँ', marks:'अंक प्रविष्टि', sessions:'मेरे सत्र', attendance:'मेरी उपस्थिति', selfmark:'स्वयं उपस्थित (QR)', leave:'अवकाश लगाएँ', child:'मेरा बच्चा', save:'सहेजें', load:'छात्र लोड करें', allPresent:'सब उपस्थित', print:'प्रिंट', export:'एक्सपोर्ट', threshold:'उपस्थिति सीमा', present:'उपस्थित', late:'देर', absent:'अनुपस्थित', date:'दिनांक', subject:'विषय', program:'प्रोग्राम', branch:'शाखा', semester:'सेमेस्टर', section:'वर्ग' },
};
const t = (k) => (LANG[state.lang] && LANG[state.lang][k]) || LANG.en[k] || k;

function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`; el.textContent = msg;
  $('#toastBox').appendChild(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 4200);
}
function countUp(el, val, suffix = '') {
  const dur = 900, start = performance.now();
  const step = (tm) => { const p = Math.min(1, (tm - start) / dur); el.textContent = Math.round(val * (1 - Math.pow(1 - p, 3))) + suffix; if (p < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function confetti() {
  const c = document.createElement('canvas');
  c.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:999';
  document.body.appendChild(c); c.width = innerWidth; c.height = innerHeight;
  const x = c.getContext('2d');
  const P = [...Array(130)].map(() => ({ x: Math.random()*c.width, y: -20 - Math.random()*c.height/2, r: 4+Math.random()*6, c: `hsl(${Math.random()*360},90%,60%)`, vy: 2+Math.random()*4, vx: -1+Math.random()*2, a: Math.random()*6 }));
  let tm = 0;
  (function f(){ tm++; x.clearRect(0,0,c.width,c.height);
    P.forEach(p => { p.x+=p.vx; p.y+=p.vy; p.a+=.1; x.save(); x.translate(p.x,p.y); x.rotate(p.a); x.fillStyle=p.c; x.fillRect(-p.r/2,-p.r/2,p.r,p.r*.6); x.restore(); });
    tm < 180 ? requestAnimationFrame(f) : c.remove(); })();
}
const DEVICE_ID = (() => { let d = localStorage.getItem('ams_device'); if (!d) { d = crypto.randomUUID ? crypto.randomUUID() : String(Math.random()); localStorage.setItem('ams_device', d); } return d; })();

/* ================= logo & campus ================= */
const GL_SVG = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><path d="M32 2 58 12v22c0 15-11 25-26 28C17 59 6 49 6 34V12Z" fill="#1d4ed8" stroke="rgba(255,255,255,.35)" stroke-width="1.5"/><text x="32" y="39" text-anchor="middle" font-family="Arial" font-size="21" font-weight="700" fill="#fff">GL</text></svg>`;
function mountLogo(el) {
  const img = document.createElement('img');
  img.src = 'assets/logo.png'; img.alt = 'GLBITM';
  img.onload = () => { el.innerHTML = ''; el.appendChild(img); };
  img.onerror = () => { el.innerHTML = GL_SVG; };
  setTimeout(() => { if (!el.firstChild) el.innerHTML = GL_SVG; }, 1500);
}
['brandLogoBig','brandLogoSmall','brandLogoSide'].forEach((id) => { const el = document.getElementById(id); if (el) mountLogo(el); });
(() => { const t2 = new Image(); t2.onload = () => { $('#campusBg').style.backgroundImage = 'url(assets/campus.jpg)'; }; t2.src = 'assets/campus.jpg'; })();

/* ================= theme ================= */
function setTheme(dark) {
  document.body.classList.toggle('dark', dark);
  localStorage.setItem('ams_theme', dark ? 'dark' : 'light');
  document.querySelectorAll('.themeToggle').forEach((b) => { b.textContent = dark ? '☀️' : '🌙'; });
}
document.querySelectorAll('.themeToggle').forEach((b) => b.addEventListener('click', () => setTheme(!document.body.classList.contains('dark'))));
setTheme(localStorage.getItem('ams_theme') ? localStorage.getItem('ams_theme') === 'dark' : true);

/* ================= state & api ================= */
const state = {
  token: localStorage.getItem('ams_token') || null, user: null, roster: [], marks: new Map(),
  section: null, focusIdx: 0, smSession: null, smTimer: null, smRotTimer: null,
  voiceOn: false, settings: { threshold: 75 }, sections: ['A', 'B', 'C'],
  lang: localStorage.getItem('ams_lang') || 'en',
  smStream: null,
};
const pctClass = (p) => { const th = state.settings.threshold || 75; return p >= th ? 'good' : p >= (th - 25) ? 'warn' : 'bad'; };
const mySubjects = () => (Array.isArray(state.user && state.user.subjects) ? state.user.subjects.filter(Boolean) : []);

 $('#langBtn').addEventListener('click', () => {
  state.lang = state.lang === 'en' ? 'hi' : 'en';
  localStorage.setItem('ams_lang', state.lang);
  toast(state.lang === 'hi' ? 'भाषा: हिंदी 🌐' : 'Language: English 🌐', 'info');
  if (state.user) { buildNav(); go(state.section); }
});

function saveSession(token, user) { state.token = token; state.user = user; localStorage.setItem('ams_token', token); localStorage.setItem('ams_user', JSON.stringify(user)); }
function clearSession() { state.token = null; state.user = null; localStorage.removeItem('ams_token'); localStorage.removeItem('ams_user'); }
function showLogin() { $('#view-app').hidden = true; $('#view-login').hidden = false; }
async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(path, { ...opts, headers });
  let data = null; try { data = await res.json(); } catch {}
  if (!res.ok) {
    if (res.status === 401 && state.token) { clearSession(); showLogin(); }
    throw new Error((data && data.error) || `Request failed (${res.status})`);
  }
  return data;
}
async function downloadFile(url, filename) {
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${state.token}` } });
    if (!res.ok) throw new Error('Download failed.');
    const u = URL.createObjectURL(await res.blob());
    const a = document.createElement('a'); a.href = u; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(u);
    toast('Downloaded.');
  } catch (err) { toast(err.message, 'error'); }
}

/* ================= login ================= */
let pending2fa = null;
function bindLogin() {
  const err = $('#loginError'), btn = $('#loginBtn');
  document.querySelectorAll('.chip').forEach((ch) => ch.addEventListener('click', () => { $('#username').value = ch.dataset.u; $('#password').value = ch.dataset.p; err.hidden = true; }));
  $('#togglePw').addEventListener('click', () => { $('#password').type = $('#password').type === 'password' ? 'text' : 'password'; });
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true; btn.disabled = true;
    btn.textContent = 'Signing in…';
    try {
      if (pending2fa) {
        const r = await fetch('/api/login/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: pending2fa, code: $('#otpInput').value }) });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || `OTP failed (${r.status}).`);
        pending2fa = null;
        saveSession(data.token, data.user); startApp();
        toast(`Welcome, ${data.user.name.split(' ')[0]}! 👋`);
      } else {
        btn.textContent = 'Signing in… (cold start? 30–50s)';
        const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: $('#username').value, password: $('#password').value }) });
        let data;
        try { data = await res.json(); }
        catch { throw new Error(`Server ne galat jawab diya (${res.status}) — Render cold start ho sakta hai, 1 min baad retry karo.`); }
        if (!res.ok) throw new Error(data.error || `Login failed (${res.status}).`);
        if (data.need2fa) {
          pending2fa = data.username;
          $('#loginStep1').hidden = true;
          const demoBox = document.querySelector('.demo-box'); if (demoBox) demoBox.hidden = true;
          $('#loginStep2').hidden = false;
          $('#otpHint').textContent = data.devCode ? `📧 Console mode — OTP: ${data.devCode}` : '📧 OTP email par bheja gaya (5 min).';
          btn.textContent = 'Verify OTP →'; btn.disabled = false;
          setTimeout(() => $('#otpInput').focus(), 50);
          return;
        }
        saveSession(data.token, data.user); startApp();
        toast(`Welcome, ${data.user.name.split(' ')[0]}! 👋`);
      }
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
    btn.disabled = false;
    if (!pending2fa) btn.textContent = 'Sign in →';
  });

  fetch('/api/setup/status').then((r) => r.json()).then((st) => {
    if (st.needsSetup) {
      const box = document.createElement('div');
      box.style.cssText = 'background:var(--green-soft);color:var(--green);text-align:left;cursor:pointer;margin-top:14px;padding:14px;border-radius:10px;font-size:.86rem;';
      box.innerHTML = '<strong>⚙️ First-time Setup:</strong> Abhi koi admin nahi hai. Click karke pehla admin account banao →';
      box.addEventListener('click', openSetupWizard);
      const demo = document.querySelector('.demo-box');
      if (demo) demo.before(box); else $('.auth-card').appendChild(box);
    }
    const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (!st.canShowDemo && !isLocal) { const d = document.querySelector('.demo-box'); if (d) d.hidden = true; }
  }).catch(() => {});
}
function openSetupWizard() {
  if ($('#setupModal')) return;
  const host = $('.auth-card');
  host.insertAdjacentHTML('beforeend', `
    <div id="setupModal" class="modal" style="position:fixed;">
      <div class="modal-box" style="text-align:left;max-width:380px;">
        <h2>⚙️ First-Time Setup</h2>
        <p class="muted small" style="margin-bottom:14px;">Pehla admin account banao. Ye sirf tab tak accessible hai jab tak koi admin na ho. Password strong rakho (min 8 chars).</p>
        <div style="display:grid;gap:12px;">
          <input class="input" id="suName" placeholder="Your full name" />
          <input class="input" id="suUser" placeholder="Admin username" />
          <input class="input" id="suPass" type="password" placeholder="Password (min 8 chars)" />
          <input class="input" id="suEmail" type="email" placeholder="Email (optional, for alerts)" />
          <button class="btn btn-primary btn-block" id="suGo">👑 Create Admin Account</button>
          <button class="btn btn-ghost btn-block" id="suCancel">Cancel</button>
        </div>
      </div>
    </div>`);
  $('#suCancel').addEventListener('click', () => $('#setupModal').remove());
  $('#suGo').addEventListener('click', safe(async () => {
    const r = await fetch('/api/setup/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: $('#suName').value, username: $('#suUser').value, password: $('#suPass').value, email: $('#suEmail').value }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Setup failed.');
    $('#setupModal').remove();
    toast(d.message);
    document.querySelectorAll('.auth-card > div[style*="green"]').forEach((el) => el.remove());
    $('#username').value = $('#suUser').value; $('#password').value = '';
    $('#username').focus();
  }));
}

/* ================= navigation ================= */
const NAVS = {
  admin: [ ['overview','📊'],['students','🧑‍🎓'],['teachers','🧑‍🏫'],['timetable','🗓️'],['reports','📈'],['requests','📥'],['announce','📢'],['audit','📜'] ],
  teacher: [ ['mark','✏️'],['marks','📝'],['timetable','🗓️'],['sessions','🗂️'] ],
  student: [ ['attendance','📊'],['selfmark','📲'],['leave','📝'],['timetable','🗓️'] ],
  parent: [ ['child','👨‍👩‍👧'] ],
};
const NAV_TITLES = { overview:'Overview', students:'Manage Students', teachers:'Manage Teachers', timetable:'Timetable', reports:'Reports', requests:'Leaves & Corrections', announce:'Announcements', audit:'Audit Log', mark:'Mark Attendance', marks:'Marks Entry', sessions:'My Sessions', attendance:'My Attendance', selfmark:'Self Mark Attendance', leave:'Apply for Leave', child:'My Child' };
function navLabel(id) { return t(id); }

function buildNav() {
  const nav = $('#navLinks');
  nav.innerHTML = NAVS[state.user.role].map(([id, icon], i) =>
    `<button class="nav-link" data-nav="${id}">${icon} ${navLabel(id)}${i < 9 ? `<span class="k">${i+1}</span>` : ''}</button>`).join('');
  nav.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => go(b.dataset.nav)));
}
async function startApp() {
  $('#view-login').hidden = true; $('#view-app').hidden = false;
  try {
    state.settings = await api('/api/settings');
    const secs = state.settings && state.settings.sections;
    if (Array.isArray(secs) && secs.length) state.sections = secs;
  } catch {}
  $('#avatar').textContent = state.user.name.charAt(0).toUpperCase();
  $('#userName').textContent = state.user.name;
  $('#userRole').textContent = { admin:'Administrator', teacher:'Teacher', student:'Student', parent:'Parent' }[state.user.role];
  $('#roleBadge').textContent = state.user.role === 'student'
    ? `${classLabel(state.user)} · Sem ${state.user.semester ?? '—'}${state.user.section ? ' · ' + state.user.section : ''}`
    : state.user.role === 'parent' ? '👨‍👩‍👧 Parent Portal · read-only'
    : state.user.role === 'admin' ? '⚡ Admin Console · GLBITM' : '📚 Teacher Portal · GLBITM';
  $('#dateBadge').textContent = new Date().toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'short', year:'numeric' });
  buildNav();
  renderAnnouncements();
  checkNotifications();
  const smParam = new URLSearchParams(location.search).get('sm');
  if (smParam && state.user.role === 'student') { go('selfmark'); setTimeout(() => { const i = $('#smSessionInput'); if (i) i.value = smParam; }, 400); return; }
  go(NAVS[state.user.role][0][0]);
}
let _charts = [];
function killCharts() { _charts.forEach((c) => { try { c.destroy(); } catch {} }); _charts = []; }
function go(id) {
  stopVoice(); stopSMTimers(); killCharts();
  state.section = id; state.focusIdx = 0;
  document.querySelectorAll('#navLinks .nav-link').forEach((b) => b.classList.toggle('active', b.dataset.nav === id));
  const def = SECTIONS[state.user.role][id];
  $('#pageTitle').textContent = NAV_TITLES[id] || id;
  $('#pageTitle').className = 'grad-text';
  $('#pageContent').innerHTML = def.html();
  if (def.init) Promise.resolve(def.init()).catch((e) => toast(e.message, 'error'));
}
const refresh = () => go(state.section);
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input,select,textarea') || !state.user || $('#view-app').hidden || e.ctrlKey || e.metaKey) return;
  const n = Number(e.key);
  if (n >= 1 && n <= NAVS[state.user.role].length) go(NAVS[state.user.role][n-1][0]);
});

/* ================= notifications & announcements ================= */
async function checkNotifications() {
  if (!('Notification' in window) || Notification.permission === 'denied') return;
  if (Notification.permission === 'default') { try { await Notification.requestPermission(); } catch {} if (Notification.permission !== 'granted') return; }
  try {
    if (state.user.role === 'student') {
      const st = await api('/api/me/attendance');
      const th = st.threshold || 75;
      if (st.total > 0 && st.percentage < th && localStorage.getItem('ams_lowwarn') !== String(st.percentage)) {
        localStorage.setItem('ams_lowwarn', String(st.percentage));
        new Notification('⚠️ Low Attendance — GLBITM', { body: `Attendance ${st.percentage}% (${th}% chahiye)!` });
      }
    }
    const { items } = await api('/api/announcements');
    if (items.length && items[0].id !== localStorage.getItem('ams_lastAnn')) {
      localStorage.setItem('ams_lastAnn', items[0].id);
      new Notification('📢 New Announcement — GLBITM', { body: items[0].title });
    }
  } catch {}
}
async function renderAnnouncements() {
  try {
    const { items } = await api('/api/announcements');
    $('#annBar').innerHTML = items.length ? `<div class="card" style="padding:14px 20px">${items.slice(0,3).map((a) => `<div class="ann-item"><strong>📢 ${esc(a.title)}</strong> <span class="muted small">— ${esc(a.body)} · ${a.ts.slice(0,10)}</span></div>`).join('')}</div>` : '';
  } catch {}
}

/* ================= pickers & utils ================= */
function wireProgramPicker(pSel, bSel, sSel, semPrefix = 'Sem ') {
  const fillBranches = () => {
    const bs = PROGRAMS[pSel.value].branches;
    bSel.innerHTML = bs.map((b) => `<option value="${esc(b)}">${esc(b)}</option>`).join('');
    bSel.disabled = bs.length === 1;
    fillSems();
  };
  const fillSems = () => { if (!sSel) return; const n = PROGRAMS[pSel.value].sems; sSel.innerHTML = Array.from({length:n},(_,i)=>`<option value="${i+1}">${semPrefix}${i+1}</option>`).join(''); };
  pSel.addEventListener('change', fillBranches);
  if (sSel) bSel.addEventListener('change', fillSems);
  return { set(p, b, s) { pSel.value = PROGRAMS[p] ? p : 'B.Tech'; fillBranches(); if (b && PROGRAMS[pSel.value].branches.includes(b)) bSel.value = b; fillSems(); if (sSel && s && Number(s) <= PROGRAMS[pSel.value].sems) sSel.value = String(Number(s)); } };
}
const secOptions = (all) => (all ? '<option value="">All Sections</option>' : '<option value="">No Section</option>') +
  (Array.isArray(state.sections) && state.sections.length ? state.sections : ['A','B','C']).map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
function wireSearch(inputSel, tbodySel) {
  const inp = $(inputSel); if (!inp) return;
  inp.addEventListener('input', () => {
    const q = inp.value.toLowerCase();
    $(tbodySel).querySelectorAll('tr').forEach((tr) => { tr.hidden = q && !tr.textContent.toLowerCase().includes(q); });
  });
}
const abbr = (s) => s === 'present' ? 'P' : s === 'late' ? 'L' : s === 'absent' ? 'A' : '·';
const cellCls = (s) => s === 'present' ? 'pill-good' : s === 'late' ? 'pill-warn' : s === 'absent' ? 'pill-bad' : '';

/* ================= Excel helpers ================= */
const normKeys = (r) => { const o = {}; Object.keys(r || {}).forEach((k) => { o[String(k).toLowerCase().replace(/[\s_]/g, '')] = String(r[k] ?? '').trim(); }); return o; };
function parseExcelOrCSV(file) {
  return new Promise((resolve, reject) => {
    if (/\.xlsx$|\.xls$/i.test(file.name)) {
      if (!window.XLSX) return reject(new Error('Excel library load nahi hui — internet check karo (CDN).'));
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const wb = XLSX.read(new Uint8Array(reader.result), { type: 'array' });
          const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
          resolve(rows.map(normKeys));
        } catch (e) { reject(e); }
      };
      reader.onerror = () => reject(new Error('File read fail.'));
      reader.readAsArrayBuffer(file);
    } else {
      file.text().then((text) => {
        const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && l.replace(/,/g, '').trim());
        const parseLine = (line) => { const out = []; let cur = '', q = false; for (const ch of line) { if (ch === '"') { q = !q; continue; } if (ch === ',' && !q) { out.push(cur); cur = ''; continue; } cur += ch; } out.push(cur); return out.map((s) => s.trim()); };
        let header = lines.length ? parseLine(lines[0]).map((h) => h.toLowerCase().replace(/[\s_]/g, '')) : [];
        let start = 1;
        if (!header.includes('name') || !header.includes('username')) { header = ['name','rollno','program','branch','semester','section','email','username','password']; start = 0; }
        const rows = [];
        for (let i = start; i < lines.length; i++) {
          const cells = parseLine(lines[i]); const o = {};
          header.forEach((h, j) => { o[h] = cells[j] || ''; });
          rows.push(o);
        }
        resolve(rows);
      }).catch(reject);
    }
  });
}
function makeWorkbook(sheets, filename) {
  if (!window.XLSX) return toast('Excel library load nahi hui (CDN).', 'error');
  const wb = XLSX.utils.book_new();
  sheets.forEach(([name, ws, cols]) => { if (cols) ws['!cols'] = cols; XLSX.utils.book_append_sheet(wb, ws, name); });
  XLSX.writeFile(wb, filename);
}

/* ================= SECTIONS (pages) ================= */
const SECTIONS = {

admin: {
  overview: {
    html: () => `
      <div class="stat-grid">
        <div class="stat-card"><div class="stat-icon">🧑‍🎓</div><div><div class="stat-value" id="statStudents">0</div><div class="stat-label">Students</div></div></div>
        <div class="stat-card"><div class="stat-icon purple">🧑‍🏫</div><div><div class="stat-value" id="statTeachers">0</div><div class="stat-label">Teachers</div></div></div>
        <div class="stat-card"><div class="stat-icon amber">🗂️</div><div><div class="stat-value" id="statSessions">0</div><div class="stat-label">Sessions</div></div></div>
        <div class="stat-card"><div class="stat-icon green">✅</div><div><div class="stat-value" id="statOverall">0%</div><div class="stat-label">Overall</div></div></div>
      </div>
      <div class="card"><h2>⚙️ System Settings</h2>
        <div style="display:flex;gap:12px;align-items:end;flex-wrap:wrap;">
          <label style="display:grid;gap:6px;font-size:.8rem;font-weight:600;">${t('threshold')} (%)
            <input class="input" type="number" id="setTh" min="40" max="95" style="max-width:130px;" /></label>
          <button class="btn btn-primary btn-sm" id="setSave">${t('save')}</button>
          <span class="muted small">Yahi % eligibility, defaulters, colors — sab jagah use hota hai.</span>
        </div>
        <div style="margin-top:14px;padding-top:14px;border-top:1px dashed var(--border-strong);">
          <label style="display:block;font-size:.8rem;font-weight:600;margin-bottom:6px;">🏫 Sections (comma-separated — koi bhi naam)</label>
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
            <input class="input" id="setSecs" style="max-width:360px;" placeholder="e.g. A, B, C, AI-1, CSE-STAR" />
            <button class="btn btn-primary btn-sm" id="secSave">Save Sections</button>
            <span class="muted small" id="secCurrent"></span>
          </div>
          <p class="muted small" style="margin-top:6px;">Sab dropdowns me apply hoga. Uppercase auto.</p>
        </div></div>
      <div class="card def-card"><div class="card-head"><h2>🚨 Defaulters + 🔮 Risk Prediction</h2>
        <button class="btn btn-ghost btn-sm" id="mailDefBtn">📧 Email Defaulters</button></div>
        <div id="defList"><p class="muted">Loading…</p></div></div>
      <div class="card"><h2>🎓 Bulk Promotion</h2>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <select class="input" id="promoProg" style="max-width:220px;"><option value="">All Programs</option>${Object.keys(PROGRAMS).map((p)=>`<option>${p}</option>`).join('')}</select>
          <button class="btn btn-primary" id="promoBtn">🎓 Promote</button></div></div>
      <div class="card"><h2>💾 Backup & Restore</h2>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn btn-ghost" id="backupBtn">⬇️ Backup</button>
          <button class="btn btn-danger" id="restoreBtn">📤 Restore</button></div></div>`,
    init: async () => {
      const s = await api('/api/reports/summary');
      state.settings.threshold = s.threshold;
      countUp($('#statStudents'), s.totalStudents); countUp($('#statTeachers'), s.totalTeachers);
      countUp($('#statSessions'), s.sessionsMarked); countUp($('#statOverall'), s.overallPercentage, '%');
      $('#setTh').value = s.threshold;
      $('#setSave').addEventListener('click', safe(async () => {
        const r = await api('/api/admin/settings', { method:'PATCH', body: JSON.stringify({ threshold: Number($('#setTh').value) }) });
        state.settings.threshold = r.threshold; toast(r.message); loadDefaulters();
      }));
      $('#secCurrent').textContent = `Current: ${(state.sections || []).join(', ')}`;
      $('#setSecs').value = (state.sections || []).join(', ');
      $('#secSave').addEventListener('click', safe(async () => {
        const raw = $('#setSecs').value;
        const r = await api('/api/admin/sections', { method:'PUT', body: JSON.stringify({ sections: raw.split(',').map((x) => x.trim()).filter(Boolean) }) });
        state.sections = r.sections;
        $('#secCurrent').textContent = `Current: ${r.sections.join(', ')}`;
        toast(r.message);
      }));
      loadDefaulters();
      $('#mailDefBtn').addEventListener('click', safe(async () => toast((await api('/api/reports/email-defaulters', { method:'POST' })).message, 'info')));
      $('#promoBtn').addEventListener('click', safe(async () => {
        if (!confirm('⚠️ Semester +1. Continue?')) return;
        toast((await api('/api/admin/promote', { method:'POST', body: JSON.stringify({ program: $('#promoProg').value }) })).message);
        loadDefaulters();
      }));
      $('#backupBtn').addEventListener('click', () => downloadFile('/api/admin/backup', `glbajaj-backup-${todayISO()}.json`));
      $('#restoreBtn').addEventListener('click', restoreBackup);
    },
  },
  students: {
    html: () => `
      <div class="card"><h2>➕ Add Student</h2>
        <form id="addStudentForm" class="form-grid">
          <input class="input" id="stName" placeholder="Full name" required />
          <input class="input" id="stRoll" placeholder="Roll no" />
          <select class="input" id="stProgram">${Object.keys(PROGRAMS).map((p)=>`<option>${p}</option>`).join('')}</select>
          <select class="input" id="stBranch"></select>
          <select class="input" id="stSem"></select>
          <select class="input" id="stSec"><option value="">No Section</option>${secOptions()}</select>
          <input class="input" id="stEmail" type="email" placeholder="Email (alerts)" />
          <input class="input" id="stCard" placeholder="RFID Card ID (optional)" />
          <input class="input" id="stUsername" placeholder="Username" required />
          <input class="input" id="stPassword" placeholder="Password" required />
          <button class="btn btn-primary">＋ Add</button>
        </form></div>
      <div class="card"><h2>📥 Bulk Import — Excel (.xlsx) ya CSV</h2>
        <p class="muted small">Best tarika: <strong>⬇️ Template</strong> download karo → Instructions sheet padho → bharo → upload. Galat values reason ke saath reject hoti hain.</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:10px;">
          <button class="btn btn-ghost btn-sm" id="tplBtn">⬇️ Student Template</button>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
          <input type="file" id="bulkFile" class="input" style="max-width:300px;" accept=".xlsx,.xls,.csv" />
          <button class="btn btn-primary" id="bulkBtn">📥 Import Students</button></div>
        <div id="bulkResult" class="muted small" style="margin-top:10px;"></div></div>
      <div class="card"><h2>🎓 Enrolled Students</h2>
        <input class="input search-input" id="stSearch" placeholder="🔍 Search name / roll / class…" />
        <div class="table-wrap"><table>
          <thead><tr><th>Roll</th><th>Name</th><th>Username</th><th>Class</th><th>Sem/Sec</th><th></th></tr></thead>
          <tbody id="studentsBody"></tbody></table></div></div>`,
    init: () => {
      wireProgramPicker($('#stProgram'), $('#stBranch'), $('#stSem'));
      $('#addStudentForm').addEventListener('submit', safe(addStudent));
      $('#tplBtn').addEventListener('click', downloadStudentTemplate);
      $('#bulkBtn').addEventListener('click', safe(bulkImportStudents));
      return loadAdminStudents();
    },
  },
  teachers: {
    html: () => `
      <div class="card"><h2>➕ Add Teacher</h2>
        <form id="addTeacherForm" class="form-grid">
          <input class="input" id="tcName" placeholder="Full name" required />
          <label>${t('program')}<select class="input" id="tcProgram">${Object.keys(PROGRAMS).map((p)=>`<option>${p}</option>`).join('')}</select></label>
          <label>Department<select class="input" id="tcBranch"></select></label>
          <input class="input" id="tcEmail" type="email" placeholder="Email (2FA OTP)" />
          <input class="input" id="tcSubjects" placeholder="Subjects (comma-separated)" />
          <input class="input" id="tcUsername" placeholder="Username" required />
          <input class="input" id="tcPassword" placeholder="Password" required />
          <button class="btn btn-primary">＋ Add</button>
        </form></div>
      <div class="card"><h2>📥 Bulk Import Teachers — Excel (.xlsx) ya CSV</h2>
        <p class="muted small">Columns: <code>name,username,password,program,branch,email,subjects</code> — <code>subjects</code> comma-separated ho to Excel me quote karo. <code>role</code> column ki zaroorat nahi (sab teachers hi banenge).</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:10px;">
          <button class="btn btn-ghost btn-sm" id="tTplBtn">⬇️ Teacher Template</button>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
          <input type="file" id="tBulkFile" class="input" style="max-width:300px;" accept=".xlsx,.xls,.csv" />
          <button class="btn btn-primary" id="tBulkBtn">📥 Import Teachers</button></div>
        <div id="tBulkResult" class="muted small" style="margin-top:10px;"></div></div>
      <div class="card"><h2>🧑‍🏫 Teaching Staff</h2>
        <input class="input search-input" id="tcSearch" placeholder="🔍 Search…" />
        <div class="table-wrap"><table>
          <thead><tr><th>Name</th><th>Username</th><th>Dept</th><th>Subjects</th><th></th></tr></thead>
          <tbody id="teachersBody"></tbody></table></div></div>`,
    init: () => {
      wireProgramPicker($('#tcProgram'), $('#tcBranch'), null);
      $('#addTeacherForm').addEventListener('submit', safe(addTeacher));
      $('#tTplBtn').addEventListener('click', downloadTeacherTemplate);
      $('#tBulkBtn').addEventListener('click', safe(bulkImportTeachers));
      return loadAdminTeachers();
    },
  },
  timetable: {
    html: () => `
      <div class="card"><h2>➕ Add Class Slot</h2>
        <form id="ttForm" class="form-grid">
          <label>${t('program')}<select class="input" id="ttProgram">${Object.keys(PROGRAMS).map((p)=>`<option>${p}</option>`).join('')}</select></label>
          <label>${t('branch')}<select class="input" id="ttBranch"></select></label>
          <label>${t('semester')}<select class="input" id="ttSem"></select></label>
          <label>${t('section')}<select class="input" id="ttSec"><option value="">No Section</option>${secOptions()}</select></label>
          <label>Day<select class="input" id="ttDay">${DAYS.map((d)=>`<option>${d}</option>`).join('')}</select></label>
          <label>Period<select class="input" id="ttPeriod">${[1,2,3,4,5,6,7,8].map((n)=>`<option value="${n}">P${n}</option>`).join('')}</select></label>
          <label>Teacher<select class="input" id="ttTeacher"></select></label>
          <input class="input" id="ttSubject" placeholder="Subject" required />
          <button class="btn btn-primary">＋ Add Slot</button>
        </form></div>
      <div class="card"><h2>🏛️ Holiday Calendar</h2>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end;margin-bottom:12px;">
          <input class="input" type="date" id="holDate" style="max-width:180px;" />
          <input class="input" id="holTitle" placeholder="Holiday title" style="max-width:220px;" />
          <button class="btn btn-primary btn-sm" id="holAdd">＋ Add Holiday</button></div>
        <div id="holList" class="muted small">Loading…</div></div>
      <div class="card"><h2>🗓️ Weekly Timetable (🔄 = substitution)</h2>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end;margin-bottom:14px;">
          <select class="input" id="vtProgram" style="max-width:150px;">${Object.keys(PROGRAMS).map((p)=>`<option>${p}</option>`).join('')}</select>
          <select class="input" id="vtBranch" style="max-width:220px;"></select>
          <select class="input" id="vtSem" style="max-width:100px;"></select>
          <select class="input" id="vtSec" style="max-width:120px;"><option value="">No Sec</option>${secOptions()}</select>
        </div>
        <div id="ttAdminView"><p class="muted">Loading…</p></div></div>`,
    init: async () => {
      wireProgramPicker($('#ttProgram'), $('#ttBranch'), $('#ttSem'));
      const vp = wireProgramPicker($('#vtProgram'), $('#vtBranch'), $('#vtSem'));
      vp.set('B.Tech', 'CSE', 3);
      ['vtProgram','vtBranch','vtSem','vtSec'].forEach((id) => $('#' + id).addEventListener('change', () => loadAdminTimetable()));
      const { users } = await api('/api/users?role=teacher');
      $('#ttTeacher').innerHTML = '<option value="">TBA</option>' + users.map((u) => `<option value="${u.id}">${esc(u.name)}</option>`).join('');
      $('#ttForm').addEventListener('submit', safe(async (e) => {
        e.preventDefault();
        await api('/api/timetable', { method:'POST', body: JSON.stringify({
          program: $('#ttProgram').value, branch: $('#ttBranch').value, semester: $('#ttSem').value,
          section: $('#ttSec').value, day: $('#ttDay').value, period: Number($('#ttPeriod').value),
          subject: $('#ttSubject').value.trim(), teacherId: $('#ttTeacher').value }) });
        toast('Slot added 🗓️'); loadAdminTimetable();
      }));
      $('#holAdd').addEventListener('click', safe(async () => {
        if (!$('#holDate').value) return toast('Date chuno.', 'error');
        await api('/api/holidays', { method:'POST', body: JSON.stringify({ date: $('#holDate').value, title: $('#holTitle').value || 'Holiday' }) });
        toast('Holiday added 🏛️'); $('#holDate').value = ''; $('#holTitle').value = ''; loadHolidays();
      }));
      return Promise.all([loadAdminTimetable(), loadHolidays()]);
    },
  },
  reports: {
    html: () => `
      <div class="card"><div class="card-head"><h2>📋 Global Report</h2>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-ghost btn-sm" id="excelBtn">📊 Excel</button>
          <button class="btn btn-ghost btn-sm" id="printBtn">🖨️ Print / PDF</button></div></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end;margin-bottom:14px;">
          <label style="font-size:.78rem;font-weight:600;display:grid;gap:4px;">From<input class="input" type="date" id="repFrom" style="max-width:170px;" /></label>
          <label style="font-size:.78rem;font-weight:600;display:grid;gap:4px;">To<input class="input" type="date" id="repTo" style="max-width:170px;" /></label>
          <button class="btn btn-primary btn-sm" id="repApply">Apply Range</button>
          <button class="btn btn-ghost btn-sm" id="repClear">Clear</button>
          <span class="muted small" id="repRangeNote"></span></div>
        <input class="input search-input" id="repSearch" placeholder="🔍 Search student…" />
        <div class="table-wrap"><table>
          <thead><tr><th>Roll</th><th>Name</th><th>Class</th><th>Sessions</th><th>P/L/A</th><th>%</th></tr></thead>
          <tbody id="reportBody"></tbody></table></div></div>
      <div class="card"><h2>📊 Program-wise Average</h2><div class="chart-box"><canvas id="branchChart"></canvas></div></div>
      <div class="card"><h2>📚 Subject-wise Attendance (weakest first)</h2><div id="subjStats" class="muted small">Loading…</div></div>
      <div class="card"><h2>🧑‍🏫 Teacher Workload</h2>
        <div class="table-wrap"><table>
          <thead><tr><th>Teacher</th><th>Sessions</th><th>Entries</th><th>Avg Class %</th></tr></thead>
          <tbody id="workBody"></tbody></table></div></div>
      <div class="card"><h2>📈 Attendance vs Marks Correlation</h2><div class="chart-box"><canvas id="corrChart"></canvas></div>
        <p class="muted small" id="corrNote"></p></div>
      <div class="card"><h2>📋 Monthly Register (printable)</h2>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end;margin-bottom:14px;">
          <select class="input" id="rgProgram" style="max-width:150px;">${Object.keys(PROGRAMS).map((p)=>`<option>${p}</option>`).join('')}</select>
          <select class="input" id="rgBranch" style="max-width:220px;"></select>
          <select class="input" id="rgSem" style="max-width:100px;"></select>
          <select class="input" id="rgSec" style="max-width:120px;"><option value="">No Sec</option>${secOptions()}</select>
          <input class="input" id="rgSubject" placeholder="Subject" style="max-width:200px;" />
          <input class="input" type="month" id="rgMonth" value="${thisMonth()}" style="max-width:170px;" />
          <button class="btn btn-primary btn-sm" id="rgLoad">Load Register</button></div>
        <div id="regView"></div></div>`,
    init: () => {
      wireProgramPicker($('#rgProgram'), $('#rgBranch'), $('#rgSem'));
      $('#repApply').addEventListener('click', () => loadAdminReport());
      $('#repClear').addEventListener('click', () => { $('#repFrom').value = ''; $('#repTo').value = ''; loadAdminReport(); });
      $('#excelBtn').addEventListener('click', () => { const q = rangeQ(); downloadFile(`/api/reports/export${q}`, `attendance-${todayISO()}.csv`); });
      $('#printBtn').addEventListener('click', () => window.print());
      $('#rgLoad').addEventListener('click', safe(loadRegister));
      return loadAdminReport();
    },
  },
  requests: {
    html: () => `<div class="card"><h2>📝 Leave Applications</h2><div id="leaveAdminList"><p class="muted">Loading…</p></div></div>
      <div class="card"><h2>⚠️ Correction Requests</h2><div id="fixAdminList"><p class="muted">Loading…</p></div></div>`,
    init: () => Promise.all([loadLeaveAdmin(), loadFixAdmin()]),
  },
  announce: {
    html: () => `<div class="card"><h2>📢 Post Announcement</h2>
      <form id="annForm" style="display:grid;gap:12px;">
        <input class="input" id="annTitle" placeholder="Title" required />
        <textarea class="input" id="annBody" rows="2" placeholder="Details"></textarea>
        <button class="btn btn-primary" style="justify-self:start;">Publish →</button></form></div>
      <div class="card"><h2>Current</h2><div id="annList"><p class="muted">Loading…</p></div></div>`,
    init: () => {
      $('#annForm').addEventListener('submit', safe(async (e) => {
        e.preventDefault();
        const r = await api('/api/announcements', { method:'POST', body: JSON.stringify({ title: $('#annTitle').value, body: $('#annBody').value }) });
        toast(r.emailed ? `Published 📢 (${r.emailed} emails)` : 'Published 📢');
        $('#annTitle').value = ''; $('#annBody').value = '';
        loadAnnList(); renderAnnouncements();
      }));
      return loadAnnList();
    },
  },
  audit: {
    html: () => `<div class="card"><h2>📜 Audit Log</h2><div class="table-wrap"><table>
      <thead><tr><th>Type</th><th>User</th><th>Detail</th><th>Time</th></tr></thead>
      <tbody id="auditBody"></tbody></table></div></div>`,
    init: () => loadAudit(),
  },
},

teacher: {
  mark: {
    html: () => `
      <div class="card"><h2>🏫 Class & Session</h2>
        <div class="filter-grid">
          <label>${t('program')}<select class="input" id="mProgram">${Object.keys(PROGRAMS).map((p)=>`<option>${p}</option>`).join('')}</select></label>
          <label>${t('branch')}<select class="input" id="mBranch"></select></label>
          <label>${t('semester')}<select class="input" id="mSem"></select></label>
          <label>${t('section')}<select class="input" id="mSec"><option value="">All</option>${secOptions()}</select></label>
          <label>${t('subject')}
            <select class="input" id="tSubjectSelect" hidden></select>
            <input class="input" id="tSubject" list="subjectList" placeholder="e.g. Data Structures" />
            <datalist id="subjectList"><option>Data Structures</option><option>DBMS</option><option>Operating Systems</option><option>Digital Electronics</option></datalist></label>
          <label>${t('date')}<input class="input" type="date" id="tDate" /></label>
          <button class="btn btn-primary" id="loadBtn">${t('load')} →</button></div>
        <p class="muted small" id="subjectHint" style="margin-top:10px;"></p></div>
      <div class="card" id="markCard" hidden>
        <div class="mark-header">
          <div><h2 id="classListTitle">—</h2><span class="muted small" id="classListDate"></span></div>
          <div class="mark-actions">
            <span id="markCounts"></span>
            <button class="btn btn-ghost btn-sm mic-btn" id="micBtn">🎙️</button>
            <button class="btn btn-ghost btn-sm" id="pickBtn">🎯</button>
            <button class="btn btn-ghost btn-sm" id="allPresentBtn">✓ ${t('allPresent')}</button>
            <button class="btn btn-primary" id="submitBtn">💾 ${t('save')}</button></div></div>
        <input class="input" id="tNote" placeholder="📝 Session note (optional)" style="margin-bottom:14px;" />
        <div id="studentList" class="student-list"></div>
        <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
          <button class="btn btn-primary" id="openSM">📲 Open Rotating-QR Self-Marking</button>
          <span class="muted small">Code har 30 sec badalta hai — screenshot share se dhokha nahi hoga 😄</span></div>
        <div id="smPanel" hidden style="margin-top:16px;padding:18px;border:1px dashed var(--border-strong);border-radius:14px;">
          <div class="sm-panel">
            <div class="center"><div id="qrBox"></div>
              <p class="muted small" style="margin-top:8px;">Session: <strong id="smSessionId">—</strong></p></div>
            <div>
              <div class="sm-code" id="smCode">——</div>
              <p class="muted small" id="smCountdown"></p>
              <p class="muted small">Students: <strong>Self Mark</strong> section me session + code daalo (QR scan = auto session).</p>
              <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
                <button class="btn btn-danger btn-sm" id="smCloseBtn">⏹ Close</button>
                <span id="smLive" class="muted small"></span></div>
              <div id="smLiveList" style="margin-top:10px;max-height:180px;overflow-y:auto;"></div></div></div></div>
        <div class="kbd-hint">⌨️ <kbd>↑</kbd><kbd>↓</kbd> · <kbd>P</kbd>/<kbd>L</kbd>/<kbd>A</kbd> · <kbd>Enter</kbd> save · 🎙️ "present/late/absent/next/save"</div></div>`,
    init: () => {
      const picker = wireProgramPicker($('#mProgram'), $('#mBranch'), $('#mSem'), '');
      picker.set(state.user.program || 'B.Tech', state.user.branch || 'CSE', 1);
      $('#tDate').value = todayISO();
      const subs = mySubjects();
      if (subs.length) {
        $('#tSubject').hidden = true;
        const sel = $('#tSubjectSelect'); sel.hidden = false;
        sel.innerHTML = subs.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
        $('#subjectHint').textContent = `🔒 Only: ${subs.join(', ')}.`;
      } else $('#subjectHint').textContent = 'Any subject allowed.';
      $('#loadBtn').addEventListener('click', safe(loadRoster));
      $('#allPresentBtn').addEventListener('click', () => { state.roster.forEach((s) => state.marks.set(s.id, 'present')); renderRoster(); });
      $('#submitBtn').addEventListener('click', safe(saveAttendance));
      $('#pickBtn').addEventListener('click', pickRandom);
      $('#openSM').addEventListener('click', safe(openSelfMark));
      $('#smCloseBtn').addEventListener('click', safe(closeSelfMark));
      $('#micBtn').addEventListener('click', toggleVoice);
    },
  },
  marks: {
    html: () => `
      <div class="card"><h2>📝 Marks Entry (MST / Quiz / Assignment)</h2>
        <div class="filter-grid">
          <label>${t('program')}<select class="input" id="mkProgram">${Object.keys(PROGRAMS).map((p)=>`<option>${p}</option>`).join('')}</select></label>
          <label>${t('branch')}<select class="input" id="mkBranch"></select></label>
          <label>${t('semester')}<select class="input" id="mkSem"></select></label>
          <label>${t('section')}<select class="input" id="mkSec"><option value="">All</option>${secOptions()}</select></label>
          <label>${t('subject')}<input class="input" id="mkSubject" placeholder="e.g. DBMS" /></label>
          <label>Exam<input class="input" id="mkExam" placeholder="e.g. MST-1" /></label>
          <label>Max<input class="input" type="number" id="mkMax" value="30" min="1" /></label>
          <button class="btn btn-primary" id="mkLoad">${t('load')} →</button></div>
        <p class="muted small" style="margin-top:10px;">💡 Pro flow: Load karo → <strong>⬇️ Template</strong> (rollNo prefilled) → Excel me sirf score bharo → 📥 Import → 💾 Save.</p></div>
      <div class="card" id="mkCard" hidden><h2 id="mkTitle">Scores</h2>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px;">
          <button class="btn btn-ghost btn-sm" id="mkTemplate">⬇️ Template (rollNo prefilled)</button>
          <input type="file" id="mkFile" class="input" style="max-width:260px;" accept=".xlsx,.xls,.csv" />
          <button class="btn btn-ghost btn-sm" id="mkImport">📥 Import scores from file</button></div>
        <div id="mkList" class="student-list"></div>
        <button class="btn btn-primary" id="mkSave" style="margin-top:14px;">💾 ${t('save')} Marks</button></div>`,
    init: () => {
      const picker = wireProgramPicker($('#mkProgram'), $('#mkBranch'), $('#mkSem'), '');
      picker.set(state.user.program || 'B.Tech', state.user.branch || 'CSE', 1);
      $('#mkLoad').addEventListener('click', safe(loadMarksRoster));
      $('#mkSave').addEventListener('click', safe(saveMarks));
      $('#mkTemplate').addEventListener('click', downloadMarksTemplate);
      $('#mkImport').addEventListener('click', safe(importMarksFile));
    },
  },
  timetable: {
    html: () => `<div class="card"><h2>🗓️ My Weekly Schedule</h2><div id="ttView"><p class="muted">Loading…</p></div></div>`,
    init: () => loadTimetableView(),
  },
  sessions: {
    html: () => `<div class="card"><div class="card-head"><h2>🗂️ My Sessions</h2>
      <button class="btn btn-ghost btn-sm" id="exportBtn">📊 Excel</button></div>
      <div class="table-wrap"><table>
      <thead><tr><th>Date</th><th>Class</th><th>Subject</th><th>Note</th><th>P/L/T</th><th>%</th></tr></thead>
      <tbody id="sessionsBody"></tbody></table></div></div>`,
    init: () => {
      $('#exportBtn').addEventListener('click', () => downloadFile('/api/me/sessions/export', `my-sessions-${todayISO()}.csv`));
      return loadSessions();
    },
  },
},

student: {
  attendance: {
    html: () => `
      <div class="student-grid">
        <div>
          <div class="card ring-card">
            <h2>${t('attendance')}</h2>
            <div class="ring-wrap">
              <svg viewBox="0 0 120 120" class="ring">
                <circle class="ring-bg" cx="60" cy="60" r="52" pathLength="100"></circle>
                <circle class="ring-fg" id="ringFg" cx="60" cy="60" r="52" pathLength="100"></circle></svg>
              <div class="ring-center"><span id="ringPct">—</span><small>attendance</small></div></div>
            <div id="eligPill"></div>
            <p class="muted small center" id="ringMsg"></p>
            <p class="center" id="streakLine" style="font-weight:700;margin-top:6px;"></p>
            <div class="ring-stats">
              <div><strong id="statPresent">0</strong><span>${t('present')}</span></div>
              <div><strong id="statLate">0</strong><span>${t('late')}</span></div>
              <div><strong id="statAbsent">0</strong><span>${t('absent')}</span></div>
              <div><strong id="statTotal">0</strong><span>Classes</span></div></div>
            <button class="btn btn-ghost btn-sm" id="certBtn" style="margin-top:12px;">🧾 Attendance Certificate</button></div>
          <div class="card"><h2>🏅 Badges</h2><div id="badgeList" class="badges"></div></div>
          <div class="card"><h2>🧠 Pattern Detection</h2><div id="patternBox" class="muted small">Loading…</div></div>
          <div class="card"><h2>📝 My Marks</h2><div id="myMarks" class="muted small">Loading…</div></div>
          <div class="card"><h2>🧮 What-if</h2><div id="whatifBody" class="muted small">No data yet.</div></div>
        </div>
        <div>
          <div class="charts">
            <div class="card" style="margin:0;"><h2>Split</h2><div class="chart-box"><canvas id="pieChart"></canvas></div></div>
            <div class="card" style="margin:0;"><h2>📈 Trend</h2><div class="chart-box"><canvas id="trendChart"></canvas></div></div></div>
          <div class="card"><h2>📚 Subject-wise</h2><div id="subjectList" class="subject-list"></div></div>
          <div class="card"><h2>🗓️ Last 10 Weeks</h2><div id="heat" class="heat"></div></div>
          <div class="card"><h2>🏆 Leaderboard</h2><div id="lbList" class="muted small">Loading…</div></div></div></div>
      <div class="card"><div class="card-head"><h2>Recent Log</h2><span class="muted small">Absent pe "⚠️ Fix" — admin approve karega</span></div>
        <div class="table-wrap"><table>
        <thead><tr><th>Date</th><th>Subject</th><th>Status</th><th></th></tr></thead>
        <tbody id="logBody"></tbody></table></div></div>`,
    init: () => { loadStudentAll(); $('#certBtn').addEventListener('click', safe(makeCertificate)); },
  },
  selfmark: {
    html: () => `
      <div class="card center" style="max-width:540px;margin:0 auto;">
        <h2>📲 Self Mark Attendance</h2>
        <p class="muted small">QR scan karne se Session auto-fill hota hai. 6-digit <strong>rotating code</strong> teacher ki screen se lo — har 30 sec badalta hai!</p>
        <input class="input" id="smSessionInput" placeholder="Session ID (QR se auto)" style="margin-bottom:10px;" />
        <input class="input big-code-input" id="smCodeInput" maxlength="6" inputmode="numeric" placeholder="______" style="margin-bottom:12px;" />
        <div style="margin-bottom:12px;">
          <label style="display:inline-flex;gap:8px;align-items:center;font-size:.85rem;font-weight:600;">
            <input type="checkbox" id="smSelfie" /> 🤳 Selfie / Face proof</label></div>
        <video id="smVideo" class="selfie-video" autoplay playsinline muted hidden style="margin:0 auto 12px;"></video>
        <div id="faceStatus" class="muted small" style="margin-bottom:10px;"></div>
        <button class="btn btn-primary btn-block" id="smGo">✅ Mark Me Present</button>
        <div style="margin-top:14px;border-top:1px dashed var(--border-strong);padding-top:12px;">
          <button class="btn btn-ghost btn-sm" id="faceRegBtn">🧠 Register My Face (one-time)</button>
          <p class="muted small" style="margin-top:6px;">Face register karne ke baad selfie match zaroori hogi — proxy impossible!</p></div>
        <p class="muted small" id="smStatus" style="margin-top:10px;"></p></div>`,
    init: () => {
      $('#smGo').addEventListener('click', safe(doSelfMark));
      $('#faceRegBtn').addEventListener('click', safe(registerFace));
      $('#faceStatus').textContent = state.user.hasFace ? '🧠 Face registered ✓ (verification active)' : 'Face registered nahi hai — selfie-only mode.';
      $('#smSelfie').addEventListener('change', async (e) => {
        const v = $('#smVideo');
        if (e.target.checked) {
          try { v.hidden = false; state.smStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode:'user' } }); v.srcObject = state.smStream; }
          catch { toast('Camera nahi khula.', 'error'); e.target.checked = false; v.hidden = true; }
        } else { v.hidden = true; stopSMStream(); }
      });
    },
  },
  leave: {
    html: () => `<div class="card" style="max-width:560px;"><h2>📝 New Leave</h2>
      <form id="leaveForm" style="display:grid;gap:12px;">
        <label style="display:grid;gap:6px;font-size:.8rem;font-weight:600;">${t('date')}<input class="input" type="date" id="lvDate" required /></label>
        <label style="display:grid;gap:6px;font-size:.8rem;font-weight:600;">Type
          <select class="input" id="lvType"><option value="casual">Casual</option><option value="medical">🩺 Medical</option><option value="duty">🎯 Duty</option></select></label>
        <label style="display:grid;gap:6px;font-size:.8rem;font-weight:600;">Reason
          <textarea class="input" id="lvReason" rows="3"></textarea></label>
        <button class="btn btn-primary" style="justify-self:start;">Submit →</button></form></div>
      <div class="card"><h2>My Applications</h2><div id="myLeaves" class="muted small">Loading…</div></div>`,
    init: () => {
      $('#leaveForm').addEventListener('submit', safe(async (e) => {
        e.preventDefault();
        const r = await api('/api/leaves', { method:'POST', body: JSON.stringify({ date: $('#lvDate').value, type: $('#lvType').value, reason: $('#lvReason').value }) });
        toast(r.message); loadMyLeaves();
      }));
      return loadMyLeaves();
    },
  },
  timetable: {
    html: () => `<div class="card"><h2>🗓️ Weekly Schedule</h2><div id="ttView"><p class="muted">Loading…</p></div></div>`,
    init: () => loadTimetableView(),
  },
},

parent: {
  child: {
    html: () => `
      <div class="card center" style="max-width:420px;">
        <h2 id="pcName">—</h2>
        <p class="muted small" id="pcClass"></p>
        <div class="ring-wrap"><svg viewBox="0 0 120 120" class="ring">
          <circle class="ring-bg" cx="60" cy="60" r="52" pathLength="100"></circle>
          <circle class="ring-fg" id="ringFg" cx="60" cy="60" r="52" pathLength="100"></circle></svg>
          <div class="ring-center"><span id="ringPct">—</span><small>attendance</small></div></div>
        <div id="pcElig"></div>
        <p class="muted small" id="pcMsg"></p>
        <div class="ring-stats">
          <div><strong id="statPresent">0</strong><span>Present</span></div>
          <div><strong id="statLate">0</strong><span>Late</span></div>
          <div><strong id="statAbsent">0</strong><span>Absent</span></div>
          <div><strong id="statTotal">0</strong><span>Classes</span></div></div></div>
      <div class="card"><h2>📚 Subject-wise</h2><div id="pcSubjects" class="subject-list"></div></div>
      <div class="card"><h2>📝 Leaves</h2><div id="pcLeaves" class="muted small">Loading…</div></div>
      <div class="card"><h2>Recent Log</h2><div class="table-wrap"><table>
        <thead><tr><th>Date</th><th>Subject</th><th>Status</th></tr></thead>
        <tbody id="pcLog"></tbody></table></div></div>`,
    init: () => loadParentChild(),
  },
},
};

/* ================= admin actions ================= */
let studentCache = [], teacherCache = [];
async function addStudent(e) {
  e.preventDefault();
  await api('/api/users', { method:'POST', body: JSON.stringify({
    role:'student', name: $('#stName').value.trim(), rollNo: $('#stRoll').value.trim(),
    program: $('#stProgram').value, branch: $('#stBranch').value, semester: $('#stSem').value,
    section: $('#stSec').value, email: $('#stEmail').value.trim(), cardId: $('#stCard').value.trim(),
    username: $('#stUsername').value.trim(), password: $('#stPassword').value }) });
  toast('Student added ✅'); e.target.reset(); refresh();
}
async function addTeacher(e) {
  e.preventDefault();
  await api('/api/users', { method:'POST', body: JSON.stringify({
    role:'teacher', name: $('#tcName').value.trim(), program: $('#tcProgram').value, branch: $('#tcBranch').value,
    email: $('#tcEmail').value.trim(), subjects: $('#tcSubjects').value.split(',').map((s)=>s.trim()).filter(Boolean),
    username: $('#tcUsername').value.trim(), password: $('#tcPassword').value }) });
  toast('Teacher added ✅'); e.target.reset(); refresh();
}
/* ---- Excel import: students (mixed role allowed via optional role column) ---- */
async function bulkImportStudents() {
  const f = $('#bulkFile').files[0];
  if (!f) return toast('Pehle file choose karo (Excel ya CSV).', 'error');
  let raw;
  try { raw = await parseExcelOrCSV(f); }
  catch (e) { return toast('File read fail: ' + e.message, 'error'); }
  const students = raw
    .map((o) => ({ role: o.role || 'student', name: o.name || '', rollNo: o.rollno || o.roll || '', program: o.program || '', branch: o.branch || '', semester: o.semester || '', section: o.section || '', email: o.email || '', username: o.username || o.user || '', password: o.password || o.pass || '', subjects: o.subjects || '' }))
    .filter((s) => s.name || s.username || s.password || s.rollNo);
  if (!students.length) return toast('File me koi valid row nahi mili (sirf khaali rows hain).', 'error');
  const tCount = students.filter((s) => s.role.toLowerCase() === 'teacher').length;
  if (!confirm(`${students.length} rows import (${students.length - tCount} students${tCount ? ` + ${tCount} teachers` : ''}). Continue?`)) return;
  const res = await api('/api/users/bulk', { method:'POST', body: JSON.stringify({ students }) });
  $('#bulkResult').innerHTML = `<strong>${esc(res.message)}</strong>` + (res.errors.length ? `<br/>Errors:<br/>${res.errors.map(esc).join('<br/>')}` : '');
  toast(res.message, res.added ? 'success' : 'error');
  loadAdminStudents();
}
/* ---- Excel import: teachers (dedicated) ---- */
async function bulkImportTeachers() {
  const f = $('#tBulkFile').files[0];
  if (!f) return toast('Pehle file choose karo (Excel ya CSV).', 'error');
  let raw;
  try { raw = await parseExcelOrCSV(f); }
  catch (e) { return toast('File read fail: ' + e.message, 'error'); }
  const teachers = raw
    .map((o) => ({ role: 'teacher', name: o.name || '', program: o.program || '', branch: o.branch || '', email: o.email || '', username: o.username || o.user || '', password: o.password || o.pass || '', subjects: o.subjects || '' }))
    .filter((s) => s.name || s.username || s.password);
  if (!teachers.length) return toast('File me koi valid teacher row nahi mili.', 'error');
  if (!confirm(`${teachers.length} teachers import karna hai. Continue?`)) return;
  const res = await api('/api/users/bulk', { method:'POST', body: JSON.stringify({ students: teachers }) });
  $('#tBulkResult').innerHTML = `<strong>${esc(res.message)}</strong>` + (res.errors.length ? `<br/>Errors:<br/>${res.errors.map(esc).join('<br/>')}` : '');
  toast(res.message, res.added ? 'success' : 'error');
  loadAdminTeachers();
}
/* ---- Templates ---- */
function downloadStudentTemplate() {
  if (!window.XLSX) return toast('Excel library load nahi hui (CDN).', 'error');
  const sample = [
    { role: 'student', name: 'Riya Sharma', rollNo: '2301641520001', program: 'B.Tech', branch: 'CSE', semester: '3', section: 'A', email: 'riya@student.glbitm.ac.in', username: 'riya', password: 'pass123', subjects: '' },
    { role: 'student', name: 'Aman Gupta', rollNo: '2301641520002', program: 'B.Tech', branch: 'CSE (Artificial Intelligence)', semester: '5', section: 'B', email: 'aman@student.glbitm.ac.in', username: 'aman', password: 'pass456', subjects: '' },
    { role: 'teacher', name: 'Prof. Rajesh Kumar', rollNo: '', program: 'B.Tech', branch: 'CSE', semester: '', section: '', email: 'rajesh@glbitm.ac.in', username: 'rajesh', password: 'teach123', subjects: 'Data Structures, DBMS' },
  ];
  const ws = XLSX.utils.json_to_sheet(sample);
  ws['!cols'] = [{wch:10},{wch:22},{wch:16},{wch:10},{wch:42},{wch:10},{wch:10},{wch:34},{wch:14},{wch:12},{wch:30}];
  const help = XLSX.utils.aoa_to_sheet([
    ['GLBITM Bulk Import — Instructions'], [],
    ['ROLE column: "student" ya "teacher" (khaali = student).'],
    ['STUDENT rows ke liye zaroori: name, username, password, program, branch, semester'],
    ['TEACHER rows ke liye zaroori: name, username, password (baaki optional)'],
    ['subjects column (teachers): comma-separated, e.g. Data Structures, DBMS'],
    [],
    ['program values (EXACT):', ...Object.keys(PROGRAMS)],
    [],
    ['branch values (program ke hisaab se EXACT):'],
    ...Object.entries(PROGRAMS).flatMap(([p, v]) => v.branches.map((b) => [`${p}  →  ${b}`])),
    [],
    ['semester ranges: B.Tech 1-8 · BCA/BBA/PGDM 1-6 · MCA/MBA/M.Tech 1-4'],
    ['section: admin-set sections (default A, B, C). Optional.'],
    ['username UNIQUE hona chahiye. password min 4 chars.'],
  ]);
  makeWorkbook([['Data', ws, null], ['Instructions', help, [{ wch: 70 }, { wch: 30 }]]], 'GLBITM-user-import-template.xlsx');
  toast('Template downloaded — Instructions sheet padhna!');
}
function downloadTeacherTemplate() {
  if (!window.XLSX) return toast('Excel library load nahi hui (CDN).', 'error');
  const sample = [
    { name: 'Prof. Rajesh Kumar', username: 'rajesh', password: 'teach123', program: 'B.Tech', branch: 'CSE', email: 'rajesh@glbitm.ac.in', subjects: 'Data Structures, DBMS' },
    { name: 'Prof. Sunita Jain', username: 'sunita', password: 'teach123', program: 'B.Tech', branch: 'Electronics and Communication Engineering', email: 'sunita@glbitm.ac.in', subjects: 'Digital Electronics' },
  ];
  const ws = XLSX.utils.json_to_sheet(sample);
  ws['!cols'] = [{wch:24},{wch:14},{wch:12},{wch:10},{wch:42},{wch:30},{wch:32}];
  const help = XLSX.utils.aoa_to_sheet([
    ['Teacher Bulk Import — Instructions'], [],
    ['Zaroori columns: name, username, password'],
    ['Optional: program, branch, email, subjects'],
    ['subjects: comma-separated (Excel me pura value ek hi cell me rakho)'],
    ['username UNIQUE hona chahiye — duplicate skip honge'],
  ]);
  makeWorkbook([['Teachers', ws, null], ['Instructions', help, [{ wch: 70 }, { wch: 30 }]]], 'GLBITM-teacher-import-template.xlsx');
  toast('Teacher template downloaded!');
}
async function removeUser(id) {
  if (!confirm('Remove permanently?')) return;
  await api(`/api/users/${id}`, { method:'DELETE' }); toast('Removed.'); refresh();
}
async function editStudent(id) {
  const u = studentCache.find((x) => x.id === id); if (!u) return;
  const name = prompt('Name:', u.name); if (name === null) return;
  const roll = prompt('Roll no:', u.rollNo); if (roll === null) return;
  const sem = prompt(`Semester (1–${(PROGRAMS[u.program]||{}).sems||8}):`, u.semester); if (sem === null) return;
  const sec = prompt(`Section (${(state.sections||[]).join('/')} ya blank):`, u.section); if (sec === null) return;
  const email = prompt('Email:', u.email); if (email === null) return;
  const card = prompt('RFID Card ID:', u.cardId); if (card === null) return;
  await api(`/api/users/${id}`, { method:'PATCH', body: JSON.stringify({ name, rollNo: roll, semester: sem, section: sec, email, cardId: card }) });
  toast('Updated ✏️'); loadAdminStudents();
}
async function editTeacher(id) {
  const u = teacherCache.find((x) => x.id === id); if (!u) return;
  const name = prompt('Name:', u.name); if (name === null) return;
  const subjects = prompt('Subjects (blank = any):', (u.subjects || []).join(', ')); if (subjects === null) return;
  await api(`/api/users/${id}`, { method:'PATCH', body: JSON.stringify({ name, subjects: subjects.split(',').map((s)=>s.trim()).filter(Boolean) }) });
  toast('Updated ✏️'); loadAdminTeachers();
}
async function resetPassword(id) {
  const u = [...studentCache, ...teacherCache].find((x) => x.id === id); if (!u) return;
  const pw = prompt(`New password for ${u.name}:`); if (pw === null) return;
  await api(`/api/users/${id}`, { method:'PATCH', body: JSON.stringify({ password: pw }) });
  toast('Password reset ✅');
}
async function createParent(id) {
  const u = studentCache.find((x) => x.id === id); if (!u) return;
  const un = prompt(`Parent username for ${u.name}:`); if (!un) return;
  const pw = prompt('Parent password (min 4):'); if (!pw) return;
  try {
    await api('/api/users', { method:'POST', body: JSON.stringify({ role:'parent', username: un, password: pw, parentOf: id }) });
    toast('👨‍👩‍👧 Parent account created! Login share karo.');
  } catch (e) { toast(e.message, 'error'); }
}
async function loadAdminStudents() {
  const { users } = await api('/api/users?role=student');
  studentCache = users;
  $('#studentsBody').innerHTML = users.length ? users.map((u) => `
    <tr><td>${esc(u.rollNo || '—')}</td><td>${esc(u.name)}${u.hasFace ? ' <span class="pill pill-good" style="font-size:.6rem">🧠 face</span>' : ''}</td><td>${esc(u.username)}</td>
    <td>${esc(classLabel(u))}</td><td>${u.semester ?? '—'}${u.section ? ' / ' + esc(u.section) : ''}</td>
    <td class="table-actions">
      <button class="btn btn-ghost btn-sm" data-idcard="${u.id}">🪪</button>
      <button class="btn btn-ghost btn-sm" data-parent="${u.id}" title="Create parent login">👨‍👩‍👧</button>
      <button class="btn btn-ghost btn-sm" data-edit="${u.id}">✏️</button>
      <button class="btn btn-ghost btn-sm" data-pw="${u.id}">🔑</button>
      <button class="btn btn-danger btn-sm" data-del="${u.id}">✕</button></td></tr>`).join('')
    : '<tr><td colspan="6" class="empty">No students.</td></tr>';
  $('#studentsBody').querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => removeUser(b.dataset.del)));
  $('#studentsBody').querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => editStudent(b.dataset.edit)));
  $('#studentsBody').querySelectorAll('[data-pw]').forEach((b) => b.addEventListener('click', () => resetPassword(b.dataset.pw)));
  $('#studentsBody').querySelectorAll('[data-idcard]').forEach((b) => b.addEventListener('click', () => showIDCard(b.dataset.idcard)));
  $('#studentsBody').querySelectorAll('[data-parent]').forEach((b) => b.addEventListener('click', () => createParent(b.dataset.parent)));
  wireSearch('#stSearch', '#studentsBody');
}
async function loadAdminTeachers() {
  const { users } = await api('/api/users?role=teacher');
  teacherCache = users;
  $('#teachersBody').innerHTML = users.length ? users.map((u) => {
    const pills = (u.subjects || []).map((s) => `<span class="pill pill-soft">${esc(s)}</span>`).join(' ');
    return `<tr><td>${esc(u.name)}${!u.email ? ' <span class="risk-flag">no email</span>' : ''}</td><td>${esc(u.username)}</td>
      <td>${esc(u.program)}${u.branch && u.branch !== 'General' ? ' · ' + esc(u.branch) : ''}</td>
      <td>${pills ? `<div class="subject-pills">${pills}</div>` : '<span class="muted small">Any</span>'}</td>
      <td class="table-actions">
        <button class="btn btn-ghost btn-sm" data-edit="${u.id}">✏️</button>
        <button class="btn btn-ghost btn-sm" data-pw="${u.id}">🔑</button>
        <button class="btn btn-danger btn-sm" data-del="${u.id}">✕</button></td></tr>`;
  }).join('') : '<tr><td colspan="5" class="empty">No teachers.</td></tr>';
  $('#teachersBody').querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => removeUser(b.dataset.del)));
  $('#teachersBody').querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => editTeacher(b.dataset.edit)));
  $('#teachersBody').querySelectorAll('[data-pw]').forEach((b) => b.addEventListener('click', () => resetPassword(b.dataset.pw)));
  wireSearch('#tcSearch', '#teachersBody');
}
function recentRate(stats) {
  const recent = stats.logs.slice(0, 10);
  if (!recent.length) return null;
  return recent.filter((l) => l.status !== 'absent').length / recent.length;
}
async function loadDefaulters() {
  const { report } = await api('/api/reports/overall');
  const th = state.settings.threshold;
  const bad = report.filter((r) => r.total > 0 && r.percentage < th).sort((a, b) => a.percentage - b.percentage);
  $('#defList').innerHTML = bad.length
    ? bad.map((r) => {
        const rr = recentRate(r);
        const proj = rr !== null ? Math.round(((r.attended + rr * 10) / (r.total + 10)) * 100) : null;
        const risk = proj !== null && proj < th ? '<span class="risk-flag">📉 risk</span>' : '';
        return `<div class="def-row"><span><strong>${esc(r.name)}</strong>${risk} <span class="muted small">${esc(r.rollNo || '')} · ${esc(classLabel(r))} · Sem ${r.semester}</span></span><span class="pill pill-${pctClass(r.percentage)}">${r.percentage}%</span></div>`;
      }).join('')
    : `<p class="muted">✅ Sab safe (${th}%+).</p>`;
}
async function restoreBackup() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.json';
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    if (!confirm('⚠️ Database REPLACE hoga?')) return;
    try { const r = await api('/api/admin/restore', { method:'POST', body: await f.text() }); toast(r.message); clearSession(); location.reload(); }
    catch (e) { toast(e.message, 'error'); }
  };
  inp.click();
}
async function loadHolidays() {
  const { items } = await api('/api/holidays');
  $('#holList').innerHTML = items.length ? items.map((h) => `
    <span class="pill pill-warn" style="margin:2px;">${h.date} · ${esc(h.title)}
      <button class="btn btn-danger btn-sm" data-hol="${h.date}" style="padding:1px 7px;margin-left:4px;">✕</button></span>`).join(' ')
    : 'Koi holidays nahi.';
  $('#holList').querySelectorAll('[data-hol]').forEach((b) => b.addEventListener('click', safe(async () => {
    await api(`/api/holidays/${b.dataset.hol}`, { method:'DELETE' }); toast('Removed.'); loadHolidays();
  })));
}
async function loadAdminTimetable() {
  const { items } = await api(`/api/timetable?program=${encodeURIComponent($('#vtProgram').value)}&branch=${encodeURIComponent($('#vtBranch').value)}&semester=${$('#vtSem').value}&section=${encodeURIComponent($('#vtSec').value)}`);
  $('#ttAdminView').innerHTML = renderTT(items, { admin: true });
  $('#ttAdminView').querySelectorAll('[data-ttdel]').forEach((b) => b.addEventListener('click', safe(async () => {
    await api(`/api/timetable/${b.dataset.ttdel}`, { method:'DELETE' }); loadAdminTimetable();
  })));
  $('#ttAdminView').querySelectorAll('[data-ttsub]').forEach((b) => b.addEventListener('click', safe(async () => {
    const { users } = await api('/api/users?role=teacher');
    const name = prompt('Substitute teacher (exact name):\n' + users.map((u) => u.name).join(', '));
    if (!name) return;
    const t2 = users.find((u) => u.name.toLowerCase() === name.toLowerCase());
    if (!t2) return toast('Teacher not found.', 'error');
    const r = await api(`/api/timetable/${b.dataset.ttsub}`, { method:'PATCH', body: JSON.stringify({ teacherId: t2.id }) });
    toast(r.message); loadAdminTimetable();
  })));
}
function renderTT(items, opts = {}) {
  if (!items.length) return '<p class="muted small">Koi slots nahi.</p>';
  const today = DAYS_SHORT[new Date().getDay()];
  const holidays = opts.holidays || [];
  if (holidays.includes(todayISO())) return `<div class="holiday-banner">🏛️ Aaj Holiday hai — ${esc(holidayTitle(todayISO()))}. Classes nahi.</div>` + DAYS.map((day) => {
    const di = items.filter((i) => i.day === day); if (!di.length) return '';
    return `<div class="tt-day">${day}</div>` + di.map((i) => `<div class="tt-row"><span class="tt-per">P${i.period}</span><strong style="flex:1;">${esc(i.subject)}</strong><span class="muted small">${esc(i.teacherName || 'TBA')}</span></div>`).join('');
  }).join('');
  return DAYS.map((day) => {
    const di = items.filter((i) => i.day === day); if (!di.length) return '';
    const isToday = today === day;
    return `<div class="tt-day">${day}${isToday ? ' · <span style="color:var(--primary)">TODAY</span>' : ''}</div>` +
      di.map((i) => `<div class="tt-row ${isToday ? 'today' : ''}">
        <span class="tt-per">P${i.period}</span>
        <strong style="flex:1;">${esc(i.subject)}</strong>
        <span class="muted small">${esc(i.teacherName || 'TBA')}</span>
        ${opts.admin ? `<button class="btn btn-ghost btn-sm" data-ttsub="${i.id}" title="Substitution">🔄</button>
        <button class="btn btn-danger btn-sm" data-ttdel="${i.id}">✕</button>` : ''}</div>`).join('');
  }).join('');
}
let _holidayMap = {};
function holidayTitle(d) { return (_holidayMap[d] || 'Holiday'); }
async function loadTimetableView() {
  try {
    const [{ items }, { items: hols }] = await Promise.all([api('/api/timetable'), api('/api/holidays')]);
    _holidayMap = {}; hols.forEach((h) => { _holidayMap[h.date] = h.title; });
    $('#ttView').innerHTML = renderTT(items, { holidays: hols.map((h) => h.date) });
  } catch (e) { $('#ttView').innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
}
const rangeQ = () => { const p = new URLSearchParams(); if ($('#repFrom') && $('#repFrom').value) p.set('from', $('#repFrom').value); if ($('#repTo') && $('#repTo').value) p.set('to', $('#repTo').value); const s = p.toString(); return s ? '?' + s : ''; };
async function loadAdminReport() {
  const q = rangeQ();
  const { report } = await api('/api/reports/overall' + q);
  const th = state.settings.threshold;
  $('#repRangeNote').textContent = q ? `Filtered: ${$('#repFrom').value || 'start'} → ${$('#repTo').value || 'today'}` : 'Full data';
  $('#reportBody').innerHTML = report.length ? report.map((r) => `
    <tr><td>${esc(r.rollNo || '—')}</td><td>${esc(r.name)}</td><td>${esc(classLabel(r))} · S${r.semester}${r.section ? esc(r.section) : ''}</td>
    <td>${r.total}</td><td>${r.present}/${r.late}/${r.absent}</td>
    <td><span class="pill pill-${pctClass(r.percentage)}">${r.percentage}%</span></td></tr>`).join('')
    : '<tr><td colspan="6" class="empty">No data.</td></tr>';
  wireSearch('#repSearch', '#reportBody');
  killCharts();
  if (window.Chart) {
    const map = {};
    report.forEach((r) => { (map[r.program || '?'] = map[r.program || '?'] || []).push(r.percentage); });
    const progs = Object.keys(map);
    _charts.push(new Chart($('#branchChart'), { type:'bar',
      data: { labels: progs, datasets: [{ data: progs.map((b) => Math.round(map[b].reduce((a,v)=>a+v,0)/map[b].length)), backgroundColor: ['#1d4ed8','#0891b2','#7c3aed','#059669','#d97706','#dc2626','#0ea5e9'], borderRadius: 8 }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 100 } } } }));
    try {
      const { items } = await api('/api/reports/correlation' + q);
      if (items.length) {
        _charts.push(new Chart($('#corrChart'), { type:'scatter',
          data: { datasets: [{ label: 'Student', data: items.map((i) => ({ x: i.pct, y: i.marksPct })), backgroundColor: 'rgba(29,78,216,.6)' }] },
          options: { scales: { x: { title: { display: true, text: 'Attendance %' }, min: 0, max: 100 }, y: { title: { display: true, text: 'Avg Marks %' }, min: 0, max: 100 } } } }));
        const n = items.length;
        const mx = items.reduce((a,i)=>a+i.pct,0)/n, my = items.reduce((a,i)=>a+i.marksPct,0)/n;
        const num = items.reduce((a,i)=>a+(i.pct-mx)*(i.marksPct-my),0);
        const den = Math.sqrt(items.reduce((a,i)=>a+(i.pct-mx)**2,0) * items.reduce((a,i)=>a+(i.marksPct-my)**2,0)) || 1;
        const r2 = (num/den).toFixed(2);
        $('#corrNote').innerHTML = `Correlation coefficient: <strong>${r2}</strong> ${r2 > 0.5 ? '— attendance aur marks ka strong link! 📈' : r2 > 0.2 ? '— mild link.' : '— kam link (ya data kam hai).'}`;
      } else $('#corrNote').textContent = 'Marks data nahi — teacher se marks entry karwao.';
    } catch {}
  }
  try {
    const { items } = await api('/api/reports/subjects');
    const sorted = [...items].sort((a, b) => a.pct - b.pct);
    $('#subjStats').innerHTML = sorted.map((s) => `
      <div class="subject-item" style="margin-bottom:12px;">
        <div class="subject-head"><strong>${esc(s.subject)}</strong>
        <span class="pill pill-${pctClass(s.pct)}">${s.pct}%</span></div>
        <div class="bar"><div class="bar-fill ${pctClass(s.pct)}" style="width:${s.pct}%"></div></div>
        <span class="muted small">${s.sessions} sessions · ${s.total} entries</span></div>`).join('') || 'No data.';
  } catch {}
  try {
    const { items } = await api('/api/reports/workload');
    $('#workBody').innerHTML = items.map((w) => `
      <tr><td><strong>${esc(w.name)}</strong> <span class="muted small">@${esc(w.username)}</span></td>
      <td>${w.sessions}</td><td>${w.marked}</td>
      <td>${w.avg != null ? `<span class="pill pill-${pctClass(w.avg)}">${w.avg}%</span>` : '—'}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">No teachers.</td></tr>';
  } catch {}
}
async function loadRegister() {
  const subject = $('#rgSubject').value.trim();
  if (!subject) return toast('Subject daalo.', 'error');
  const { dates, rows, month } = await api(`/api/register?program=${encodeURIComponent($('#rgProgram').value)}&branch=${encodeURIComponent($('#rgBranch').value)}&semester=${$('#rgSem').value}&section=${encodeURIComponent($('#rgSec').value)}&subject=${encodeURIComponent(subject)}&month=${$('#rgMonth').value}`);
  if (!dates.length) { $('#regView').innerHTML = '<p class="muted small">Is month me is subject ke sessions nahi.</p>'; return; }
  $('#regView').innerHTML = `
    <p class="muted small">${esc(subject)} · ${month} · ${dates.length} sessions · ${rows.length} students</p>
    <div class="table-wrap"><table class="reg-table">
      <thead><tr><th>Roll</th><th>Name</th>${dates.map((d) => `<th title="${d}">${d.slice(8)}</th>`).join('')}<th>P</th><th>L</th><th>A</th><th>%</th></tr></thead>
      <tbody>${rows.map((r) => `<tr>
        <td>${esc(r.rollNo || '—')}</td><td style="text-align:left;">${esc(r.name)}</td>
        ${r.cells.map((c) => `<td><span class="pill ${cellCls(c)}" style="padding:1px 7px;font-size:.62rem;">${c ? abbr(c) : '·'}</span></td>`).join('')}
        <td>${r.P}</td><td>${r.L}</td><td>${r.A}</td>
        <td>${r.pct != null ? `<span class="pill pill-${pctClass(r.pct)}">${r.pct}%</span>` : '—'}</td></tr>`).join('')}</tbody></table></div>
    <button class="btn btn-ghost btn-sm" id="regPrint" style="margin-top:12px;">🖨️ Print Register</button>`;
  $('#regPrint').addEventListener('click', () => {
    const w = window.open('', '_blank', 'width=1000,height=700');
    w.document.write(`<html><head><title>Register ${esc(subject)} ${month}</title><style>
      body{font-family:Arial;padding:20px}h2{text-align:center}
      table{border-collapse:collapse;width:100%;font-size:11px}
      th,td{border:1px solid #333;padding:4px 6px;text-align:center}
      td:nth-child(2){text-align:left}</style></head><body>
      <h2>GL Bajaj Institute of Technology & Management</h2>
      <h3>${esc(subject)} — ${month} (${dates.length} sessions)</h3>
      ${$('#regView').querySelector('table').outerHTML}</body></html>`);
    w.document.close(); setTimeout(() => w.print(), 400);
  });
}
async function loadLeaveAdmin() {
  const { items } = await api('/api/leaves');
  $('#leaveAdminList').innerHTML = items.length ? items.map((l) => `
    <div class="tt-row"><strong style="flex:1;">${esc(l.studentName || '')} <span class="muted small">${esc(l.rollNo || '')}</span></strong>
      <span class="pill pill-soft">${esc(l.type)}</span><span class="muted small">${l.date}</span>
      <span class="muted small" style="max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(l.reason || '')}</span>
      ${l.status === 'pending'
        ? `<button class="btn btn-primary btn-sm" data-lvok="${l.id}">✓</button><button class="btn btn-danger btn-sm" data-lvno="${l.id}">✕</button>`
        : `<span class="pill ${l.status === 'approved' ? 'pill-good' : 'pill-bad'}">${l.status}</span>`}</div>`).join('')
    : '<p class="muted small">Koi applications nahi.</p>';
  $('#leaveAdminList').querySelectorAll('[data-lvok]').forEach((b) => b.addEventListener('click', () => decideLeave(b.dataset.lvok, 'approved')));
  $('#leaveAdminList').querySelectorAll('[data-lvno]').forEach((b) => b.addEventListener('click', () => decideLeave(b.dataset.lvno, 'rejected')));
}
async function decideLeave(id, decision) { toast((await api(`/api/leaves/${id}/decide`, { method:'POST', body: JSON.stringify({ decision }) })).message); loadLeaveAdmin(); }
async function loadFixAdmin() {
  const { items } = await api('/api/corrections');
  $('#fixAdminList').innerHTML = items.length ? items.map((c) => `
    <div class="tt-row"><strong style="flex:1;">${esc(c.studentName || '')}</strong>
      <span class="muted small">${c.date} · ${esc(c.subject)}</span>
      <span class="pill pill-warn">${esc(c.current)} → ${esc(c.requested)}</span>
      <span class="muted small" style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(c.reason || '')}</span>
      ${c.status === 'pending'
        ? `<button class="btn btn-primary btn-sm" data-fxok="${c.id}">✓ Fix</button><button class="btn btn-danger btn-sm" data-fxno="${c.id}">✕</button>`
        : `<span class="pill ${c.status === 'approved' ? 'pill-good' : 'pill-bad'}">${c.status}</span>`}</div>`).join('')
    : '<p class="muted small">Koi requests nahi.</p>';
  $('#fixAdminList').querySelectorAll('[data-fxok]').forEach((b) => b.addEventListener('click', () => decideFix(b.dataset.fxok, 'approved')));
  $('#fixAdminList').querySelectorAll('[data-fxno]').forEach((b) => b.addEventListener('click', () => decideFix(b.dataset.fxno, 'rejected')));
}
async function decideFix(id, decision) { toast((await api(`/api/corrections/${id}/decide`, { method:'POST', body: JSON.stringify({ decision }) })).message); loadFixAdmin(); }
async function loadAnnList() {
  const { items } = await api('/api/announcements');
  $('#annList').innerHTML = items.length ? items.map((a) => `
    <div class="ann-item" style="display:flex;justify-content:space-between;gap:10px;align-items:center;">
      <span><strong>📢 ${esc(a.title)}</strong> <span class="muted small">— ${esc(a.body)} · ${a.ts.slice(0,10)}</span></span>
      <button class="btn btn-danger btn-sm" data-adel="${a.id}">Delete</button></div>`).join('')
    : '<p class="muted small">None yet.</p>';
  $('#annList').querySelectorAll('[data-adel]').forEach((b) => b.addEventListener('click', safe(async () => {
    await api(`/api/announcements/${b.dataset.adel}`, { method:'DELETE' }); loadAnnList(); renderAnnouncements();
  })));
}
const AUDIT_STYLE = {
  LOGIN_OK:['pill-good','🔓 Login'], LOGIN_FAIL:['pill-bad','⛔ Failed'], LOCKED:['pill-bad','🔒 Locked'],
  OTP_SENT:['pill-soft','✉️ OTP'], LOGOUT:['pill-soft','🚪 Logout'], USER_ADD:['pill-good','＋ User'],
  USER_DEL:['pill-bad','🗑 Removed'], USER_EDIT:['pill-warn','✏️ Edited'], USER_BULK:['pill-good','📥 Bulk'],
  ATT_SAVE:['pill-soft','✅ Attendance'], ATT_EDIT_LATE:['pill-warn','⏰ Late edit'], SELFMARK:['pill-good','📲 Self'],
  SM_OPEN:['pill-soft','📲 Open'], PROXY_FLAG:['pill-bad','🚨 Proxy'], FACE_OK:['pill-good','🧠 Face ok'],
  FACE_FAIL:['pill-bad','🧠 Face FAIL'], FACE_REG:['pill-good','🧠 Face reg'], FACE_DEL:['pill-warn','🧠 Face del'],
  PROMOTE:['pill-good','🎓 Promote'], TT_ADD:['pill-soft','🗓️ Slot'], TT_DEL:['pill-warn','🗑 Slot del'],
  TT_SUB:['pill-warn','🔄 Substitute'], LEAVE_NEW:['pill-soft','📝 Leave'], LEAVE_OK:['pill-good','✓ Leave'],
  LEAVE_NO:['pill-bad','✕ Leave'], FIX_REQ:['pill-soft','⚠️ Fix req'], FIX_OK:['pill-good','✓ Fixed'],
  FIX_NO:['pill-bad','✕ Fix no'], ANN_ADD:['pill-good','📢 Notice'], MARKS:['pill-soft','📝 Marks'],
  BACKUP:['pill-soft','💾 Backup'], RESTORE:['pill-warn','📤 Restore'], CHANGE_PW:['pill-warn','🔑 PW'],
  MAIL_DEFAULTERS:['pill-soft','📧 Mail'], RFID:['pill-soft','📶 RFID'], CERT:['pill-soft','🧾 Cert'],
  HOLIDAY_ADD:['pill-soft','🏛️ Holiday'], HOLIDAY_DEL:['pill-warn','🗑 Holiday'], SETTINGS:['pill-warn','⚙️ Settings'],
  SECTIONS:['pill-warn','🏫 Sections'], SETUP_ADMIN:['pill-good','👑 First admin'],
};
async function loadAudit() {
  const { logs } = await api('/api/admin/audit');
  $('#auditBody').innerHTML = logs.map((l) => {
    const st = AUDIT_STYLE[l.action] || ['pill-soft', l.action];
    return `<tr><td><span class="pill ${st[0]}">${st[1]}</span></td><td><strong>${esc(l.who)}</strong></td><td class="muted">${esc(l.detail)}</td><td class="muted small">${new Date(l.ts).toLocaleString()}</td></tr>`;
  }).join('');
}

/* ================= teacher: mark ================= */
function getSubject() { return mySubjects().length ? $('#tSubjectSelect').value : $('#tSubject').value.trim(); }
async function loadRoster() {
  const subject = getSubject(), date = $('#tDate').value;
  if (!subject) return toast('Subject daalo.', 'error');
  if (!date) return toast('Date chuno.', 'error');
  const program = $('#mProgram').value, branch = $('#mBranch').value, semester = $('#mSem').value, section = $('#mSec').value;
  const { students } = await api(`/api/students?program=${encodeURIComponent(program)}&branch=${encodeURIComponent(branch)}&semester=${semester}&section=${encodeURIComponent(section)}`);
  state.roster = students; state.marks = new Map(); state.focusIdx = 0;
  if (!state.roster.length) { $('#markCard').hidden = true; return toast('No students found.', 'error'); }
  const { record, locked } = await api(`/api/attendance/class?program=${encodeURIComponent(program)}&branch=${encodeURIComponent(branch)}&semester=${semester}&section=${encodeURIComponent(section)}&subject=${encodeURIComponent(subject)}&date=${date}`);
  state.roster.forEach((s) => {
    const saved = record && record.entries.find((e) => e.studentId === s.id);
    state.marks.set(s.id, saved && ['present','late','absent'].includes(saved.status) ? saved.status : 'present');
  });
  $('#tNote').value = (record && record.note) || '';
  $('#markCard').hidden = false;
  renderRoster();
  if (locked) toast('🔒 24h+ purana session — edit lock (admin hi kar sakta hai).', 'info');
  else if (record) toast('Existing session loaded.');
}
function renderRoster() {
  const program = $('#mProgram').value, branch = $('#mBranch').value, section = $('#mSec').value;
  $('#classListTitle').textContent = `${program}${branch !== 'General' ? ' · ' + branch : ''} · Sem ${$('#mSem').value}${section ? ' · ' + section : ''} · ${getSubject()}`;
  $('#classListDate').textContent = $('#tDate').value;
  const L = { present: t('present'), late: t('late'), absent: t('absent') };
  $('#studentList').innerHTML = state.roster.map((s, i) => {
    const st = state.marks.get(s.id);
    return `<div class="student-row ${i === state.focusIdx ? 'focused' : ''}" style="animation-delay:${Math.min(i*0.04,0.4)}s">
      <div class="avatar sm">${esc(s.name.charAt(0).toUpperCase())}</div>
      <div class="student-info"><strong>${esc(s.name)}</strong><span>${esc(s.rollNo || s.username)} · ${esc(classLabel(s))}${s.section ? ' · ' + esc(s.section) : ''}</span></div>
      <div class="toggle-group">${['present','late','absent'].map((k) =>
        `<button class="toggle ${k} ${st === k ? 'on' : ''}" data-id="${s.id}" data-status="${k}">${L[k]}</button>`).join('')}</div></div>`;
  }).join('');
  $('#studentList').querySelectorAll('.toggle').forEach((b) => b.addEventListener('click', () => { state.marks.set(b.dataset.id, b.dataset.status); renderRoster(); }));
  const c = { present: 0, late: 0, absent: 0 };
  state.roster.forEach((s) => { c[state.marks.get(s.id)]++; });
  $('#markCounts').innerHTML = `<span class="pill pill-good">${c.present} P</span> <span class="pill pill-warn">${c.late} L</span> <span class="pill pill-bad">${c.absent} A</span>`;
  const f = document.querySelector('.student-row.focused');
  if (f) f.scrollIntoView({ block: 'nearest' });
}
async function saveAttendance() {
  const entries = state.roster.map((s) => ({ studentId: s.id, status: state.marks.get(s.id) }));
  const res = await api('/api/attendance', { method:'POST', body: JSON.stringify({
    program: $('#mProgram').value, branch: $('#mBranch').value, semester: $('#mSem').value, section: $('#mSec').value,
    subject: getSubject(), date: $('#tDate').value, note: $('#tNote').value, entries }) });
  toast(res.message || 'Saved.');
  if (entries.every((e) => e.status !== 'absent')) { confetti(); toast('🎉 Perfect attendance!'); }
}
function pickRandom() {
  if (!state.roster.length) return toast('Pehle students load karo.', 'error');
  $('#pickModal').hidden = false;
  const names = state.roster.map((s) => s.name);
  let i = 0;
  const iv = setInterval(() => { $('#pickName').textContent = names[i++ % names.length]; }, 70);
  setTimeout(() => { clearInterval(iv); $('#pickName').textContent = `🎓 ${names[Math.floor(Math.random()*names.length)]}`; confetti(); }, 1400);
}
async function openSelfMark() {
  if (!state.roster.length) return toast('Pehle students load karo.', 'error');
  const r = await api('/api/selfmark/open', { method:'POST', body: JSON.stringify({
    program: $('#mProgram').value, branch: $('#mBranch').value, semester: $('#mSem').value,
    section: $('#mSec').value, subject: getSubject(), date: $('#tDate').value, useGeo: true }) });
  state.smSession = r.session;
  $('#smPanel').hidden = false;
  $('#smSessionId').textContent = r.session;
  if (window.QRCode) {
    try {
      const canvas = $('#qrBox').querySelector('canvas') || (() => { const c = document.createElement('canvas'); $('#qrBox').appendChild(c); return c; })();
      await QRCode.toCanvas(canvas, `${location.origin}/?sm=${r.session}`, { width: 150, margin: 1 });
    } catch {}
  }
  toast('Rotating QR ON — code har 30s badlega', 'info');
  const rotate = async () => {
    try {
      const { code } = await api(`/api/selfmark/rotate?session=${state.smSession}`);
      $('#smCode').textContent = code;
      $('#smCountdown').textContent = `⏱️ ${30 - Math.floor(Date.now()/1000) % 30}s me naya code`;
    } catch { $('#smCode').textContent = 'EXPIRED'; }
  };
  await rotate();
  state.smRotTimer = setInterval(rotate, 3000);
  startSMPoll();
}
function startSMPoll() {
  state.smTimer = setInterval(safe(async () => {
    if (!state.smSession) return;
    const r = await api(`/api/selfmark/status?session=${state.smSession}`);
    $('#smLive').textContent = r.closed ? '⏰ Expired' : `${r.items.length} self-marked`;
    $('#smLiveList').innerHTML = r.items.map((i) => `<div class="tt-row" style="padding:5px 10px;">
      <strong style="flex:1;">${esc(i.name)}</strong><span class="muted small">${esc(i.rollNo || '')}</span>
      ${i.flagged ? '<span class="pill pill-bad">flagged</span>' : '<span class="pill pill-good">✓</span>'}</div>`).join('');
  }), 4000);
}
function stopSMTimers() { if (state.smTimer) clearInterval(state.smTimer); if (state.smRotTimer) clearInterval(state.smRotTimer); state.smTimer = state.smRotTimer = null; }
async function closeSelfMark() {
  if (!state.smSession) return;
  await api('/api/selfmark/close', { method:'POST', body: JSON.stringify({ session: state.smSession }) });
  state.smSession = null; stopSMTimers(); $('#smPanel').hidden = true;
  toast('Closed. Roster reload ho raha hai…', 'info');
  await loadRoster();
}
let recog = null;
function toggleVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return toast('Voice supported nahi (Chrome try karo).', 'error');
  if (state.voiceOn) return stopVoice();
  recog = new SR();
  recog.continuous = true; recog.interimResults = false; recog.lang = 'en-IN';
  recog.onresult = (e) => {
    const said = e.results[e.results.length - 1][0].transcript.trim().toLowerCase();
    if (/next|down/.test(said)) { state.focusIdx = Math.min(state.roster.length - 1, state.focusIdx + 1); renderRoster(); }
    else if (/back|up/.test(said)) { state.focusIdx = Math.max(0, state.focusIdx - 1); renderRoster(); }
    else if (/present/.test(said) && state.roster[state.focusIdx]) { state.marks.set(state.roster[state.focusIdx].id, 'present'); renderRoster(); }
    else if (/late/.test(said) && state.roster[state.focusIdx]) { state.marks.set(state.roster[state.focusIdx].id, 'late'); renderRoster(); }
    else if (/absent/.test(said) && state.roster[state.focusIdx]) { state.marks.set(state.roster[state.focusIdx].id, 'absent'); renderRoster(); }
    else if (/save|submit/.test(said)) safe(saveAttendance)();
  };
  recog.onend = () => { if (state.voiceOn) { try { recog.start(); } catch {} } };
  try { recog.start(); state.voiceOn = true; $('#micBtn').classList.add('rec'); toast('🎙️ Voice ON', 'info'); } catch {}
}
function stopVoice() { if (recog) { try { recog.stop(); } catch {} recog = null; } state.voiceOn = false; const b = $('#micBtn'); if (b) b.classList.remove('rec'); }
async function loadSessions() {
  const { sessions } = await api('/api/me/sessions');
  $('#sessionsBody').innerHTML = sessions.length ? sessions.map((s) => {
    const pct = s.total ? Math.round(((s.present + s.late) / s.total) * 100) : 0;
    return `<tr><td>${s.date}</td><td>${esc(s.program)}${s.branch && s.branch !== 'General' ? ' · ' + esc(s.branch) : ''} · S${s.semester}${s.section ? ' · ' + esc(s.section) : ''}</td>
    <td>${esc(s.subject)}</td><td class="muted small">${esc(s.note || '—')}</td>
    <td>${s.present}/${s.late}/${s.total}</td><td><span class="pill pill-${pctClass(pct)}">${pct}%</span></td></tr>`;
  }).join('') : '<tr><td colspan="6" class="empty">None yet.</td></tr>';
}
/* ============ teacher: marks + Excel import ============ */
async function loadMarksRoster() {
  const subject = $('#mkSubject').value.trim(), exam = $('#mkExam').value.trim(), max = Number($('#mkMax').value);
  if (!subject || !exam || !max) return toast('Subject, exam aur max daalo.', 'error');
  const { students } = await api(`/api/students?program=${encodeURIComponent($('#mkProgram').value)}&branch=${encodeURIComponent($('#mkBranch').value)}&semester=${$('#mkSem').value}&section=${encodeURIComponent($('#mkSec').value)}`);
  if (!students.length) { $('#mkCard').hidden = true; return toast('No students.', 'error'); }
  const { items } = await api(`/api/marks/class?subject=${encodeURIComponent(subject)}&exam=${encodeURIComponent(exam)}&program=${encodeURIComponent($('#mkProgram').value)}&branch=${encodeURIComponent($('#mkBranch').value)}&semester=${$('#mkSem').value}&section=${encodeURIComponent($('#mkSec').value)}`);
  const existing = new Map(items.map((i) => [i.student_id, i.score]));
  state.roster = students;
  $('#mkCard').hidden = false;
  $('#mkTitle').textContent = `${subject} · ${exam} · max ${max}`;
  $('#mkList').innerHTML = students.map((s) => `
    <div class="student-row"><div class="avatar sm">${esc(s.name.charAt(0).toUpperCase())}</div>
    <div class="student-info"><strong>${esc(s.name)}</strong><span>${esc(s.rollNo || s.username)}</span></div>
    <input class="input" style="max-width:110px;text-align:center;font-weight:700;" type="number" min="0" max="${max}" step="0.5"
      data-mk="${s.id}" value="${existing.get(s.id) ?? ''}" placeholder="—" /></div>`).join('');
}
function downloadMarksTemplate() {
  if (!state.roster.length) return toast('Pehle Load Students karo — template me rollNo prefilled milte hain.', 'error');
  if (!window.XLSX) return toast('Excel library load nahi hui (CDN).', 'error');
  const rows = state.roster.map((s) => ({ rollNo: s.rollNo || s.username, name: s.name, score: '' }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 18 }, { wch: 26 }, { wch: 10 }];
  const help = XLSX.utils.aoa_to_sheet([
    ['Marks Import Template — Instructions'], [],
    ['1. rollNo column ko EDIT MAT karo — wahi student match hota hai.'],
    ['2. Sirf "score" column me number bharo (max ' + ($('#mkMax').value || 30) + ').'],
    ['3. Khaali score = us student ka skip.'],
    ['4. Save (.xlsx) → 📥 Import scores from file → 💾 Save Marks.'],
  ]);
  makeWorkbook([['Marks', ws, null], ['Instructions', help, [{ wch: 66 }]]], `marks-${($('#mkSubject').value.trim() || 'subject')}-${($('#mkExam').value.trim() || 'exam')}.xlsx`);
  toast('Template downloaded — rollNo already bhare hain!');
}
async function importMarksFile() {
  const f = $('#mkFile').files[0];
  if (!f) return toast('Pehle file choose karo (Excel ya CSV).', 'error');
  if (!state.roster.length) return toast('Pehle Load Students karo.', 'error');
  let raw;
  try {
    if (/\.xlsx$|\.xls$/i.test(f.name)) {
      if (!window.XLSX) return toast('Excel library load nahi hui (CDN).', 'error');
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false }).map(normKeys);
    } else {
      const text = await f.text();
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const parseLine = (line) => { const out = []; let cur = '', q = false; for (const ch of line) { if (ch === '"') { q = !q; continue; } if (ch === ',' && !q) { out.push(cur); cur = ''; continue; } cur += ch; } out.push(cur); return out.map((s) => s.trim()); };
      let header = parseLine(lines[0]).map((h) => h.toLowerCase().replace(/[\s_]/g, ''));
      let start = 1;
      if (!header.includes('rollno') && !header.includes('username')) { header = ['rollno', 'score']; start = 0; }
      raw = [];
      for (let i = start; i < lines.length; i++) { const c = parseLine(lines[i]); const o = {}; header.forEach((h, j) => { o[h] = c[j] || ''; }); raw.push(o); }
    }
  } catch (e) { return toast('File read fail: ' + e.message, 'error'); }
  const byRoll = new Map(state.roster.map((s) => [String(s.rollNo || '').toLowerCase(), s]));
  const byUser = new Map(state.roster.map((s) => [String(s.username).toLowerCase(), s]));
  let matched = 0, noScore = 0; const missing = [];
  for (const o of raw) {
    const key = String(o.rollno || o.roll || o.username || '').toLowerCase();
    if (!key) continue;
    const stu = byRoll.get(key) || byUser.get(key);
    if (!stu) { missing.push(key); continue; }
    const score = String(o.score ?? o.marks ?? o.marksobtained ?? '').trim();
    const inp = $(`#mkList [data-mk="${stu.id}"]`);
    if (!inp) continue;
    if (score === '') { noScore++; continue; }
    inp.value = Number(score); matched++;
  }
  const missMsg = missing.length ? ` · ⚠️ ${missing.length} rollNo class me nahi mile (${missing.slice(0, 4).join(', ')}${missing.length > 4 ? '…' : ''})` : '';
  toast(`✅ ${matched} scores fill hue${noScore ? ` · ${noScore} khaali score skip` : ''}${missMsg}`, matched ? 'success' : 'error');
}
async function saveMarks() {
  const entries = [...$('#mkList').querySelectorAll('[data-mk]')]
    .filter((i) => i.value !== '')
    .map((i) => ({ studentId: i.dataset.mk, score: Number(i.value) }));
  if (!entries.length) return toast('Koi score daalo pehle.', 'error');
  const res = await api('/api/marks/bulk', { method:'POST', body: JSON.stringify({
    subject: $('#mkSubject').value.trim(), exam: $('#mkExam').value.trim(), max: Number($('#mkMax').value), entries }) });
  toast(res.message);
}

/* ================= student: selfmark + face ================= */
function stopSMStream() { if (state.smStream) { state.smStream.getTracks().forEach((t2) => t2.stop()); state.smStream = null; } }
const loadScript = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
async function ensureFaceLib() {
  if (window.faceapi) return;
  if (!state.faceLibLoading) {
    state.faceLibLoading = (async () => {
      await loadScript('https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.js');
      const M = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
      await Promise.all([faceapi.nets.tinyFaceDetector.loadFromUri(M), faceapi.nets.faceLandmark68Net.loadFromUri(M), faceapi.nets.faceRecognitionNet.loadFromUri(M)]);
    })().catch((e) => { state.faceLibLoading = null; throw e; });
  }
  await state.faceLibLoading;
}
async function captureDescriptor(statusEl) {
  if (!state.smStream) {
    const v = $('#smVideo'); v.hidden = false;
    state.smStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode:'user' } });
    v.srcObject = state.smStream;
    await new Promise((r) => setTimeout(r, 800));
  }
  statusEl.textContent = '🧠 Face scan ho raha hai… camera dekho.';
  await ensureFaceLib();
  const det = await faceapi.detectSingleFace($('#smVideo'), new faceapi.TinyFaceDetectorOptions({ inputSize: 224 })).withFaceLandmarks().withFaceDescriptor();
  if (!det) throw new Error('Face detect nahi hua — light me camera dekho.');
  return [...det.descriptor];
}
async function registerFace() {
  const st = $('#faceStatus');
  try {
    const descriptor = await captureDescriptor(st);
    const r = await api('/api/me/face', { method:'POST', body: JSON.stringify({ descriptor }) });
    state.user.hasFace = true;
    st.textContent = '🧠 Face registered ✓ — ab verification active hai.';
    toast(r.message);
  } catch (e) {
    st.textContent = e.message.includes('Failed to load') || e.message.includes('face-api') ? '⚠️ Face library load nahi hui (internet?) — selfie-only mode.' : e.message;
    toast(st.textContent, 'error');
  }
}
function captureSelfie() {
  const v = $('#smVideo'), c = document.createElement('canvas');
  c.width = 320; c.height = 240;
  c.getContext('2d').drawImage(v, 0, 0, 320, 240);
  return c.toDataURL('image/jpeg', 0.7);
}
async function doSelfMark() {
  const session = $('#smSessionInput').value.trim();
  const code = $('#smCodeInput').value.trim();
  if (!session) return toast('Session ID daalo (QR scan karo ya teacher se lo).', 'error');
  if (!/^\d{6}$/.test(code)) return toast('6-digit rotating code daalo.', 'error');
  const statusEl = $('#smStatus');
  statusEl.textContent = '📍 Location…';
  let lat, lng;
  if (navigator.geolocation) {
    try { const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000 })); lat = pos.coords.latitude; lng = pos.coords.longitude; } catch {}
  }
  let selfie, face;
  try {
    if (state.user.hasFace) { face = await captureDescriptor(statusEl); selfie = captureSelfie(); }
    else if ($('#smSelfie').checked && state.smStream) { selfie = captureSelfie(); }
  } catch (e) { statusEl.textContent = e.message; return toast(e.message, 'error'); }
  statusEl.textContent = '⏳ Marking…';
  try {
    const r = await api('/api/selfmark/mark', { method:'POST', body: JSON.stringify({ session, code, lat, lng, selfie, face, device: DEVICE_ID }) });
    confetti();
    statusEl.innerHTML = `<strong style="color:var(--green)">${esc(r.message)}</strong>`;
    toast(r.message);
    stopSMStream(); $('#smVideo').hidden = true; $('#smSelfie').checked = false;
  } catch (e) { statusEl.innerHTML = `<strong style="color:var(--red)">${esc(e.message)}</strong>`; toast(e.message, 'error'); }
}

/* ================= student: dashboard ================= */
function dayMap(logs) {
  const m = new Map();
  for (const l of logs) { const d = m.get(l.date) || { a: 0, t: 0 }; d.t++; if (l.status !== 'absent') d.a++; m.set(l.date, d); }
  return m;
}
function calcStreak(logs) {
  const days = [...dayMap(logs).entries()].sort((a, b) => b[0].localeCompare(a[0]));
  let s = 0;
  for (const [, d] of days) { if (d.a === d.t) s++; else break; }
  return s;
}
function calcBadges(stats) {
  const b = [];
  if (stats.percentage === 100 && stats.total >= 5) b.push(['💯', 'Century Club']);
  const st = calcStreak(stats.logs);
  if (st >= 3) b.push(['🔥', `${st}-day Streak`]);
  const last30 = [...dayMap(stats.logs).entries()].filter(([d]) => (new Date() - new Date(d)) / 86400000 <= 30);
  if (last30.length >= 5 && last30.every(([, v]) => v.a === v.t)) b.push(['🌟', 'Perfect Month']);
  if (stats.total >= 20) b.push(['📚', 'Dedicated 20+']);
  return b;
}
function detectPatterns(stats) {
  const out = [];
  const wd = {}, sj = {};
  for (const l of stats.logs) {
    const day = DAYS_SHORT[new Date(l.date + 'T00:00:00').getDay()];
    (wd[day] = wd[day] || { a: 0, t: 0 }); wd[day].t++; if (l.status === 'absent') wd[day].a++;
    (sj[l.subject] = sj[l.subject] || { a: 0, t: 0 }); sj[l.subject].t++; if (l.status === 'absent') sj[l.subject].a++;
  }
  const worstDay = Object.entries(wd).filter(([, v]) => v.a >= 2).sort((x, y) => y[1].a / y[1].t - x[1].a / x[1].t)[0];
  if (worstDay) out.push(`📅 <strong>${worstDay[0]}s</strong> me sabse zyada absent (${worstDay[1].a}/${worstDay[1].t}).`);
  const worstSub = Object.entries(sj).filter(([, v]) => v.a >= 2).sort((x, y) => y[1].a / y[1].t - x[1].a / x[1].t)[0];
  if (worstSub) out.push(`📚 <strong>${esc(worstSub[0])}</strong> me attendance gir rahi hai.`);
  const rr = recentRate(stats);
  const th = stats.threshold || state.settings.threshold;
  if (rr !== null && rr < th / 100 && stats.total >= 5)
    out.push(`🔮 <strong style="color:var(--red)">Risk:</strong> 10 class baad ~${Math.round(((stats.attended + rr * 10) / (stats.total + 10)) * 100)}% ho jayegi (${th}% se neeche!).`);
  else if (rr !== null && rr >= 0.9) out.push('🔮 Recent trend excellent! 🚀');
  return out.length ? out.map((o) => `<p style="margin-bottom:8px;">${o}</p>`).join('') : '<p>Koi pattern nahi — regular ho. 👍</p>';
}
async function loadStudentAll() {
  const stats = await api('/api/me/attendance');
  const th = stats.threshold || state.settings.threshold;
  state.settings.threshold = th;
  requestAnimationFrame(() => { $('#ringFg').style.strokeDashoffset = 100 - stats.percentage; $('#ringFg').classList.add(pctClass(stats.percentage)); });
  $('#ringPct').textContent = stats.percentage + '%';
  $('#statPresent').textContent = stats.present; $('#statLate').textContent = stats.late;
  $('#statAbsent').textContent = stats.absent; $('#statTotal').textContent = stats.total;
  $('#eligPill').innerHTML = stats.total === 0 ? '' :
    `<span class="pill ${stats.percentage >= th ? 'pill-good' : 'pill-bad'}" style="margin-bottom:8px;">${stats.percentage >= th ? '🎓 Exam Eligible ✓' : `⛔ NOT Eligible (${th}% chahiye)`}</span>`;
  const msg = $('#ringMsg');
  if (!stats.total) msg.textContent = 'No data yet.';
  else if (stats.percentage >= th) msg.textContent = `Above ${th}%! 🎉`;
  else { const need = Math.max(0, Math.ceil((th * stats.total - 100 * stats.attended) / (100 - th))); msg.textContent = `Next ${need} classes attend karo — recover hoge.`; }
  const st = calcStreak(stats.logs);
  $('#streakLine').textContent = st > 0 ? `🔥 ${st}-day streak!` : '';
  if (window.Chart) {
    _charts.push(new Chart($('#pieChart'), { type:'doughnut',
      data: { labels: ['Present','Late','Absent'], datasets: [{ data: [stats.present, stats.late, stats.absent], backgroundColor: ['#059669','#d97706','#dc2626'], borderWidth: 0 }] },
      options: { plugins: { legend: { position:'bottom', labels: { color:'#8296b4', font: { size: 11 } } } }, cutout: '65%' } }));
    const days = [...dayMap(stats.logs).entries()].sort((a, b) => a[0].localeCompare(b[0]));
    let a = 0, t2 = 0;
    const pts = days.map(([d, v]) => { a += v.a; t2 += v.t; return { d, p: Math.round((a / t2) * 100) }; });
    _charts.push(new Chart($('#trendChart'), { type:'line',
      data: { labels: pts.map((p) => p.d.slice(5)), datasets: [{ data: pts.map((p) => p.p), borderColor: '#1d4ed8', backgroundColor: 'rgba(29,78,216,.12)', fill: true, tension: .35, pointRadius: 3 }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 100 } } } }));
  }
  const badges = calcBadges(stats);
  $('#badgeList').innerHTML = badges.length ? badges.map((b) => `<span class="badge-chip">${b[0]} ${esc(b[1])}</span>`).join('') : '<span class="muted small">None yet 💯🔥🌟</span>';
  $('#patternBox').innerHTML = detectPatterns(stats);
  $('#subjectList').innerHTML = stats.subjects.length ? stats.subjects.map((s) => {
    const attended = s.present + s.late;
    return `<div class="subject-item">
      <div class="subject-head"><strong>${esc(s.subject)}</strong><span class="pill pill-${pctClass(s.percentage)}">${s.percentage}%</span></div>
      <div class="bar"><div class="bar-fill ${pctClass(s.percentage)}" style="width:${s.percentage}%"></div></div>
      <span class="muted small">${attended}/${s.total} attended${s.late ? ` (${s.late} late)` : ''}</span></div>`;
  }).join('') : '<p class="empty">No subjects yet.</p>';
  const dm = dayMap(stats.logs);
  let cells = '';
  for (let i = 69; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const v = dm.get(key);
    cells += `<i class="${!v ? '' : v.a === 0 ? 'a' : v.a < v.t ? 'b' : 'c'}" title="${key}"></i>`;
  }
  $('#heat').innerHTML = cells;
  try {
    const lb = await api('/api/leaderboard');
    const medal = (i) => ['🥇','🥈','🥉'][i] || `<span class="lb-rank">${i+1}</span>`;
    $('#lbList').innerHTML = lb.top.length ? lb.top.map((r, i) => `
      <div class="lb-row ${state.user.name === r.name ? 'me' : ''}">${medal(i)}
      <strong style="flex:1;">${esc(r.name)}</strong><span class="muted small">${esc(r.label)}</span>
      <span class="pill pill-${pctClass(r.pct)}">${r.pct}%</span></div>`).join('')
      + (lb.myRank > 5 ? `<p class="muted small center" style="margin-top:8px;">#${lb.myRank}/${lb.classSize} 💪</p>` : '')
      : '<p class="muted small">Empty.</p>';
  } catch {}
  try {
    const { items } = await api('/api/marks/mine');
    $('#myMarks').innerHTML = items.length ? items.map((m) => `
      <div class="tt-row" style="padding:6px 10px;"><strong style="flex:1;">${esc(m.subject)}</strong>
      <span class="muted small">${esc(m.exam)}</span>
      <span class="pill pill-${pctClass(Math.round(m.score * 100 / m.max))}">${m.score}/${m.max}</span></div>`).join('')
      : '<p class="muted small">No marks yet.</p>';
  } catch {}
  const wi = $('#whatifBody');
  if (stats.total > 0) {
    wi.innerHTML = `<p class="muted small">Agle <strong id="wiN">5</strong> class aau to:</p>
      <div class="whatif-out" id="wiOut">—</div><input type="range" id="wiSlider" min="1" max="30" value="5" />`;
    const upd = () => {
      const n = Number($('#wiSlider').value);
      const np = Math.round(((stats.attended + n) / (stats.total + n)) * 100);
      $('#wiN').textContent = n;
      $('#wiOut').innerHTML = `<span class="pill pill-${pctClass(np)}" style="font-size:1rem;">${np}%</span> <span class="muted small">(abhi ${stats.percentage}%)</span>`;
    };
    $('#wiSlider').addEventListener('input', upd); upd();
  }
  const label = (s) => (s === 'present' ? 'Present' : s === 'late' ? 'Late' : 'Absent');
  const pill = (s) => (s === 'present' ? 'pill-good' : s === 'late' ? 'pill-warn' : 'pill-bad');
  $('#logBody').innerHTML = stats.logs.length ? stats.logs.slice(0, 25).map((l) => `
    <tr><td>${l.date}</td><td>${esc(l.subject)}</td>
    <td><span class="pill ${pill(l.status)}">${label(l.status)}</span></td>
    <td>${l.status === 'absent' ? `<button class="btn btn-ghost btn-sm" data-fix="${l.entryId}">⚠️ Fix</button>` : ''}</td></tr>`).join('')
    : '<tr><td colspan="4" class="empty">No records.</td></tr>';
  $('#logBody').querySelectorAll('[data-fix]').forEach((b) => b.addEventListener('click', safe(async () => {
    const reason = prompt('Reason (teacher se baat ki etc.):') || '';
    const r = await api('/api/corrections', { method:'POST', body: JSON.stringify({ entryId: Number(b.dataset.fix), requested: 'present', reason }) });
    toast(r.message);
  })));
}
async function loadMyLeaves() {
  const { items } = await api('/api/leaves');
  $('#myLeaves').innerHTML = items.length ? items.map((l) => `
    <div class="tt-row"><strong style="flex:1;">${esc(l.type)}</strong>
      <span class="muted small">${l.date}</span>
      <span class="pill ${l.status === 'approved' ? 'pill-good' : l.status === 'rejected' ? 'pill-bad' : 'pill-warn'}">${l.status}</span></div>`).join('')
    : '<p class="muted small">Koi applications nahi.</p>';
}
async function makeCertificate() {
  const st = await api('/api/me/attendance');
  const r = await api('/api/certificate', { method:'POST' });
  const logoHTML = $('#brandLogoSide').innerHTML || GL_SVG;
  $('#certHost').innerHTML = `
    <div class="cert-card" id="theCert">
      ${logoHTML}
      <h2>GL Bajaj Institute of Technology & Management</h2>
      <p class="muted small">Approved by AICTE · Affiliated to AKTU Lucknow</p><hr style="border:none;border-top:1px solid #ddd;margin:14px 0"/>
      <h3 style="font-family:Georgia;">Attendance Certificate</h3>
      <p>This certifies that <strong>${esc(state.user.name)}</strong> (${esc(state.user.rollNo || '—')}),<br/>
      ${esc(classLabel(state.user))} · Semester ${state.user.semester ?? '—'}</p>
      <p style="font-size:2rem;font-weight:700;color:#1d4ed8;margin:8px 0;">${st.percentage}%</p>
      <p class="muted small">Certificate ID: <strong>${esc(r.id)}</strong> · Issued ${todayISO()}</p>
      <canvas id="certQR" style="margin-top:10px;"></canvas></div>`;
  $('#certVerifyLink').href = r.url;
  $('#certModal').hidden = false;
  if (window.QRCode) { try { await QRCode.toCanvas($('#certQR'), location.origin + r.url, { width: 80, margin: 0 }); } catch {} }
}

/* ================= parent ================= */
async function loadParentChild() {
  const { user: child, stats } = await api('/api/parent/child');
  const th = stats.threshold || state.settings.threshold;
  $('#pcName').textContent = child.name;
  $('#pcClass').textContent = `${classLabel(child)} · Sem ${child.semester ?? '—'}${child.section ? ' · ' + child.section : ''} · ${child.rollNo || ''}`;
  requestAnimationFrame(() => { $('#ringFg').style.strokeDashoffset = 100 - stats.percentage; $('#ringFg').classList.add(pctClass(stats.percentage)); });
  $('#ringPct').textContent = stats.percentage + '%';
  $('#statPresent').textContent = stats.present; $('#statLate').textContent = stats.late;
  $('#statAbsent').textContent = stats.absent; $('#statTotal').textContent = stats.total;
  $('#pcElig').innerHTML = `<span class="pill ${stats.percentage >= th ? 'pill-good' : 'pill-bad'}">${stats.percentage >= th ? '🎓 Exam Eligible ✓' : '⛔ NOT Eligible'}</span>`;
  $('#pcMsg').textContent = stats.total === 0 ? 'No data yet.' : stats.percentage >= th ? `Above ${th}% — badhiya! 🎉` : `${th}% se neeche hai — teacher se milein.`;
  $('#pcSubjects').innerHTML = stats.subjects.length ? stats.subjects.map((s) => `
    <div class="subject-item"><div class="subject-head"><strong>${esc(s.subject)}</strong>
    <span class="pill pill-${pctClass(s.percentage)}">${s.percentage}%</span></div>
    <div class="bar"><div class="bar-fill ${pctClass(s.percentage)}" style="width:${s.percentage}%"></div></div></div>`).join('') : '<p class="muted">No data.</p>';
  const pill = (s) => (s === 'present' ? 'pill-good' : s === 'late' ? 'pill-warn' : 'pill-bad');
  const label = (s) => (s === 'present' ? 'Present' : s === 'late' ? 'Late' : 'Absent');
  $('#pcLog').innerHTML = stats.logs.length ? stats.logs.slice(0, 20).map((l) => `
    <tr><td>${l.date}</td><td>${esc(l.subject)}</td><td><span class="pill ${pill(l.status)}">${label(l.status)}</span></td></tr>`).join('')
    : '<tr><td colspan="3" class="empty">No records.</td></tr>';
  try {
    const { items } = await api('/api/leaves');
    $('#pcLeaves').innerHTML = items.length ? items.map((l) => `
      <div class="tt-row"><strong style="flex:1;">${esc(l.type)}</strong><span class="muted small">${l.date}</span>
      <span class="pill ${l.status === 'approved' ? 'pill-good' : l.status === 'rejected' ? 'pill-bad' : 'pill-warn'}">${l.status}</span></div>`).join('')
      : '<p class="muted small">No leaves applied.</p>';
  } catch {}
}

/* ================= command palette ================= */
let cmdSel = 0;
function cmdItems() {
  const nav = NAVS[state.user.role].map(([id, icon]) => ({ icon, label: `Go to ${navLabel(id)}`, run: () => go(id) }));
  const extra = [
    { icon: '🌐', label: 'Toggle Hindi / English', run: () => $('#langBtn').click() },
    { icon: '🌙', label: 'Toggle theme', run: () => setTheme(!document.body.classList.contains('dark')) },
    { icon: '🚪', label: 'Log out', run: () => $('#logoutBtn').click() },
  ];
  if (state.user.role === 'admin') extra.unshift(
    { icon: '📊', label: 'Export Excel (current range)', run: () => downloadFile('/api/reports/export' + rangeQ(), `attendance-${todayISO()}.csv`) },
    { icon: '💾', label: 'Download backup', run: () => downloadFile('/api/admin/backup', `glbajaj-backup-${todayISO()}.json`) },
    { icon: '🖨️', label: 'Print report', run: () => { go('reports'); setTimeout(() => window.print(), 400); } },
  );
  if (state.user.role === 'teacher') extra.unshift(
    { icon: '✏️', label: 'Mark today attendance', run: () => { go('mark'); setTimeout(() => safe(loadRoster)(), 250); } },
    { icon: '📝', label: 'Enter marks', run: () => go('marks') },
  );
  if (state.user.role === 'student') extra.unshift(
    { icon: '📲', label: 'Self-mark attendance', run: () => go('selfmark') },
    { icon: '🧾', label: 'Get attendance certificate', run: () => safe(makeCertificate)() },
  );
  return [...nav, ...extra];
}
function openCmd() { $('#cmdk').hidden = false; $('#cmdInput').value = ''; renderCmd(''); setTimeout(() => $('#cmdInput').focus(), 30); }
function renderCmd(q) {
  const items = cmdItems().filter((it) => it.label.toLowerCase().includes(q.toLowerCase()));
  cmdSel = 0;
  $('#cmdList').innerHTML = items.length ? items.map((it, i) => `<button class="cmd-item ${i === 0 ? 'sel' : ''}" data-i="${i}">${it.icon} ${esc(it.label)}</button>`).join('') : '<p class="muted small" style="padding:16px;">No match.</p>';
  $('#cmdList').querySelectorAll('.cmd-item').forEach((b) => b.addEventListener('click', () => { $('#cmdk').hidden = true; items[Number(b.dataset.i)].run(); }));
  return items;
}
 $('#cmdBtn').addEventListener('click', openCmd);
 $('#cmdInput').addEventListener('input', (e) => renderCmd(e.target.value));
 $('#cmdInput').addEventListener('keydown', (e) => {
  const items = cmdItems().filter((it) => it.label.toLowerCase().includes($('#cmdInput').value.toLowerCase()));
  const rows = $('#cmdList').querySelectorAll('.cmd-item');
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    cmdSel = Math.max(0, Math.min(rows.length - 1, cmdSel + (e.key === 'ArrowDown' ? 1 : -1)));
    rows.forEach((r, i) => r.classList.toggle('sel', i === cmdSel));
  } else if (e.key === 'Enter' && rows[cmdSel]) { $('#cmdk').hidden = true; items[cmdSel].run(); }
  else if (e.key === 'Escape') $('#cmdk').hidden = true;
});
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openCmd(); }
  if (e.key === 'Escape') { $('#cmdk').hidden = true; $('#pickModal').hidden = true; $('#idModal').hidden = true; $('#certModal').hidden = true; }
});
 $('#cmdk').addEventListener('click', (e) => { if (e.target.id === 'cmdk') $('#cmdk').hidden = true; });

/* ================= ID card ================= */
async function showIDCard(id) {
  const u = studentCache.find((x) => x.id === id); if (!u) return;
  const logoHTML = $('#brandLogoSide').innerHTML || GL_SVG;
  $('#idCardHost').innerHTML = `
    <div class="id-card" id="theIdCard">
      <div class="id-top">${logoHTML}<div><b>${esc(u.name)}</b><small>Student · ${esc(u.program)}</small></div></div>
      <div class="id-body"><dl>
        <dt>Roll No</dt><dd>${esc(u.rollNo || '—')}</dd>
        <dt>Branch</dt><dd style="font-size:.74rem;">${esc(u.branch)}</dd>
        <dt>Sem/Sec</dt><dd>${u.semester ?? '—'}${u.section ? ' / ' + esc(u.section) : ''}</dd>
        <dt>Portal</dt><dd style="font-size:.74rem;">@${esc(u.username)}</dd></dl>
        <canvas id="idQR"></canvas></div>
      <div class="id-foot">GLBITM · ${new Date().getFullYear()}</div></div>`;
  $('#idModal').hidden = false;
  if (window.QRCode) { try { await QRCode.toCanvas($('#idQR'), `GLBITM|${u.rollNo || u.id}|${u.name}`, { width: 92, margin: 0 }); } catch {} }
}
function printHTML(html) {
  const w = window.open('', '_blank', 'width=700,height=800');
  w.document.write(`<html><head><title>Print</title><style>body{display:grid;place-items:center;margin:0;padding:20px;font-family:Inter,Arial,sans-serif}</style></head><body>${html}</body></html>`);
  w.document.close(); setTimeout(() => w.print(), 400);
}
 $('#idPrint').addEventListener('click', () => printHTML($('#theIdCard').outerHTML));
 $('#idClose').addEventListener('click', () => { $('#idModal').hidden = true; });
 $('#idModal').addEventListener('click', (e) => { if (e.target.id === 'idModal') $('#idModal').hidden = true; });
 $('#certPrint').addEventListener('click', () => printHTML($('#theCert').outerHTML));
 $('#certClose').addEventListener('click', () => { $('#certModal').hidden = true; });
 $('#certModal').addEventListener('click', (e) => { if (e.target.id === 'certModal') $('#certModal').hidden = true; });

/* ================= PWA ================= */
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; $('#installBtn').hidden = false; });
 $('#installBtn').addEventListener('click', async () => { if (!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; $('#installBtn').hidden = true; });

/* ================= bootstrap ================= */
 $('#logoutBtn').addEventListener('click', async () => {
  try { await api('/api/logout', { method:'POST' }); } catch {}
  stopSMStream(); clearSession(); location.href = '/';
});
 $('#keyBtn').addEventListener('click', safe(async () => {
  const opt = prompt('1️⃣ Password change\n2️⃣ 2FA ON/OFF\n\nType 1 or 2:');
  if (opt === '1') {
    const oldPw = prompt('Current password:'); if (oldPw === null) return;
    const newPw = prompt('New password (min 4):'); if (newPw === null) return;
    toast((await api('/api/me/password', { method:'POST', body: JSON.stringify({ oldPassword: oldPw, newPassword: newPw }) })).message);
  } else if (opt === '2') {
    const r = await api('/api/me/twofa', { method:'POST', body: JSON.stringify({ on: !state.user.twofa }) });
    state.user.twofa = r.twofa; toast(r.message, 'info');
  }
}));
 $('#pickClose').addEventListener('click', () => { $('#pickModal').hidden = true; });
bindLogin();
(async () => {
  if (state.token) {
    try { const { user } = await api('/api/me'); state.user = user; startApp(); return; } catch {}
  }
  showLogin();
})();
})();