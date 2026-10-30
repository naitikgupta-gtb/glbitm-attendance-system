# GLBITM Attendance Intelligence System

Production-ready, role-based **Attendance Management System** for **G.L. Bajaj Institute of Technology & Management, Greater Noida** — 7 programs (B.Tech ×9 branches, BCA, BBA, MCA, MBA, PGDM, M.Tech), anti-proxy self-marking, Daily Work Reports, Student Progress Reports, year rollover + alumni archive, and a persistent cloud PostgreSQL database.

**Live:** https://glbitm-attendance-system.onrender.com · **Version:** v9.3

---

## Features

### Core attendance (v8)
- **4 roles** — Admin · Teacher · Student · Parent (read-only child view)
- Manual Present/Late/Absent marking with keyboard shortcuts and voice commands
- **Anti-proxy self-marking** — rotating QR code (30 s), GPS geo-fencing (~800 m campus radius), device/IP proxy detection, selfie proof, optional face recognition
- Analytics — trend charts, streaks, badges, leaderboard, pattern detection, risk prediction, what-if calculator
- Timetable manager + teacher substitution, holiday calendar, bulk promotion
- Leave applications, correction requests, announcements, monthly printable register
- Excel/CSV export, print/PDF, certificates with public `/verify/:id` page
- RFID/biometric hardware endpoint (`/api/hardware/rfid`)
- PWA (installable, offline shell), Ctrl+K command palette, Hindi/English, light/dark
- Security — scrypt hashing, email-OTP 2FA, login rate-limiting, 24 h edit-lock, audit log

### v9 additions
- **Daily Work Report (DWR)** — teacher fills a 1-minute report after every period (present count auto-filled, topics taught, assignment + due date). After **4:30 PM IST** each class's 7 periods compile into one report for the Principal (dashboard + printable + CSV).
- **Student Progress Report (SPR)** — per subject × student: ST/PUT scores, Absent/Debarred status, internal marks (**converted out of 25**, weights configurable in Admin → Settings), assignments submitted, attendance %. Students see only assignment counts — scores stay teacher-only.
- **Assignments** — teachers create per class, track `submitted X/Y` counts.
- **Year Rollover wizard** — semester +1 for everyone, final-year students graduate to **alumni**, academic year label advances (backup first!).
- **Alumni & past-batch archive** — search any past student by name/roll and open their full record (marks, attendance, results) years after graduation.
- **Institutional UI** — deep navy + GL Bajaj maroon, solid surfaces, flat register-style tables, print-first.

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Backend | Node.js 22, Express |
| Database | **PostgreSQL (Supabase)** via `postgres` driver — schema auto-migrates on boot |
| Auth | scrypt password hashing, DB-persisted token sessions (7 days), email OTP 2FA |
| Email | nodemailer SMTP (optional — console fallback without env vars) |
| Frontend | Vanilla JS SPA, Chart.js 4, QRCode.js, SheetJS, face-api.js |
| PWA | Service worker + manifest |
| Deploy | Render (free) + Supabase (free) + cron-job.org keep-alive |

## Quick start (local)

```bash
git clone https://github.com/naitikgupta-gtb/glbitm-attendance-system.git
cd glbitm-attendance-system
npm install
DATABASE_URL="postgres://user:pass@host:5432/db" npm start
```

Open http://localhost:3000. All tables and columns are created automatically on first boot.

**Demo data:** run with `SEED_DEMO=1` **only on an empty local database**. Never set it on Render — it re-runs the seed against your live data.

| Role | Username | Password |
| --- | --- | --- |
| Admin | admin | admin123 |
| Teacher | arjun | teach123 |
| Student | riya | stud123 |

First boot on a fresh DB (without seed) shows a **setup wizard** to create the first admin.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | Supabase/Postgres connection string |
| `NODE_VERSION` | on Render | `22` |
| `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASS` | optional | Real emails: OTP 2FA, defaulter alerts, announcements, leave decisions. Without them emails log to console and OTP shows as a dev code on screen. Gmail: use an **App Password** with `SMTP_PORT=465`. |
| `SMTP_FROM` | optional | Custom From address (defaults to `SMTP_USER`) |
| `GL_CAMPUS_LAT` / `GL_CAMPUS_LNG` / `GL_CAMPUS_RADIUS` | optional | Geo-fence (defaults: GLBITM campus, 28.4702 / 77.6718 / 800 m) |
| `HARDWARE_KEY` | optional | RFID device endpoint key (default `demo-hardware-key`) |
| `SEED_DEMO` | local only | `1` seeds demo data. **Do not set in production.** |

