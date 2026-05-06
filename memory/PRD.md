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

## Implemented (2026-05-06 · iter-17)
- **Pocket Money & Personal Allowance module**:
  - Backend `GET /api/pocket-money` (cross-home overview), `GET /api/pocket-money/{rid}` (account + transaction ledger), `POST /api/pocket-money/{rid}/transactions` (7 kinds: allowance / spend / deposit / withdrawal / savings_in / savings_out / adjustment), `PATCH /api/pocket-money/{rid}/account` (manager+admin only — adjust weekly allowance + manual balance overrides), `DELETE /api/pocket-money/transactions/{tx_id}` (manager+admin only — reverses delta on the account), `GET /api/pocket-money/{rid}/statement.pdf?month=YYYY-MM` (Ofsted/parent-friendly monthly statement with audit hash).
  - Each transaction stores `delta`, `balance_after`, `signed_by_yp_initials`, and `receipt_attached` for audit.
  - Two-account model (pocket + savings) with one-call savings transfers (savings_in / savings_out adjust both balances atomically).
  - Frontend `/pocket-money` cross-home page: 3 stat tiles (Total pocket, Total savings, Weekly combined) + sortable table with last activity recency badge (today/Nd ago).
  - Frontend Resident Detail · `Pocket Money` tab: 3 balance cards (Pocket / Savings / This-month in/out totals), one-tap "Pay weekly allowance" button, full Add Transaction modal (all 7 kinds, account selector, YP initials, receipt-on-file checkbox, notes), live transactions list with running balance, kind label, receipt indicator, and reverse/delete (manager+admin).
  - Deep-link: `/residents/{id}?tab=pocket-money` opens the tab directly (powered by `useSearchParams`); Cross-home `Open` link drives this.
  - Sidebar entry `Pocket Money` under the Care group.
  - Demo seed: 4 residents preloaded with weekly allowances £5–£12, opening balances and 7–8 transactions over the last 30 days each (allowance, spend, savings_in, deposits).
  - PDF: A4 portrait monthly statement with brand header, opening/closing pocket+savings, money-in/money-out totals, full ledger (date, kind, description, account, in/out, running balance, staff/YP signature) and an audit hash.
- Tested: 21/21 backend pytest, all frontend flows in `/app/test_reports/iteration_17.json` (RBAC for delete + PATCH, all 7 tx kinds, deep-link, PDF download).

## Implemented (2026-05-06 · iter-18)
- **Finance ledger overhaul** — Pocket Money replaced with a 17-category personal-allowance ledger:
  - Categories: Pocket Money (Weekly Allowance), Personal Spending, Savings, Trust / Leaving Care Fund, Subsistence, Clothing, Incentives / Rewards, Deductions / Sanctions, Staff Purchases, External Income, Education / Activity, Transport / Travel, Mobile / Comms, Emergency Funds, Gifts, Health & Personal Care, Fines / Restitution.
  - Each transaction stores: category, direction (in|out), amount, reason, **staff initials** (auto if blank), **young-person initials**, receipt flag, notes, signed delta, balance_after_category, balance_after_total.
  - New endpoint `GET /api/pocket-money/categories` exposes category metadata to the frontend (id/label/subtitle/tone/default_direction).
  - Frontend Resident Detail · "Pocket Money" tab now shows: 3 stat cards (Total / Weekly / This-month +/−), 17-category grid (tap a tile to log a tx with that category preselected), and a search + category filter on the ledger.
  - **Live calculator preview** in Add-Transaction modal: shows "was X · ± Y · new Z" updated as you type; flags when the projected category balance goes negative.
  - Multi-category Monthly Statement PDF (opening/closing per category, money-in/out totals, full transaction list, audit hash).
  - Demo seed: 4 residents pre-loaded with realistic openings (Maddy includes £1,200 Trust / Leaving Care, £100 clothing, £20 personal spending) plus 10–12 transactions each across 8+ categories (gifts, education_activity, transport, mobile_phone, health_personal_care, deductions, etc.).
