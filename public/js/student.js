document.addEventListener('DOMContentLoaded', async () => {
  const me = await guard('student');
  if (!me) return;

  $('#userName').textContent = me.name;
  $('#avatar').textContent = me.name.charAt(0).toUpperCase();
  $('#classBadge').textContent = `${me.branch || '—'} · Semester ${me.semester ?? '—'}`;
  $('#logoutBtn').addEventListener('click', logout);

  const stats = await api('/api/me/attendance');

  // --- Overall ring ---
  $('#ringFg').style.strokeDashoffset = 100 - stats.percentage;
  $('#ringFg').classList.add(pctClass(stats.percentage));
  $('#ringPct').textContent = stats.percentage + '%';
  $('#statPresent').textContent = stats.present;
  $('#statAbsent').textContent = stats.absent;
  $('#statTotal').textContent = stats.total;

  const msg = $('#ringMsg');
  if (!stats.total) {
    msg.textContent = 'No attendance marked yet — check back once your teachers take attendance.';
  } else if (stats.percentage >= 75) {
    msg.textContent = 'You are comfortably above the 75% requirement. Keep it up! 🎉';
  } else {
    const need = Math.max(0, Math.ceil(3 * stats.total - 4 * stats.present));
    msg.textContent = `Below the 75% requirement — attend the next ${need} classes (all present) to get back on track.`;
  }

  // --- Subject-wise breakdown ---
  $('#subjectList').innerHTML = stats.subjects.length
    ? stats.subjects.map((s) => `
      <div class="subject-item">
        <div class="subject-head">
          <strong>${escapeHTML(s.subject)}</strong>
          <span class="pill pill-${pctClass(s.percentage)}">${s.percentage}%</span>
        </div>
        <div class="bar"><div class="bar-fill ${pctClass(s.percentage)}" style="width:${s.percentage}%"></div></div>
        <span class="muted small">${s.present} of ${s.total} classes attended</span>
      </div>`).join('')
    : '<p class="empty">No subject data yet.</p>';

  // --- Recent log ---
  $('#logTable tbody').innerHTML = stats.logs.length
    ? stats.logs.slice(0, 25).map((l) => `
      <tr>
        <td>${l.date}</td>
        <td>${escapeHTML(l.subject)}</td>
        <td><span class="pill ${l.status === 'present' ? 'pill-good' : 'pill-bad'}">${l.status === 'present' ? 'Present' : 'Absent'}</span></td>
      </tr>`).join('')
    : '<tr><td colspan="3" class="empty">No records yet.</td></tr>';
});