let me;
let roster = [];       // students loaded for the selected class
let marks = new Map(); // studentId -> 'present' | 'absent'

document.addEventListener('DOMContentLoaded', async () => {
  me = await guard('teacher');
  if (!me) return;

  $('#userName').textContent = me.name;
  $('#avatar').textContent = me.name.charAt(0).toUpperCase();
  $('#logoutBtn').addEventListener('click', logout);

  if (me.branch) $('#tBranch').value = me.branch;
  $('#tDate').value = todayISO();

  const titles = { mark: 'Mark Attendance', sessions: 'My Sessions' };
  document.querySelectorAll('#teacherNav .nav-link').forEach((link) => {
    link.addEventListener('click', () => {
      document.querySelectorAll('#teacherNav .nav-link').forEach((l) => l.classList.remove('active'));
      document.querySelectorAll('.section').forEach((s) => s.classList.remove('active'));
      link.classList.add('active');
      $('#section-' + link.dataset.section).classList.add('active');
      $('#pageTitle').textContent = titles[link.dataset.section];
    });
  });

  $('#loadBtn').addEventListener('click', loadRoster);
  $('#allPresentBtn').addEventListener('click', () => {
    roster.forEach((s) => marks.set(s.id, 'present'));
    renderRoster();
  });
  $('#submitBtn').addEventListener('click', saveAttendance);

  loadSessions();
});

async function loadRoster() {
  const branch = $('#tBranch').value;
  const semester = $('#tSem').value;
  const subject = $('#tSubject').value.trim();
  const date = $('#tDate').value;

  if (!subject) return toast('Enter a subject name first.', 'error');
  if (!date) return toast('Pick a date first.', 'error');

  try {
    const { students } = await api(`/api/students?branch=${encodeURIComponent(branch)}&semester=${semester}`);
    roster = students;
    marks = new Map();

    if (!roster.length) {
      $('#markCard').hidden = true;
      return toast(`No students found in ${branch} Sem ${semester}.`, 'error');
    }

    // If this session was marked before, restore those marks (so it can be edited)
    const { record } = await api(
      `/api/attendance/class?branch=${encodeURIComponent(branch)}&semester=${semester}` +
      `&subject=${encodeURIComponent(subject)}&date=${date}`
    );
    roster.forEach((s) => {
      const saved = record && record.entries.find((e) => e.studentId === s.id);
      marks.set(s.id, saved ? saved.status : 'present');
    });

    $('#markCard').hidden = false;
    renderRoster();
    if (record) toast('Existing session loaded — edit and re-save it.');
  } catch (err) { toast(err.message, 'error'); }
}

function renderRoster() {
  $('#classListTitle').textContent =
    `${$('#tBranch').value} · Semester ${$('#tSem').value} · ${$('#tSubject').value.trim()}`;
  $('#classListDate').textContent = $('#tDate').value;

  $('#studentList').innerHTML = roster.map((s) => {
    const status = marks.get(s.id);
    return `
      <div class="student-row">
        <div class="avatar sm">${escapeHTML(s.name.charAt(0).toUpperCase())}</div>
        <div class="student-info">
          <strong>${escapeHTML(s.name)}</strong>
          <span>${escapeHTML(s.rollNo || s.username)} · ${escapeHTML(s.branch)} Sem ${s.semester}</span>
        </div>
        <div class="toggle-group">
          <button class="toggle present ${status === 'present' ? 'on' : ''}" data-id="${s.id}" data-status="present">Present</button>
          <button class="toggle absent ${status === 'absent' ? 'on' : ''}" data-id="${s.id}" data-status="absent">Absent</button>
        </div>
      </div>`;
  }).join('');

  $('#studentList').querySelectorAll('.toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      marks.set(btn.dataset.id, btn.dataset.status);
      renderRoster();
    });
  });

  const p = roster.filter((s) => marks.get(s.id) === 'present').length;
  const a = roster.length - p;
  $('#markCounts').innerHTML =
    `<span class="pill pill-good">${p} Present</span> <span class="pill pill-bad">${a} Absent</span>`;
}

async function saveAttendance() {
  const entries = roster.map((s) => ({ studentId: s.id, status: marks.get(s.id) }));
  try {
    const res = await api('/api/attendance', {
      method: 'POST',
      body: JSON.stringify({
        branch: $('#tBranch').value,
        semester: $('#tSem').value,
        subject: $('#tSubject').value.trim(),
        date: $('#tDate').value,
        entries,
      }),
    });
    toast(res.message || 'Attendance saved.');
    loadSessions();
  } catch (err) { toast(err.message, 'error'); }
}

async function loadSessions() {
  try {
    const { sessions } = await api('/api/me/sessions');
    const tbody = $('#sessionsTable tbody');
    tbody.innerHTML = sessions.length ? sessions.map((s) => `
      <tr>
        <td>${s.date}</td>
        <td>${escapeHTML(s.branch)} · Sem ${s.semester}</td>
        <td>${escapeHTML(s.subject)}</td>
        <td>${s.present} / ${s.total}</td>
        <td><span class="pill pill-soft">${Math.round((s.present / s.total) * 100)}%</span></td>
      </tr>`).join('')
      : '<tr><td colspan="5" class="empty">No sessions marked yet.</td></tr>';
  } catch (err) { toast(err.message, 'error'); }
}