/* v11 shared panel enhancements for admin/teacher/student dashboards:
   theme sync with the main SPA, password show/hide, clear-form buttons, date badge. */
(function () {
  const KEY = 'ams_theme';

  function applyTheme(dark) {
    document.body.classList.toggle('dark', dark);
    document.querySelectorAll('.themeToggle').forEach((b) => { b.textContent = dark ? 'Light' : 'Dark'; });
  }

  function init() {
    applyTheme(localStorage.getItem(KEY) === 'dark');

    document.querySelectorAll('.themeToggle').forEach((b) => {
      b.addEventListener('click', () => {
        const dark = !document.body.classList.contains('dark');
        applyTheme(dark);
        try { localStorage.setItem(KEY, dark ? 'dark' : 'light'); } catch { /* private mode */ }
      });
    });

    document.querySelectorAll('.pw-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const input = document.getElementById(btn.dataset.target);
        if (!input) return;
        input.type = input.type === 'password' ? 'text' : 'password';
        btn.textContent = input.type === 'password' ? '👁' : '🙈';
      });
    });

    document.querySelectorAll('[data-clear]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const form = document.getElementById(btn.dataset.clear);
        if (form) form.reset();
      });
    });

    const badge = document.getElementById('dateBadge');
    if (badge) {
      badge.textContent = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
