/* Mock API + static server — sirf UI preview/testing ke liye (production me use nahi hota).
   Role-aware: /api/me returns admin/teacher/student based on the page Referer,
   so admin.html / teacher.html / student.html sab preview ho sakte hain. */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'public');
const PORT = process.env.MOCK_PORT || 8901;

const USERS = {
  admin: { id: 'u1', name: 'Naitik Gupta', username: 'admin', role: 'admin', email: 'admin@glbitm.ac.in' },
  teacher: { id: 't1', name: 'Dr. Meera Kapoor', username: 'm.kapoor', role: 'teacher', branch: 'CSE', email: 'm.kapoor@glbitm.ac.in' },
  student: { id: 's1', name: 'Aarav Sharma', username: 'aarav.sh', role: 'student', branch: 'CSE', semester: 3, rollNo: '2214401' },
};

const STUDENTS = [
  { id: 's1', name: 'Aarav Sharma', username: 'aarav.sh', rollNo: '2214401', branch: 'CSE', semester: 3 },
  { id: 's2', name: 'Diya Patel', username: 'diya.p', rollNo: '2214402', branch: 'CSE', semester: 3 },
  { id: 's3', name: 'Rohan Verma', username: 'rohan.v', rollNo: '2214403', branch: 'CSE', semester: 3 },
  { id: 's4', name: 'Sneha Yadav', username: 'sneha.y', rollNo: '2214404', branch: 'CSE', semester: 3 },
  { id: 's5', name: 'Kabir Singh', username: 'kabir.s', rollNo: '2214405', branch: 'CSE', semester: 3 },
  { id: 's6', name: 'Ishita Rao', username: 'ishita.r', rollNo: '2214406', branch: 'CSE', semester: 3 },
];

const TEACHERS = [
  { id: 't1', name: 'Dr. Meera Kapoor', username: 'm.kapoor', branch: 'CSE' },
  { id: 't2', name: 'Prof. Arun Malhotra', username: 'a.malhotra', branch: 'CSE' },
  { id: 't3', name: 'Prof. Nisha Agarwal', username: 'n.agarwal', branch: 'ECE' },
  { id: 't4', name: 'Dr. Vivek Chandra', username: 'v.chandra', branch: 'MECH' },
];

const REPORT = [
  { rollNo: '2214401', name: 'Aarav Sharma', branch: 'CSE', semester: 3, total: 120, present: 114, absent: 6, percentage: 95 },
  { rollNo: '2214402', name: 'Diya Patel', branch: 'CSE', semester: 3, total: 118, present: 109, absent: 9, percentage: 92.4 },
  { rollNo: '2214403', name: 'Rohan Verma', branch: 'CSE', semester: 3, total: 120, present: 101, absent: 19, percentage: 84.2 },
  { rollNo: '2214404', name: 'Sneha Yadav', branch: 'IT', semester: 3, total: 115, present: 82, absent: 33, percentage: 71.3 },
  { rollNo: '2214405', name: 'Karan Singh', branch: 'IT', semester: 5, total: 110, present: 52, absent: 58, percentage: 47.3 },
  { rollNo: '2214406', name: 'Priya Gupta', branch: 'BCA', semester: 3, total: 105, present: 68, absent: 37, percentage: 64.8 },
];

const SESSIONS = [
  { date: '2026-11-04', branch: 'CSE', semester: 3, subject: 'Data Structures', present: 58, total: 62 },
  { date: '2026-11-04', branch: 'CSE', semester: 3, subject: 'DBMS', present: 55, total: 62 },
  { date: '2026-11-03', branch: 'CSE', semester: 3, subject: 'Operating Systems', present: 60, total: 61 },
  { date: '2026-11-03', branch: 'CSE', semester: 3, subject: 'Computer Networks', present: 49, total: 62 },
  { date: '2026-11-02', branch: 'CSE', semester: 3, subject: 'Engineering Mathematics', present: 57, total: 60 },
];

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json' };

function roleOf(req) {
  const ref = req.headers.referer || '';
  if (ref.includes('teacher.html')) return 'teacher';
  if (ref.includes('student.html')) return 'student';
  return 'admin';
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname;

  if (p.startsWith('/api/') || p.startsWith('/verify/')) {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      let data = {};
      try { data = body ? JSON.parse(body) : {}; } catch {}
      const send = (obj) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
      const role = roleOf(req);

      if (p === '/api/login') {
        let r = 'admin';
        const un = String(data.username || '');
        if (/riya|stud/i.test(un)) r = 'student';
        else if (/arjun|m\.kapoor|teach/i.test(un)) r = 'teacher';
        return send({ token: 'mock-token-123', user: USERS[r] });
      }
      if (p === '/api/me') return send({ user: USERS[role] });
      if (p === '/api/logout') return send({ ok: true });
      if (p === '/api/settings') return send({ sections: ['A', 'B', 'C'], threshold: 75, academicYear: '2026-27' });
      if (p === '/api/reports/summary') return send({ threshold: 75, totalStudents: 1247, totalTeachers: 86, sessionsMarked: 3184, overallPercentage: 87.3 });
      if (p === '/api/reports/overall') return send({ report: REPORT });
      if (p === '/api/users' && u.searchParams.get('role') === 'student') return send({ users: STUDENTS });
      if (p === '/api/users' && u.searchParams.get('role') === 'teacher') return send({ users: TEACHERS });
      if (p === '/api/users' && req.method === 'POST') return send({ ok: true, message: 'User created.' });
      if (p.startsWith('/api/users/') && req.method === 'DELETE') return send({ ok: true });
      if (p === '/api/students') return send({ students: STUDENTS });
      if (p === '/api/attendance/class') return send({ record: null });
      if (p === '/api/attendance') return send({ ok: true, message: `Attendance saved for ${STUDENTS.length} students.` });
      if (p === '/api/me/sessions') return send({ sessions: SESSIONS });
      if (p === '/api/me/attendance') {
        return send({
          percentage: 87, present: 167, absent: 25, total: 192,
          subjects: [
            { subject: 'Data Structures', percentage: 95, present: 38, total: 40 },
            { subject: 'DBMS', percentage: 91, present: 32, total: 35 },
            { subject: 'Operating Systems', percentage: 88, present: 29, total: 33 },
            { subject: 'Computer Networks', percentage: 79, present: 35, total: 44 },
            { subject: 'Engineering Mathematics', percentage: 62, present: 21, total: 34 },
          ],
          logs: SESSIONS.flatMap((s) => [
            { date: s.date, subject: s.subject, status: 'present' },
            { date: s.date, subject: s.subject, status: 'absent' },
          ]),
        });
      }
      console.log('[mock] unmatched:', req.method, p, '(role:', role + ')');
      return send({ items: [], report: [], users: [], sessions: [], students: [], teachers: [], user: USERS[role], threshold: 75 });
    });
    return;
  }

  let f = path.join(ROOT, p === '/' ? 'index.html' : decodeURIComponent(p));
  if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(buf);
  });
});

server.listen(PORT, () => console.log(`mock server on http://localhost:${PORT}`));
