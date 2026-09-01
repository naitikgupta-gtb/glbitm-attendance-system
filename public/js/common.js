/* Shared helpers for all dashboards */

const Auth = {
  get token() { return localStorage.getItem('ams_token'); },
  get user() {
    try { return JSON.parse(localStorage.getItem('ams_user')); } catch { return null; }
  },
  save(token, user) {
    localStorage.setItem('ams_token', token);
    localStorage.setItem('ams_user', JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem('ams_token');
    localStorage.removeItem('ams_user');
  },
};

const ROLE_HOME = { admin: 'admin.html', teacher: 'teacher.html', student: 'student.html' };

/** fetch wrapper that attaches the token and throws readable errors */
async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (Auth.token) headers.Authorization = `Bearer ${Auth.token}`;

  const res = await fetch(path, { ...options, headers });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON response */ }

  if (!res.ok) {
    if (res.status === 401) { Auth.clear(); location.href = 'index.html'; }
    throw new Error((data && data.error) || `Request failed (${res.status})`);
  }
  return data;
}

/** Redirect to login if there's no valid session; enforce role. Returns user or null. */
async function guard(role) {
  if (!Auth.token) { location.href = 'index.html'; return null; }
  try {
    const { user } = await api('/api/me');
    if (role && user.role !== role) { location.href = ROLE_HOME[user.role] || 'index.html'; return null; }
    return user;
  } catch {
    location.href = 'index.html';
    return null;
  }
}

function logout() {
  api('/api/logout', { method: 'POST' })
    .catch(() => {})
    .finally(() => { Auth.clear(); location.href = 'index.html'; });
}

/* Toast notifications */
function toast(message, type = 'success') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

/* Small utilities */
const $ = (sel) => document.querySelector(sel);
const escapeHTML = (str) =>
  String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function pctClass(p) { return p >= 75 ? 'good' : p >= 50 ? 'warn' : 'bad'; }

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}