## Deployment (Render + Supabase)

1. **Supabase** → new project → copy the connection string (Session pooler works) → `DATABASE_URL`.
2. **Render** → New Web Service → connect this repo → Build `npm install`, Start `npm start` → add `DATABASE_URL` and `NODE_VERSION=22`.
3. **Keep-alive cron** (free tier sleeps after 15 min idle, Supabase pauses after 7 days of inactivity):
   - [cron-job.org](https://cron-job.org) → every 5 min → `GET https://<your-app>.onrender.com/health` (hitting `/health` also counts as DB activity, keeping both awake).
   - Backup monitor: [UptimeRobot](https://uptimerobot.com) → HTTP monitor → same URL → 5 min interval.
4. Verify after deploy:

```bash
node scripts/smoke.js https://<your-app>.onrender.com
node scripts/smoke.js https://<your-app>.onrender.com admin yourpassword
```

The smoke test checks `/health`, the SPA shell, security headers, login, and role-based endpoints (DWR, archive, assignments) — exit code `0` means all good.

## API overview (v9 endpoints in bold)

| Method | Endpoint | Role | Purpose |
| --- | --- | --- | --- |
| POST | `/api/login`, `/api/login/verify` | — | Login (+ 2FA OTP) |
| POST | `/api/attendance` | teacher | Save attendance |
| POST | `/api/selfmark/open` / `/api/selfmark/mark` | teacher / student | Rotating-QR self-marking |
| GET | `/api/reports/overall`, `/api/register` | admin / teacher | Reports, monthly register |
| **GET** | **`/api/dwr/mine`** | teacher | Today's periods from timetable + filled status |
| **POST** | **`/api/dwr`** | teacher | Save one period's work report |
| **GET** | **`/api/dwr/day`** · **`/api/dwr/principal`** · **`/api/dwr/principal.csv`** | teacher / admin | Class day sheet · Principal 4:30 PM compiled view + CSV |
| **POST** | **`/api/dwr/compile`** | admin | Manual compile trigger |
| **GET/POST** | **`/api/assignments`** (+ `/mine`, `/child`, `/:id/submissions`) | teacher / student / parent | Assignments & submission counts |
| **GET** | **`/api/progress/class`** (+ `.csv`, `/student`, `/mine`) | teacher / admin / student | SPR — internal marks out of 25 |
| **GET** | **`/api/archive/batches`** · **`/api/archive/students`** · **`/api/archive/student/:id`** | admin | Alumni & past-batch search |
| POST | `/api/admin/rollover` | admin | Year-end semester+1 / graduate wizard |
| POST | `/api/hardware/rfid` | device key | RFID tap marking |
| GET | `/health` | — | Uptime + DB check |

## Project structure

```
glbitm-attendance-system/
├── server.js            # Express API, schema auto-migration, all business logic
├── scripts/smoke.js     # Post-deploy smoke test (zero dependencies)
├── public/
│   ├── index.html       # SPA shell (institutional navy/maroon theme, inline CSS)
│   ├── app.js           # Frontend logic — routing, dashboards, DWR/SPR/archive UI
│   ├── sw.js, manifest.json, icon.svg, assets/
│   └── (legacy teacher/student/admin.html demo shells, unused)
└── package.json
```

## Changelog

- **v9.3** — Real SMTP email (nodemailer, console fallback), security headers, JSON error handling, post-deploy smoke test, README rewrite.
- **v9.2** — Institutional UI redesign: navy + maroon, flat tables, no glassmorphism, text nav, light default.
- **v9.1** — SPR (internal /25 + weights in settings), assignments tracking, year rollover wizard, alumni archive.
- **v9.0** — Daily Work Report: per-period teacher reports, 4:30 PM IST compiled Principal view, CSV, print.
- **v8.6** — Admin promote/demote with last-admin protection, self profile edit.

## License

MIT — free to use, modify and deploy in your college.

**Author:** Naitik Kumar Gupta — [@naitikgupta-gtb](https://github.com/naitikgupta-gtb) · G.L. Bajaj Institute of Technology & Management, Greater Noida