- **Petty Cash & Handover module** (home-wide, on `/staff` → "Petty Cash & Handover" tab):
  - `GET /api/petty-cash` returns float state + ledger.
  - `POST /api/petty-cash/transactions` supports kinds: deposit (in), spend (out), handover (check), adjustment. Handover requires BOTH outgoing AND incoming staff initials, sets the running balance to the verified count, and logs a `discrepancy` field for audit.
  - `DELETE /api/petty-cash/transactions/{id}` (manager+admin) reverses non-handover txs.
  - UI: Current float card, Last-handover card with RAG age, Activity tile, three action buttons (Record spend, Top up float manager-only, Shift handover), full ledger with discrepancy badges.
  - Handover modal shows live discrepancy preview before submit.
  - Demo seed: £80 float, sample ledger with one £6.00 discrepancy already logged for visual reference.
- Tested: 21/21 backend pytest + all observed frontend flows (manager + staff sessions, role gating, calculator preview, handover signing). One advisory: hydration warning fixed in `PocketMoneyTab.jsx` Add modal. See `/app/test_reports/iteration_18.json`.

## Implemented (2026-05-06 · iter-19)
- **Phase A — Information architecture restructure** to align with the user's children's-home operational model:
  - Sidebar reorganised into 8 ordered groups: **Overview · Care · Shift Handover · Staff Operations · Training & Development · Safer Recruitment & HR · Finance · Compliance**.
  - `/staff` now shows **Rota & Shifts only** (no tabs). Training matrix split out to `/training` under Training & Development. Petty Cash split out to `/petty-cash` under Finance. Pocket Money also lives under Finance.
  - New **Safer Recruitment & HR** placeholder page at `/hr` (manager+admin nav-gated; module body explains the section will hold DBS · right-to-work · references · interviews · employment history · identity checks · probation · disciplinary · occupational health · Single Central Record). Phase B will gate this hard from Support Workers via the 9-role permission matrix.
  - Dashboard **Quick Actions** strip swapped "Add Resident" tile for **Shift Handover** (data-testid `qa-handover`) — handover is the operational entry-point staff hit at every shift change.
- **Phase C — Shift Handover module** (safeguarding-critical):
  - Backend: `/api/handovers` CRUD + lifecycle endpoints. Models: `HandoverIn`, `Handover` with status `draft → awaiting_incoming → locked` and `unlocked_until` for the 24-hour manager re-edit window.
  - 13 structured sections matching the user's spec: Key incidents · Missing-from-care updates · Safeguarding concerns · Medication updates · Appointments · Behaviour concerns · Visitors/contact · Maintenance/property · Vehicle issues · Petty cash discrepancies · Reminders · Staff observations · Shift summary. Each section has `body` + `flagged` boolean.
  - Lifecycle: `POST /handovers/{id}/sign-out` (outgoing initials → status awaiting_incoming) → `POST /handovers/{id}/sign-in` (incoming initials → status locked, `delivery_log` entry created when `flagged_count > 0` for manager email/SMS — currently MOCKED) → manager `POST /handovers/{id}/unlock` (24h unlock window during which PATCH succeeds).
  - Frontend `/handover` and `/handover/:id` (deep-linkable) — list + detail. Section cards collapse/expand, save on textarea blur, flag checkbox flips card border red. Auto-opens the first flagged section. Sign-out & Sign-in modals, Unlock-for-24h button (manager+admin only), Delete (manager+admin only).
  - Demo seed: 1 locked morning handover from yesterday + 1 awaiting_incoming afternoon handover with 2 flagged sections (Safeguarding disclosure + Petty cash £6 surplus discrepancy) so you can demo the full workflow on day one.
- Tested: 17/17 backend pytest, all observed frontend flows. Two minor refinements applied post-test (deep-link `/handover/:id` route + replaced bare `except: pass` with logger.warning in sign-in delivery_log handler). Report: `/app/test_reports/iteration_19.json`.

## Backlog (next-up)
### P0 — User-confirmed sequential plan ("everything ClearCare has, but better"):
1. ✅ ~~Health & Wellbeing~~ (iter-14)
2. ✅ ~~Education / PEP tracking~~ (iter-14)
3. ✅ ~~Staff Rotas & Training~~ (iter-15)
4. ✅ ~~Statutory Visits & LAC Reviews~~ (iter-16)
5. ✅ ~~Pocket Money & Personal Allowance~~ (iter-17, expanded iter-18 to 17 categories + Petty Cash/Handover)
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
