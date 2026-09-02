🎓 GLBITM Attendance Intelligence System
A production-ready, role-based Attendance Management System built forGL Bajaj Institute of Technology & Management, Greater Noida — supporting7 programs (B.Tech ×9 branches, BCA, BBA, MCA, MBA, PGDM, M.Tech) withanti-proxy smart marking, analytics, and a real SQLite database.

Live Demo

NodeExpressSQLitePWALicense

📸 Screenshots
Apne project ke screenshots lena hai to: screenshot lo → screenshots/ naam ka folder banao → images daalo → niche ke paths sahi kar do. (Optional hai — chaho to ye section abhi chhod do.)

Login	Student Analytics
Login	Student
Teacher Marking	Rotating QR Self-Mark
Teacher	QR
✨ Feature Highlights (45+)
Category	Features
Roles	Admin · Teacher · Student · Parent (read-only child view)
Marking	Manual Present/Late/Absent, ⌨️ keyboard shortcuts, 🎙️ voice commands, 🎲 random student picker, 📝 session notes
Anti-Proxy Self-Marking	⏱️ Rotating QR code (30s, TOTP-style) · 📍 GPS geo-fencing (~800m campus radius) · device/IP proxy detection · 🤳 selfie proof · 🧠 face recognition
Analytics	📊 Doughnut & trend charts · 🔥 streaks · 🏅 badges · 🏆 leaderboard · 🧠 pattern detection ("aapke Mondays me sabse zyada absent") · 🔮 risk prediction · 🧮 what-if calculator · 📈 attendance↔marks correlation scatter plot
Academic	🗓️ Timetable manager + 🔄 teacher substitution · 🏛️ holiday calendar · 🎓 bulk promotion · 📝 marks module (MST/Quiz) · Sections A/B/C · ⚙️ configurable attendance threshold
Workflows	📝 Leave applications (casual/medical/duty) · ⚠️ attendance correction requests · 📢 announcements with email blast
Reports	📅 custom date-range · 📊 Excel export (BOM) · 🖨️ Print/Save-as-PDF · 📋 classic monthly register (printable grid) · 👨‍🏫 teacher workload · 📉 subject-wise stats · 📧 defaulter email alerts
Security	scrypt password hashing · 🔐 2FA (email OTP) · login rate-limiting (5 fails = 15min lock) · ⏳ 24-hour edit-lock on old sessions · full 📜 audit log · persistent DB sessions
Platform	📲 PWA (mobile-installable, offline shell) · ⌨️ Ctrl+K command palette · 🌐 Hindi/English toggle · 🌙 dark/light mode · 🔍 live table search
Integrations	📶 RFID/biometric hardware endpoint · 🧾 verified attendance certificates (public /verify/:id page with QR) · nodemailer SMTP emails
🏗️ Tech Stack
Layer	Technology
Backend	Node.js 22.5+, Express.js
Database	SQLite via node:sqlite (zero extra install — single file DB)
Auth	scrypt password hashing + token sessions (7-day, DB-persisted)
Frontend	Vanilla JS SPA, glassmorphism UI, Space Grotesk/Inter
Charts & QR	Chart.js 4, QRCode.js
Face Recognition	face-api.js (TinyFaceDetector + 128-d descriptors)
PWA	Service Worker + Web App Manifest
Why SQLite? Zero-configuration, single-file, real SQL (joins, indexes, transactions) — production-grade se bina kisi external DB server ke.

🚀 Quick Start (Local)
git clone https://github.com/naitikgupta-gtb/glbitm-attendance-system.gitcd glbitm-attendance-system npm install npm start
Open → http://localhost:3000 (busy port pe auto-shift: 3001, 3002…)

⚠️ Requires Node.js 22.5+ (built-in node:sqlite). Download: https://nodejs.org

🧪 Demo Accounts
Role	Username	Password	Notes
👑 Admin	admin	admin123	Full console
🧑‍🏫 Teacher	arjun	teach123	B.Tech CSE, subject-restricted
🧑‍🎓 Student	riya	stud123	B.Tech CSE Sem 3 — seeded data
👨‍👩‍👧 Parent	(admin banata hai)	—	Students table → 👨‍👩‍👧 button
Fresh start pe database khud demo data seed karta hai. Purana data/ folder delete karo = factory reset.

