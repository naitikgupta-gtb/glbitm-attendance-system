const form = document.getElementById('loginForm');
const usernameEl = document.getElementById('username');
const passwordEl = document.getElementById('password');
const errorEl = document.getElementById('loginError');
const btn = document.getElementById('loginBtn');

const ROLE_HOME = { admin: 'admin.html', teacher: 'teacher.html', student: 'student.html' };

// Demo chips autofill
document.querySelectorAll('.chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    usernameEl.value = chip.dataset.u;
    passwordEl.value = chip.dataset.p;
    errorEl.hidden = true;
  });
});

// Show / hide password
document.getElementById('togglePw').addEventListener('click', () => {
  passwordEl.type = passwordEl.type === 'password' ? 'text' : 'password';
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.hidden = true;
  btn.disabled = true;
  btn.textContent = 'Signing in…';

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: usernameEl.value, password: passwordEl.value }),
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Login failed.');

    Auth.save(data.token, data.user);
    location.href = ROLE_HOME[data.user.role] || 'index.html';
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
    btn.disabled = false;
    btn.textContent = 'Sign in';
  }
});