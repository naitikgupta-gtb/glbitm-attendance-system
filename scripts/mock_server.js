/* Mock API + static server — sirf UI preview/testing ke liye (production me use nahi hota) */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'public');
const PORT = process.env.MOCK_PORT || 8901;

const ADMIN = { id: 'u1', name: 'Naitik Gupta', username: 'admin', role: 'admin', email: 'admin@glbitm.ac.in' };

const REPORT = [
  { name: 'Aarav Sharma', rollNo: '2214401', program: 'B.Tech', branch: 'CSE', semester: 3, section: 'A', total: 120, attended: 114, percentage: 95 },
  { name: 'Diya Patel', rollNo: '2214402', program: 'B.Tech', branch: 'CSE', semester: 3, section: 'A', total: 118, attended: 109, percentage: 92.4 },
  { name: 'Rohan Verma', rollNo: '2214403', program: 'B.Tech', branch: 'CSE', semester: 3, section: 'B', total: 120, attended: 101, percentage: 84.2 },
  { name: 'Sneha Yadav', rollNo: '2214404', program: 'B.Tech', branch: 'IT', semester: 3, section: 'A', total: 115, attended: 82, percentage: 71.3 },
  { name: 'Priya Gupta', rollNo: '2214406', program: 'BCA', branch: 'General', semester: 3, section: 'AI-1', total: 105, attended: 68, percentage: 64.8 },
  { name: 'Karan Singh', rollNo: '2214405', program: 'B.Tech', branch: 'IT', semester: 5, section: 'B', total: 110, attended: 52, percentage: 47.3 },
];

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json' };

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
      if (p === '/api/login') return send({ token: 'mock-token-123', user: ADMIN });
      if (p === '/api/me') return send({ user: ADMIN });
      if (p === '/api/settings') return send({ sections: ['A', 'B', 'C', 'AI-1'], threshold: 75, academicYear: '2026-27', dwr: { compileTime: '16:30', periods: 7 } });
      if (p === '/api/announcements') return send({ items: [{ id: 'a1', title: 'Science Exhibition — Friday', body: 'Register by Wednesday in the lab block.', ts: '2026-10-30T10:00:00.000Z' }] });
      if (p === '/api/reports/summary') return send({ threshold: 75, totalStudents: 1247, totalTeachers: 86, sessionsMarked: 3184, overallPercentage: 87.3 });
      if (p === '/api/reports/overall') return send({ report: REPORT });
      if (p === '/api/users') return send({ users: [ADMIN, { id: 'u2', name: 'S. Kapoor', username: 'skapoor', role: 'admin' }] });
      console.log('[mock] unmatched:', req.method, p);
      return send({ items: [], report: [], users: [], sessions: [], students: [], teachers: [], user: ADMIN, threshold: 75 });
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