⚙️ Environment Variables (sab optional)
Variable	Default	Purpose
PORT	3000	Server port
NODE_VERSION	—	Render/Railway pe 22 set karo (zaroori)
SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM / SMTP_SECURE	console mode	Real emails: 2FA OTP, defaulter alerts, announcements
GL_CAMPUS_LAT	28.4702	Geo-fence center latitude (GLBITM)
GL_CAMPUS_LNG	77.6718	Geo-fence center longitude
GL_CAMPUS_RADIUS	800	Allowed radius in meters
HARDWARE_KEY	demo-hardware-key	RFID hardware endpoint auth
📡 RFID / Biometric Hardware Endpoint
Koi bhi USB RFID reader (keyboard-emulation mode) ya biometric device ye API hit kar sakta hai:

curl -X POST https://glbitm-attendance.onrender.com/api/hardware/rfid  \  -H "X-Device-Key: demo-hardware-key" \  -H "Content-Type: application/json" \  -d '{"cardId":"CARD-001","program":"B.Tech","branch":"CSE","semester":3,"section":"A","subject":"DBMS"}'
🔑 API Overview
Method	Endpoint	Role	Kaam
POST	/api/login	—	Login (2FA support)
POST	/api/login/verify	—	OTP verify
GET	/api/me/attendance	student	Own stats (date-range support)
POST	/api/selfmark/open	teacher	Rotating-QR session start
POST	/api/selfmark/mark	student	Self-mark (code+geo+face+proxy checks)
POST	/api/attendance	teacher	Manual attendance save
GET	/api/reports/overall	admin	Global report (date-range)
GET	/api/register	teacher/admin	Monthly register grid
POST	/api/leaves	student	Leave apply
POST	/api/corrections/:id/decide	admin	Correction approve/reject
POST	/api/marks/bulk	teacher	Marks entry
GET	/api/admin/backup	admin	Full JSON backup
GET	/verify/:id	public	Certificate verification page
POST	/api/hardware/rfid	device-key	RFID tap marking
📁 Project Structure
glbitm-attendance-system/├── server.js                 # Express API + SQLite schema + all business logic├── package.json├── data/                     # (gitignored) SQLite DB + selfie proofs├── public/│   ├── index.html            # SPA shell (glassmorphism UI)│   ├── app.js                # All frontend logic (routing, dashboards, i18n)│   ├── manifest.json         # PWA manifest│   ├── sw.js                 # Service worker (offline shell)│   ├── icon.svg│   └── assets/               # logo.png, campus.jpg (custom branding)
🚢 Deployment
Live deployed on Render → https://glbitm-attendance-system.onrender.com/

Deployment guide (Render / Railway / Oracle VPS — step by step): DEPLOYMENT.md

Quick summary:

Platform	Free?	DB Persistent?	Best for
Render	✅	❌ (redeploy pe reset — backup/restore use karo)	Demo, presentations
Railway	$5 credit	✅ (Volume attach karo)	Semi-production
Oracle VPS	✅ lifetime	✅	Real production
🧪 Suggested Demo Flow (2 minutes)
Teacher (arjun) login → class load → 📲 Open Rotating-QR Self-Marking → QR screen
Student (phone pe riya) → Self Mark → session+code → GPS allow → ✅ marked (teacher ki screen pe live dikhega)
Ek student galt code daalne ki koshish kare / bahar khade ho ke → 🚫 rejected (rotating + geo-fence)
Student dashboard → charts, streak, 🧠 patterns, 🧾 certificate → QR scan se /verify/:id
Admin → defaulters + 🔮 risk prediction → 📋 monthly register print → 💾 backup
🛣️ Future Scope
Google OAuth (college Gmail) login
Twilio SMS/WhatsApp alerts to parents
BLE beacon-based automatic attendance
Multi-college SaaS architecture
📄 License
MIT — free to use, modify aur apne college me deploy karne ke liye.

👨‍💻 Author
Your Name — GL Bajaj Institute of Technology & Management, Greater Noida

GitHub: @naitikgupta-gtb
LinkedIn: Naitik Kumar Gupta
