function bindLogin() {
  const err = $('#loginError'), btn = $('#loginBtn');
  document.querySelectorAll('.chip').forEach((ch) => ch.addEventListener('click', () => { $('#username').value = ch.dataset.u; $('#password').value = ch.dataset.p; err.hidden = true; }));
  $('#togglePw').addEventListener('click', () => { $('#password').type = $('#password').type === 'password' ? 'text' : 'password'; });
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault(); err.hidden = true; btn.disabled = true;
    try {
      if (pending2fa) {
        const r = await fetch('/api/login/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: pending2fa, code: $('#otpInput').value }) });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'OTP failed.');
        pending2fa = null; saveSession(data.token, data.user); startApp();
        toast(`Welcome, ${data.user.name.split(' ')[0]}! 👋`);
      } else {
        const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: $('#username').value, password: $('#password').value }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Login failed.');
        if (data.need2fa) {
          pending2fa = data.username;
          $('#loginStep1').hidden = true; $('#demoBox') && ($('#demoBox').hidden = true); $('#loginStep2').hidden = false;
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

  /* ===== First-run setup wizard + demo-box visibility (v7.2) ===== */
  fetch('/api/setup/status').then((r) => r.json()).then((st) => {
    if (st.needsSetup) {
      const box = document.createElement('div');
      box.style.cssText = 'background:var(--green-soft);color:var(--green);text-align:left;cursor:pointer;margin-top:14px;padding:14px;border-radius:10px;font-size:.86rem;';
      box.innerHTML = `<strong>⚙️ First-time Setup:</strong> Abhi koi admin nahi hai. Click karke pehla admin account banao →`;
      box.addEventListener('click', openSetupWizard);
      const demo = document.querySelector('.demo-box');
      if (demo) demo.before(box); else $('.auth-card').appendChild(box);
    }
    if (!st.canShowDemo && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      const d = document.querySelector('.demo-box'); if (d) d.hidden = true;
    }
  }).catch(() => {});
}

/* ============ SETUP WIZARD (v7.2) ============ */
function openSetupWizard() {
  if ($('#setupModal')) return;
  const host = $('.auth-card');
  host.insertAdjacentHTML('beforeend', `
    <div id="setupModal" class="modal" style="position:fixed;">
      <div class="modal-box" style="text-align:left;max-width:380px;">
        <h2>⚙️ First-Time Setup</h2>
        <p class="muted small" style="margin-bottom:14px;">Pehla admin account banao. Ye page sirf tab tak accessible hai jab tak koi admin na ho. Password strong rakho (min 8 chars).</p>
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