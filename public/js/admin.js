let me;

document.addEventListener('DOMContentLoaded', async () => {
  me = await guard('admin');
  if (!me) return;

  $('#userName').textContent = me.name;
  $('#avatar').textContent = me.name.charAt(0).toUpperCase();
  $('#logoutBtn').addEventListener('click', logout);

  const titles = { overview: 'Overview', students: 'Manage Students', teachers: 'Manage Teachers', reports: 'Attendance Reports' };
  document.querySelectorAll('#adminNav .nav-link').forEach((link) => {
    link.addEventListener('click', () => {
      document.querySelectorAll('#adminNav .nav-link').forEach((l) => l.classList.remove('active'));
      document.querySelectorAll('.section').forEach((s) => s.classList.remove('active'));
      link.classList.add('active');
      $('#section-' + link.dataset.section).classList.add('active');
      $('#pageTitle').textContent = titles[link.dataset.section];
    });
  });

  $('#addStudentForm').addEventListener('submit', addUser('student'));
  $('#addTeacherForm').addEventListener('submit', addUser('teacher'));

  refreshAll();
});

async function refreshAll() {
  await Promise.all([loadStats(), loadStudents(), loadTeachers(), loadReport()]);
}

function addUser(role) {
  return async (e) => {
    e.preventDefault();
    const p = role === 'student' ? 'st' : 'tc';
    const payload = {
      role,
      name: $(`#${p}Name`).value.trim(),
      username: $(`#${p}Username`).value.trim(),
      password: $(`#${p}Password`).value,
    };
    if (role === 'student') {
      payload.branch = $('#stBranch').value;
      payload.semester = $('#stSem').value;
      payload.rollNo = $('#stRoll').value.trim();
    } else {
      payload.branch = $('#tcBranch').value;
    }

    try {
      await api('/api/users', { method: 'POST', body: JSON.stringify(payload) });
      toast(`${role === 'student' ? 'Student' : 'Teacher'} added successfully.`);
      e.target.reset();
      refreshAll();
    } catch (err) { toast(err.message, 'error'); }
  };
}

async function removeUser(id) {
  if (!confirm('Remove this user permanently?')) return;
  try {
    await api(`/api/users/${id}`, { method: 'DELETE' });
    toast('User removed.');
    refreshAll();
  } catch (err) { toast(err.message, 'error'); }
}

async function loadStats() {
  const s = await api('/api/reports/summary');
  $('#statStudents').textContent = s.totalStudents;
  $('#statTeachers').textContent = s.totalTeachers;
  $('#statSessions').textContent = s.sessionsMarked;
  $('#statOverall').textContent = s.overallPercentage + '%';
}

async function loadStudents() {
  const { users } = await api('/api/users?role=student');
  const tbody = $('#studentsTable tbody');
  tbody.innerHTML = users.length ? users.map((u) => `
    <tr>
      <td>${escapeHTML(u.rollNo || '—')}</td>
      <td>${escapeHTML(u.name)}</td>
      <td>${escapeHTML(u.username)}</td>
      <td>${escapeHTML(u.branch)}</td>
      <td>Sem ${u.semester}</td>
      <td><button class="btn btn-danger btn-sm" data-del="${u.id}">Remove</button></td>
    </tr>`).join('')
    : '<tr><td colspan="6" class="empty">No students yet — add one above.</td></tr>';
  tbody.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => removeUser(b.dataset.del)));
}

async function loadTeachers() {
  const { users } = await api('/api/users?role=teacher');
  const tbody = $('#teachersTable tbody');
  tbody.innerHTML = users.length ? users.map((u) => `
    <tr>
      <td>${escapeHTML(u.name)}</td>
      <td>${escapeHTML(u.username)}</td>
      <td>${escapeHTML(u.branch || '—')}</td>
      <td><button class="btn btn-danger btn-sm" data-del="${u.id}">Remove</button></td>
    </tr>`).join('')
    : '<tr><td colspan="4" class="empty">No teachers yet — add one above.</td></tr>';
  tbody.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => removeUser(b.dataset.del)));
}

async function loadReport() {
  const { report } = await api('/api/reports/overall');
  const tbody = $('#reportTable tbody');
  tbody.innerHTML = report.length ? report.map((r) => `
    <tr>
      <td>${escapeHTML(r.rollNo || '—')}</td>
      <td>${escapeHTML(r.name)}</td>
      <td>${escapeHTML(r.branch)} · Sem ${r.semester}</td>
      <td>${r.total}</td>
      <td>${r.present} / ${r.absent}</td>
      <td><span class="pill pill-${pctClass(r.percentage)}">${r.percentage}%</span></td>
    </tr>`).join('')
    : '<tr><td colspan="6" class="empty">No students enrolled yet.</td></tr>';
}