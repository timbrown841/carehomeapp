# Care Companion — PRD

## Problem Statement
A simple and fast care management app for children's homes and supported living. Staff can log incidents and daily notes quickly using voice or simple inputs. The system helps reduce admin time and improve safeguarding with clear reports for managers.

## Architecture
- **Backend**: FastAPI + MongoDB (motor). JWT bearer auth (bcrypt). All routes prefixed `/api`.
- **Frontend**: React 19 + Tailwind + Shadcn UI + Sonner (toasts). Axios with token interceptor.
- **AI**:
  - **OpenAI Whisper (`whisper-1`)** via `emergentintegrations.llm.openai.OpenAISpeechToText` for voice → text.
  - **OpenAI GPT-5.2** via `emergentintegrations.llm.chat.LlmChat` for manager safeguarding summaries.
- **Auth**: Custom email/password JWT (12h). Roles: staff / manager / admin. Seeded on startup.

## Personas
- **Staff** — On-the-floor carers; logs daily notes & incidents (often by voice).
- **Manager** — Reviews safeguarding flags; generates AI reports; manages residents.
- **Admin** — Full system control (manage users, delete records).

## Core Requirements (static)
1. Email/password login with role-based access.
2. Quick voice or text capture for daily notes & incidents.
3. Mandatory safeguarding flag on incidents.
4. Manager-only AI summary reports across date ranges/residents.
5. Audit-friendly: every entry timestamped + author tagged.

## Implemented (2026-05-04)
- JWT auth + 3 seeded users (admin / manager / staff).
- Resident CRUD with role gating.
- Daily notes (CRUD-light) with voice transcription.
- Incidents with severity, category, safeguarding flag, action taken, status (open/reviewed/closed).
- Voice recording component (MediaRecorder → Whisper).
- Dashboard with stats + recent items.
- AI-generated safeguarding reports (GPT-5.2) — period & per-resident scope.
- Role-aware sidebar (Reports hidden from staff).
- Responsive, organic-earthy themed UI (Manrope/DM Sans, NO purple).
- Tested: 17/17 backend pytest + Playwright e2e at 100%.

## Implemented (2026-05-05)
- Branded as **Safelyn Systems** with full design tokens, server-side PDFs (QR + audit hash) for incidents and reports.
- Voice-first Log Incident screen; AI structuring with section-numbered output.
- Sticky Log Incident FAB and action-driven Risk Overview on Dashboard.
- Supervisions module + compliance counters; mocked DSL/manager notifications.
- Auto-reseeded demo dataset on backend startup with realistic residents/incidents/notes.
- **Markdown rendering fix** for AI reports — `renderRich()` helper now bolds `**…**` markers in LogIncident & IncidentDetail (resolves iteration-11 bug).
- **Comprehensive Resident Profile page** with 10 tabs (Overview, Background & Referral, Risk Assessment, Care Plan, Missing/Philomena, Medical & Medication, MAR/Meds, Body Maps, Documents, Timeline). RAG risk pill, overdue review warning, professional contacts, emergency contacts.
- **Safelyn Rapid Response Pack** for missing-from-care:
  - One-tap "Child Missing" button on resident profile opens modal capturing last-seen detail.
  - Auto-creates a high-severity safeguarding incident on the resident timeline.
  - Generates a police-ready PDF (`/api/missing/{id}/pdf`) with photo placeholder, physical description, known places/associates/family/triggers, risk summary, medical alerts, recent incidents and emergency contacts.
  - Secure, no-auth share link `/missing/share/{token}` for police/social workers/managers — both JSON + PDF.
  - Quick actions: Call 999, Notify Manager, Notify DSL, Download PDF.
  - Episode timeline tracking: reported missing, police notified, returned (one-tap loggers).
- Backend: extended `Resident` model with 30+ optional profile fields, new `missing_episodes` collection with token-secured public sharing.
- **Medication / MAR module** (iter-13):
  - Resident MAR tab with daily schedule, one-tap GIVE / REFUSED / WITHHELD, PRN log, allergy banner, witness modal for witness-required meds, weekly MAR PDF (landscape A4 grid with status legend).
  - Cross-home `/medications` round page grouping all due doses by time slot.
  - Witness-required flag enforced on backend; accepts witness_name (free-text) for staff who can't see the user list.
- **Body Maps module** (iter-13):
  - Front + back anatomical SVG silhouettes; tap-to-mark; per-mark type/severity/region/description; healing notes.
  - Resident profile tab listing all body-map records chronologically.
  - Demo seed: Leo Martinez right-knee scratch.
- **Ofsted Readiness scorecard** (iter-13):
  - Replaces previous placeholder. Live aggregate 0-100 score donut + 6 sub-sections (medication, risk reviews, daily notes, supervisions, safeguarding response, missing-from-care).
  - Each section shows top issues + "Fix this" deep link. Auto-updates with current state.

## Implemented (2026-05-06 · iter-15)
- **UI overhaul to ClearCare-grade clinical SaaS**: dropped Fraunces serif headings → **Inter throughout** (SemiBold for headings, Regular body, Bold for stats). Deeper inks (`#0F1115` body, `#0E3B4A` brand). Off-white canvas. Sharper card borders + global subtle box-shadow on every `.divider-soft.rounded-2xl/.rounded-xl` card. Reduced page heading from text-4xl/font-black to text-3xl/font-semibold across all pages. Editorial vibe replaced by operational SaaS clarity.
- **Inspection Bundle PDF** (`GET /api/ofsted/inspection-bundle/pdf`, manager+admin only): single-PDF cover-page scorecard + last 30 days incidents + active medications snapshot + recent missing episodes + audit hash. New "Inspection Bundle PDF" button on the Ofsted Readiness page.
- **Staff Rotas & Training module** (`/staff` — replaces ComingSoon):
  - **Rota tab**: live "On shift now" panel + week schedule with date-range pickers; manager can add/delete shifts.
  - **Training matrix tab**: 4 RAG summary cards (Current / Expiring / Expired / Missing) + cross-staff matrix table with course-level expiry RAG (Safeguarding L3, First Aid at Work, Medication Administration, DBS Check, Fire Safety, Restrictive Practice). Manager can record new training.
  - Backend: `/api/staff` (list), `/api/shifts`, `/api/shifts/now`, `/api/shifts/{id}`, `/api/trainings`, `/api/trainings/matrix`. Demo seed produces a fully populated matrix including an expired First Aid record on Sarah Manager so the RAG palette is fully visible.

## Implemented (2026-05-06 · iter-16)
- **Statutory Visits & LAC Reviews module**: full CRUD via `/api/visits` (GET with `resident_id` / `upcoming` / `overdue` filters, POST, PATCH for status, DELETE manager+admin only). 7 visit kinds (LAC review, IRO, social-worker, Reg 44/45, Ofsted, other). Standalone `/visits` page with All/Upcoming/Overdue/Completed filter tabs, schedule modal, Complete/Missed actions, overdue red-line indicator, and a per-resident **Statutory Visits** tab on the Resident Detail page (`/components/resident/VisitsTab.jsx`) showing Upcoming/Overdue/Completed counts scoped to that resident.
- **Dashboard urgency strip** (`UrgencyWidgets`): 6 live tiles fed by `GET /api/dashboard/urgency` (open safeguarding, currently missing, risk reviews overdue, missed doses 24h, statutory visits overdue, visits next 14d) with auto-tinted RAG/blue tones.
- **Quick Actions strip** (`QuickActions`): Log Incident, Medication Round, Schedule Visit, Care Note, Add Resident — operational entry points right under the urgency cards.
- **Sidebar restructure**: navigation grouped into 4 sections — Overview / Care / Compliance / Team — with consistent sub-headers, active-state pill, persistent user card with logout, role-gated `Reports` link.
- **ResidentBadges component** (`/api/residents/{id}/badges`): per-resident priority pills computed from current state (High Risk, Risk Review Overdue, Missing Risk, Self-Harm Risk, Substance Use, Currently Missing, Allergy, Recent Safeguarding, PEP Overdue, Immunisation Overdue) injected into Residents list cards.
- Tested: backend 18/18 pytest, all critical frontend flows (login, dashboard widgets, /visits CRUD + filters, sidebar role gating, residents badges, resident-detail visits tab) — see `/app/test_reports/iteration_16.json`.

## Backlog (next-up)
### P0 — User-confirmed sequential plan ("everything ClearCare has, but better"):
1. ✅ ~~Health & Wellbeing~~ (iter-14)
2. ✅ ~~Education / PEP tracking~~ (iter-14)
3. ✅ ~~Staff Rotas & Training~~ (iter-15)
4. **Statutory Visits & LAC Reviews** — IRO visits, social-worker visits, LAC review schedule with overdue alerts
5. **Pocket Money & Personal Allowance** — running balance, sign-out, ledger, monthly statement
6. **Document Library** — upload PDFs, tag to resident/staff, version history, expiry reminders
7. **Communications / Handover Log** — shift handover with voice, read-receipts
8. **Audit Log** — every edit/delete/login captured; filterable for inspections
9. **Vehicle / Activities Log** — mileage, activity sign-off, photos

### Other backlog
- Inline edit of resident profile fields (PATCH endpoint already wired)
- Document upload + version history (Documents tab is currently a placeholder)
- Real Email/SMS alerts via Twilio + Resend (currently MOCKED)
- Refactor `ResidentDetail.jsx` (~1100 lines) into more `/components/resident/*` files
- Photo upload + thumbnails for the Missing Pack PDF
- Return-interview capture on closing a missing episode
- CSV export of incidents/notes for inspections
- Admin User Management UI
- Incident trend charts per resident
- Witness picker — replace free-text witness with real staff selection (uses /auth/users; staff-role read access required)

## Test Credentials
See `/app/memory/test_credentials.md`.
nurse reviews
2. **Education / PEP tracking** — school, attendance %, PEP dates, exclusions, achievements
3. ✅ ~~Staff Rotas & Training~~ (iter-15)
4. **Statutory Visits & LAC Reviews** — IRO visits, social-worker visits, LAC review schedule with overdue alerts
5. **Pocket Money & Personal Allowance** — running balance, sign-out, ledger, monthly statement
6. **Document Library** — upload PDFs, tag to resident/staff, version history, expiry reminders
7. **Communications / Handover Log** — shift handover with voice, read-receipts
8. **Audit Log** — every edit/delete/login captured; filterable for inspections
9. **Vehicle / Activities Log** — mileage, activity sign-off, photos

### Other backlog
- Inline edit of resident profile fields (PATCH endpoint already wired)
- Document upload + version history (Documents tab is currently a placeholder)
- Real Email/SMS alerts via Twilio + Resend (currently MOCKED)
- Refactor `ResidentDetail.jsx` (~1100 lines) into more `/components/resident/*` files
- Photo upload + thumbnails for the Missing Pack PDF
- Return-interview capture on closing a missing episode
- CSV export of incidents/notes for inspections
- Admin User Management UI
- Incident trend charts per resident
- Witness picker — replace free-text witness with real staff selection (uses /auth/users; staff-role read access required)

## Test Credentials
See `/app/memory/test_credentials.md`.
