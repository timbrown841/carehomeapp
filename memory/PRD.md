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

## Implemented (2026-05-06 · iter-20)
- **LIGHT 3-tier permissions** (user explicitly deferred the full 9-role enterprise RBAC + multi-tenant, wanting to validate operational workflows first):
  - Tiers: 1 staff (Support Worker) · 2 senior · 3 manager · 4 admin.
  - Backend: `ROLE_TIER` map, `role_tier()` helper, `require_tier(min_tier)` dependency, `PERMISSION_MIN_TIER` resource:action permission table (single source of truth shared with the frontend), `has_permission()`, new endpoints `GET /api/auth/permissions` (returns role + tier + grants[]), `GET /api/hr/preview` (manager+ only, proves the gate works), `GET /api/trainings/mine` (any signed-in user — own training only).
  - Backend: `GET /api/trainings/matrix` and `GET /api/trainings` are now senior+ only. Existing `require_role(...)` usages remain unchanged (backward-compat).
  - Backend: new seeded user `senior@care.local` / `Senior@123`.
  - Frontend `AuthContext` rewritten to hold a permissions Set; exposes `can(perm)`, `tier`, `isSeniorOrAbove`, `isManagerOrAbove`. Permissions auto-loaded on login + on token rehydrate via `/auth/permissions`.
  - Frontend `Layout`: sidebar groups respect a `minTier` field; the **Safer Recruitment & HR** group hides for tier < 3. Reports link gated minTier 3. The "Training Matrix" sidebar label auto-renames to "My Training" for staff (tier 1). User-card pill shows the role label (Support Worker / Senior / Manager / Admin) with role-tinted color.
  - Frontend `TrainingPage`: switches between full team Matrix (senior+) and a personal "My Training" view (staff) showing each course's status (ok/expiring/expired) with a 4-pill summary.
  - Frontend `App.js`: `/hr` route wrapped in `ManagerOnly` — direct URL access by staff/senior redirects to `/`.
  - Login page demo-account hint updated to include the senior credentials.
- Tested: 31/31 backend pytest, 12/12 frontend assertions. No blockers. Optional polish items applied. Report: `/app/test_reports/iteration_20.json`.

## Implemented (2026-05-06 · iter-21)
- **Resident profile redesigned around the 9 Children's Homes Quality Standards** with a "simple on the surface, deep underneath" structure:
  - **8 clean top-level tabs** (down from 14): Overview · Daily Care · Safeguarding · Health · Education & Independence · Finance · Documents · Timeline.
  - **Always-visible Alerts & Risks bar** (`AlertsAndRisksBar`) above the tab strip on every tab — derives from server-computed badges + active missing episodes + risk_level + allergies + active medications. Color-tiered (red/amber/blue/green) with collapsible behaviour. Empty state shows green "All clear".
  - **Quick Actions panel** (`QuickActionsPanel`) — 8 mobile-first action tiles (Add daily note · Log incident · Missing from care · Body map · Medication · Pocket money · Handover note · Contact) for one-click access during shifts.
  - **Accordion structure** inside each tab (`AccordionSection`) — keeps top-level navigation calm but exposes depth on click. Tab → accordion mapping:
    - Overview = Overview card + Background & referral + Statutory visits accordions
    - Daily Care = Care plan & wishes (defaultOpen) + Recent daily notes (live fetch)
    - Safeguarding = Risk assessment (defaultOpen) + Missing from care + Body maps + Recent incidents (live fetch)
    - Health = Medical overview (defaultOpen) + Medications (MAR) + Health & wellbeing
    - Education & Independence = Education & PEP (defaultOpen) + Independence skills (NEW)
    - Finance = full PocketMoneyTab inline
    - Documents = NEW DocumentsTab
    - Timeline = existing TimelineTab
- **NEW Independence Skills tracker** for semi-independent placements: 12 skill areas (cooking, budgeting, shopping, travel, appointments, self-medication, cleaning, emotional regulation, tenancy readiness, daily living, personal hygiene, communication) × 5 levels (not_started → mastered). Backend GET always returns all 12 with defaults + merged saved records; POST upserts. Overall readiness % calculated from level pcts averaged across skills. Senior+ can edit; staff is read-only.
- **NEW Documents module (metadata-only)**: 12 categories (care_plan, placement_plan, pathway_plan, court_order, ehcp, assessment, consent_form, review, id_document, placement_agreement, delegated_authority, other). Expiry date with EXPIRED red badge / 30-day "Expiring soon" amber badge. External URL link supported. Add/Delete gated to senior+ via require_tier(2). File uploads themselves arrive next iteration.
- Tested: 38/38 backend pytest, all 8 frontend tabs verified. One critical FE bug caught by code review (local DocumentsTab function shadowing the imported component) — fixed inline (removed dead local definition + added explicit import). Verified manually after fix: senior creates a doc → document appears in the list with category pill + uploader. Report: `/app/test_reports/iteration_21.json`.

## Implemented (2026-05-29 · iter-47 · Phase G.1 — Digest Delivery & Notification Centre)
- **Smart in-app Notification Centre** with strict no-spam policy. Backend namespaced under `/api/notif-centre/*` to coexist with the legacy `/api/notifications` DSL/manager bell (both bells now live in the topbar).
  - 7 categories: safeguarding · missing · compliance · staffing · placement_intelligence · hr · inspection_readiness.
  - Severities: critical / high / medium / low / info. Critical events always page in-app + email regardless of preferences.
  - **Dedupe**: sha-256(category|event_type|object_id|window) prevents same event firing twice in a day for the same user.
  - **Auto-fan-out**: `user_id=None` broadcasts to every manager/admin.
- **Endpoints** (`/app/backend/server.py` lines ~10428–10720 + `notifications_centre.py`):
  - `GET /api/notif-centre` — inbox feed (filters: unread_only, category, limit clamp 1–500)
  - `GET /api/notif-centre/counts` — unread + critical + per-category breakdown (powers the bell badge)
  - `GET /api/notif-centre/since-last-login` — counts of incidents / safeguarding / missing / critical alerts since the user's previous login
  - `GET /api/notif-centre/categories` — 7-entry catalogue for filter UI
  - `GET / PATCH /api/notif-centre/preferences` — per-category channel preferences (in_app / email / sms / digest_only)
  - `PATCH /api/notif-centre/{id}/read`, `DELETE /api/notif-centre/{id}`, `POST /api/notif-centre/mark-all-read`
  - `POST /api/notif-centre/manual` (manager+) — manager-initiated broadcast + ad-hoc testing
- **Auto-hooks** wired into existing operational endpoints:
  - `POST /api/incidents` fires `notify_safeguarding_incident` whenever incident is flagged safeguarding/high/critical/restraint/police/missing.
  - `POST /api/residents/{rid}/missing` fires `notify_missing_episode` (always critical).
  - `POST /api/auth/login` now tracks `previous_login_at` + `last_login_at`; `UserOut` surfaces both fields.
- **Digest Schedules** (`/api/handover/digest-schedules*`, `digest_scheduler.py`):
  - Three default schedules seeded idempotently on startup: Morning (07:00 daily) · Weekly (Mondays 08:00) · Monthly (1st of month 08:00). All opt-in (enabled=False on first boot).
  - Manager+ can toggle enabled, choose recipients, change hour/minute. `next_run_at` recomputed deterministically on every PATCH.
  - Background asyncio task ticks every 60s, fires due schedules, logs each delivery in `db.digest_deliveries`.
  - `POST /api/handover/digest-schedules/{id}/send-now` — manual trigger with `manual_trigger=True` flag.
  - `GET /api/handover/digest-deliveries` — recent dispatch log with full snapshot (manager_actions_total, safeguarding_new, missing_episodes, improving, deteriorating, alerts_count).
  - **Email/SMS dispatch is MOCKED** (delivery_status="queued_for_email"); database logging, in-app notifications, audit events and digest delivery records are all real.
- **Frontend additions** (5 new files + 4 edits):
  - `NotificationCentreBell.jsx` — topbar bell with red critical-aware badge, category filter chips, mark-all-read, dismiss-per-item, view-all link. Coexists with legacy `NotificationBell.jsx` (DSL/manager alerts).
  - `NotificationCentre.jsx` `/notifications-centre` — full inbox page with category filter chips (8 testids), unread-only checkbox, Preferences panel (7 rows × 4 channel toggles), dismiss/open-deep-link per item.
  - `SinceLastLogin.jsx` — manager+ Dashboard widget with 4 tiles (Safeguarding incidents · Missing episodes · Critical alerts · New notifications) and deep-link to centre.
  - `DigestSchedulesPanel.jsx` — under Handover Digest "Schedules" tab. 3 schedule cards with toggle/recipients-picker/send-now, recent-deliveries list, [EMAIL MOCKED] flag persistently shown.
  - `HandoverDigest.jsx` — added Digest/Schedules tab switcher at the top.
  - `Layout.jsx` — both bells now mounted in topbar (mobile & desktop).
  - `Dashboard.jsx` — SinceLastLogin embedded after InspectionSnapshotCard (auto-hidden for staff).
  - `App.js` — new `/notifications-centre` route (any-auth).
- **Audit log integration**: notif_preferences_updated, notif_manual_created, digest_schedule_updated, digest_sent_manual all write `audit_events` rows.
- **Tested**: 22/22 backend pytest in `test_iteration47_notif_centre.py` + supplementary `test_iteration47b_notif_extra.py`. Frontend: all G.1 UI elements rendered and interactive on manager session; legacy bell still works; staff RBAC correctly hides SinceLastLogin widget. Report: `/app/test_reports/iteration_47.json`. **No retest needed.**

## Implemented (2026-05-29 · iter-48 · Phase G.1b — Quiet Hours)
- **User-controlled quiet hours** layered onto the Notification Centre. Supportive tone throughout — never "disable alerts". Headline: "Protect your downtime while keeping critical safeguarding alerts active."
- **Per-user `notification_quiet_hours` collection**: enabled · start (HH:MM) · end (HH:MM) · days (Mon=0..Sun=6) · apply_to_email · apply_to_sms · apply_to_in_app · updated_at. Defaults: disabled, 22:00–06:00, all 7 days, all 3 channel toggles on.
- **Deterministic `is_in_quiet_hours()` helper** (`notifications_centre.py`): handles same-day windows AND midnight-crossing windows. Morning-side of a midnight-crossing window correctly checks the PREVIOUS day's weekday in the `days` list.
- **Behaviour** (enforced inside `create_notification`):
  - Critical event during quiet hours → `quiet_hours_breakthrough=True`, normal delivery, `bundled_into_digest=False`. Still pages user.
  - Non-critical during quiet hours → `bundled_into_digest=True`, email/sms stripped from `pending_channels` (per user's apply_to flags), in-app pulled out of `delivered_channels` so the bell badge doesn't pulse. The notification is STILL visible when the user explicitly opens the centre.
- **Endpoints**:
  - `GET /api/notif-centre/quiet-hours` → returns `{quiet_hours, is_in_quiet_hours, critical_breakthrough_events[], bundled_examples[]}`. Critical events list seeded with 8 entries (child_reported_missing, high_risk_incident, new_safeguarding_referral, police_involvement, reg40_trigger, staffing_ratio_breach, medication_safety_urgent, placement_stability_critical).
  - `PATCH /api/notif-centre/quiet-hours` → upserts settings. Validates `HH:MM` (400 on garbage) and days 0..6 (400 on out-of-range).
  - `GET /api/notif-centre/counts` now also returns `bundled_for_digest` (count of held non-critical notifications) and excludes bundled from `unread`.
- **Audit events** (all retrievable via `/api/audit?action=...`):
  - `quiet_hours_updated` — on every PATCH
  - `quiet_hours_breakthrough` — when a critical alert breaks through
  - `quiet_hours_bundled` — when a non-critical is held for digest
- **Frontend `QuietHoursPanel`** embedded inside `/notifications-centre` Preferences:
  - Toggle (On/Off), time pickers, weekday chip strip (Mon..Sun), channel-scope chips (In-app push · Email · SMS).
  - Two-card preview: "Always breaks through" (critical events list, red-tinted) + "Held for your morning digest" (bundled examples, blue-tinted).
  - "Active now" pill + supportive amber banner when current time falls inside the window.
  - Headline + microcopy match the user-specified supportive tone exactly.
- **Notification feed additions**: bundled non-critical items show a "Held for digest" amber chip; critical breakthroughs show "CRITICAL · BROKE THROUGH"; page header surfaces `bundled-for-digest-banner` when count > 0.
- **Other change**: `nc_manual_notification` now targets the calling user only (instead of broadcasting to all managers) — improves manager testing & per-user behaviour predictability.
- **Tested**: 31/31 backend pytest (9 new quiet-hours + 22 G.1 regression). Frontend Playwright: 100% data-testid coverage + tone verified. No regressions. Report: `/app/test_reports/iteration_48.json`. **No retest needed.**

## Implemented (2026-05-29 · iter-49 · Phase H — Induction & Policy Management Hub)
- **Major P0 module** delivering Ofsted / Reg 44 / CQC-grade evidence for staff policy compliance. Designed deliberately as an operational compliance system, not a document library.
- **Backend architecture** (extracted from the monolith — router pattern):
  - `policy_management.py` — seed catalogue (21 children's + 16 adult categories), default 4-week induction packs (children's + adult), deterministic RAG calc, assignment status machine, MCQ auto-grader.
  - `policy_routes.py` — APIRouter mounted post-`include_router(api_router)` with explicit `init()`/`build_routes()` dependency-injection (keeps server.py untouched).
  - Idempotent startup seed via lifespan; pre-existing seed rows back-filled with `id` field.
- **Collections** introduced: `policies`, `policy_versions`, `policy_categories`, `policy_questions`, `policy_assignments`, `policy_assessment_responses`, `induction_packs`, `induction_enrollments`.
- **Endpoints** (≈20 in total):
  - Categories: `GET /api/policy-categories` (filter by sector).
  - Library: `GET /api/policies`, `GET /api/policies/folders` (RAG aggregation per category), `GET /api/policies/{id}`, `POST/PATCH/archive`, version CRUD with auto-archive of superseded versions, `POST /api/policies/{id}/questions` (MCQ + reflection).
  - Lifecycle: `POST /api/policy-assignments`, `GET /api/policy-assignments[?staff_id&status&policy_id]`, `GET /api/policy-assignments/mine`, `GET /api/policy-assignments/{id}` (correct_index hidden from staff), `POST /open`, `POST /assessment` (auto-graded with 80% threshold), `POST /staff-sign` + `POST /manager-sign` with declarations.
  - Induction: `GET/POST/PATCH /api/induction-packs`, `POST /api/induction-enrollments` (auto-creates assignments for matching categories; weeks with no active policy show `status=not_assigned`).
  - Dashboard: `GET /api/policy-compliance/dashboard` returns total/complete/completion_pct/overdue/awaiting_manager_sign_off/failed_assessments/in_induction/avg_completion_days + deterministic RAG.
  - Evidence: `GET /api/policy-compliance/evidence.pdf?staff_id=` produces an inspection-ready PDF (reportlab) with summary table + per-assignment audit rows + audit-log signpost.
- **RBAC enforcement** (verified):
  - Manager+ (tier ≥3) — create/edit/archive policies, set questions, assign, manager-sign, view dashboard, download evidence.
  - Staff (tier ≥1) — read their own assignments, open, submit assessment, staff-sign. Cannot view correct answers, cannot open someone else's assignment, cannot manager-sign.
  - Admin tier ≥4 — delete assignment (audit-retained).
- **Audit events** emitted: policy_created, policy_updated, policy_archived, policy_version_added, policy_questions_set, policy_assigned, policy_opened, policy_assessment_submitted, policy_staff_signed, policy_manager_signed, induction_pack_created, induction_pack_updated, induction_enrolled, policy_evidence_exported, policy_assignment_deleted.
- **Frontend** (4 new pages + 1 modified hub):
  - `InductionPolicyHub` (manager+) `/policies` — 3 tabs: Library (folder grid with RAG status per category), Compliance Dashboard (6 tiles + Evidence Pack downloader + recent assignments), Induction (pack cards + enrol modal + active enrollments with progress bars).
  - `PolicyDetail` `/policies/:id` — version history, upload-version modal (file + change summary + effective date + optional text), assessment editor modal (add MCQ/reflection inline), assign-to-staff modal.
  - `PolicyAssignment` `/policy-assignments/:id` — 4-step stepper Read → Assess → Staff sig → Manager sig. Auto-routes user to current stage. Hides correct answers from staff. Final "Complete" panel shows both signatures + score.
  - `MyPolicies` `/my-policies` — staff inbox with proper `<Link>` rows for keyboard/right-click navigation.
  - Added "Induction & Policy" tab to `StaffOperationsHub` (renders manager hub or staff inbox by tier).
- **Default content seeded**:
  - 21 children's policy categories incl. Statement of Purpose, Safeguarding, Missing From Care, CSE/CCE, Prevent, Physical Intervention, Allegations Against Staff, GDPR.
  - 16 adult categories incl. MCA, DoLS, Adult Safeguarding, Infection Control, Positive Behaviour Support, Professional Boundaries.
  - Children's 4-week induction (Foundations → Care Practice → Trauma & Contextual → Restrictive & Reflective Practice).
  - Adult 4-week induction (Foundations → Daily Care Practice → Professional Standards → Behaviour & Boundaries).
- **Tested**: 16/16 backend pytest (11 in `test_iteration49_policies.py` + 5 supplementary RBAC/audit tests in `test_iteration49b_policies_extra.py`). Frontend Playwright: hub + 3 tabs + folder grid + dashboard tiles + evidence pack download + induction pack enrol + active enrollments + staff inbox — all verified. 33/33 G.1/G.1b regression remains green. Report: `/app/test_reports/iteration_49.json`. **No retest needed.**

## Implemented (2026-05-29 · iter-50 · Phase H.3 — Statement of Purpose & Governance Hub)
- **SoP elevated from document upload to first-class governance workflow.** Manager / RM / RI / HR only (tier ≥3 + backend 403).
- **Backend additions** (`policy_routes.py`):
  - `SopUploadIn` Pydantic model (module-level so FastAPI can resolve the forward ref via `Body(...)`).
  - `GET /api/governance/sop?sector=…` — returns existing SoP policy + versions + questions, or `{exists:false}` cleanly.
  - `POST /api/governance/sop/upload-version` — the core workflow:
     1. Auto-creates the canonical SoP policy on first upload (with `sop_policy_initialised` audit).
     2. Archives the previous version (`archived_at`).
     3. Supersedes every incomplete prior-version assignment with `status:"superseded"`, `superseded_at`, `superseded_by_version_id`.
     4. Inserts the new version with author + change_summary + effective_date.
     5. Replaces assessment questions if supplied; **seeds 4 default SoP questions** (3 MCQs + 1 reflection) on first upload when none supplied.
     6. Auto-creates a fresh `policy_assignment` for every eligible staff member (role in staff/senior/manager) with a 14-day due date and `is_sop_assignment:true` flag.
     7. Emits a single `sop_version_uploaded` audit with full counts of assignments_created + assignments_superseded.
  - `GET /api/governance/sop/compliance?sector=…` — per-staff buckets (not_started / in_progress / complete / failed / superseded) + `compliance_pct` for the current version.
  - `GET /api/governance/sop/dashboard?sector=…` — single-call dashboard: policy, current_version, versions, version_count, compliance_pct, counts, review_date, days_to_review, review_rag, overall rag_status.
  - `GET /api/governance/sop/evidence.pdf?sector=…` — inspection-ready PDF (reportlab): current SoP block + version history table + per-staff compliance table + last 50 SoP audit events. Returns 404 when no SoP exists.
- **Audit events**: `sop_policy_initialised`, `sop_version_uploaded`, `sop_evidence_exported`.
- **Frontend** — new `/governance` page (`GovernanceHub.jsx`):
  - Hero header with current version, effective/review dates, compliance %.
  - 5 governance tiles: Overall status · Compliance · Review due · Outstanding · Versions (each RAG-coloured).
  - 4 compliance buckets (Not started · In progress · Complete · Failed) with first 8 staff listed + deep-link to assignment + overdue pill.
  - Full version history list with Current/Archived pills, author, change summary.
  - Empty-state CTA when no SoP yet ("Start the governance trail").
  - **Upload modal** — captures version, author, effective/review dates, change summary, in-app text, optional file. "Publish & auto-assign" surfaces `assignments_created` count in toast.
  - **Inline questions editor** modal — managers can override the default 4 questions before publishing.
  - **Evidence pack** button downloads the PDF.
  - Added "Governance" tab to `StaffOperationsHub` (manager+ only).
  - Route is `/governance` — in-component tier check renders `data-testid=governance-hub-blocked` banner for staff (rather than redirect-to-dashboard), per spec.
- **Sector-aware** — picks sector from `OrgContext` (`children` / `adult`). The same hub works for both Adult Services and Children's Services with separate SoP records.
- **Tested**: 12/12 new backend pytest (`test_iteration50_sop_governance.py`) + 28/28 combined Phase H regression (16 iter49 + 12 iter50). Frontend Playwright: all tiles, buckets, version history, upload modal, questions modal, evidence PDF download verified — 95% success rate (only minor stylistic note about native date inputs vs shadcn Calendar). No retest needed. Report: `/app/test_reports/iteration_50.json`.

## Implemented (2026-05-29 · iter-51 · URGENT — Sector Boundary Fix)
- **User-reported leakage** — Children's mode was surfacing adult chips (Elderly Residential, Supported Living); Adult mode was surfacing the Children's Home chip.
- **Root cause**: `/api/staffing/overview` returned every populated service_type in `sectors_available[]` + `ratios[]` regardless of the active workspace.
- **Backend fix** (`staffing_service.py`):
  - Added `workspace_sector: Optional[str]` to `build_staffing_overview(...)`.
  - New `SECTOR_OF` map within the function (single source of truth: children → "children", adult_supported_living/elderly_residential/dementia/mental_health/veteran → "adult").
  - When `workspace_sector ∈ ("children", "adult")`, the function prunes `residents_by_sector` (skip cross-sector residents), `sectors_available`, and the `ratios` loop accordingly.
  - `filters_applied.workspace_sector` echoed back in the response.
- **API surface** (`server.py`):
  - `GET /api/staffing/overview` now accepts `?workspace_sector=children|adult`. Default behaviour unchanged (no workspace passed → all sectors).
- **Frontend** (`LiveStaffingOps.jsx`):
  - Pulls `effectiveMode` from `OrgContext` and forwards as `workspace_sector` on every fetch.
  - Belt-and-braces client-side filter on `sectors_available` chips (default-deny on unknown sectors — tightened after review).
  - `setSectorFilter("all")` runs when `effectiveMode` changes — prevents a stale adult filter persisting into children's mode after a workspace switch.
  - "All" chip label now reads "All children's services" / "All adult services" / "Organisation-wide" based on the active workspace.
- Side fixes:
  - `GovernanceHub.jsx` + `InductionPolicyHub.jsx` — switched from non-existent `mode` field to `effectiveMode` (`mode` was undefined before this patch, sector was defaulting to "children" always).
  - `Residents.jsx` subtitle now sector-aware ("Adults in your care." / "Children and young people in your care.").
- **Tested**: 4/4 new sector-boundary pytest in `test_iteration51_sector_boundary.py` + 27/27 combined Phase H regression. Frontend testing agent: 100% backend + 100% frontend success rate verified by Playwright. No regressions. Report: `/app/test_reports/iteration_51.json`. **No retest needed.**






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

## Implemented (2026-02-09 — Iteration 31 — Adult Services modules build-out)
- **5 new collections** with full CRUD + RBAC + audit-logging:
  - **`care_tasks`** — kind (morning/afternoon/evening routine, personal_care, hygiene_support, meal_support, medication_prompt, domestic_support, community_access, appointment_support, welfare_check), title, due_at, status (pending → completed / refused / missed), refused_reason, support_minutes. Staff complete; manager+ delete.
  - **`falls`** — separate from generic incidents. occurred_at, location, witnessed, injury (none/minor/moderate/serious), hospital_involvement (none/ambulance/A&E/admitted), equipment_involved, action_taken, follow_up. Manager+ sign-off.
  - **`mobility_assessments`** — mobility_level (independent/walking_aid/wheelchair/hoist/bedbound), falls_risk (low/medium/high), walking_aids[], moving_handling_needs, equipment_required[], staff_guidance, review_date.
  - **`mca_assessments`** — Mental Capacity Act decision-specific assessment. decision_topic, can_understand/retain/weigh/communicate, capacity_outcome (has_capacity/lacks_capacity/fluctuating), best_interest_decision, advocate/family involvement, review_date. **Senior+ to create**, **manager+ to sign off**. Reflects to `residents.capacity_status`/`capacity_status_at` for downstream alerts.
  - **`wellbeing_observations`** — mood (positive/stable/flat/low/agitated/withdrawn), hydration_level, nutrition_intake, sleep_quality (good/adequate/poor/disturbed), engagement, presentation, mental_health_concerns, self_neglect_concerns. Auto-computed `deterioration_flag` (server-side rule).
- **Adult Resident Profile wiring** (sector-aware accordions inside the existing 8-tab structure):
  - Daily Care → **Care tasks** (defaultOpen) · **Wellbeing observations** · Care delivery & routines · Recent daily notes.
  - Health → Medical overview · Medications (MAR) · **Falls register** (defaultOpen, red-tinted) · **Mobility assessment** · Health & wellbeing.
  - Safeguarding → Risk · Missing · Body maps · Recent incidents · **MCA / Capacity assessments**.
- **Adult Quick Actions** updated to 8 deep-linking buttons: Care task · Wellbeing obs · Log fall · Medication · Mobility · Appointment · MCA / capacity · Welfare check.
- **Operational summary upgraded for adults** — 9 widgets now compute against real data (was 6):
  - **`care_tasks_due`** (today, pending) · **`care_tasks_missed_7d`** (with high-severity alert at 3+) · `active_meds` · `med_refusals_14d` · `appt_next_7d` · **`falls_30d`** (real count from falls collection now, not text-search) · **`mobility_risk`** (latest assessment) · `mca_status` (latest MCA assessment with outcome-based severity) · **`wellbeing_14d`** (with deterioration count + alert when 2+).
- **Chronology integration** — 5 new event categories with colour/icon: `care_task` · `fall` · `mobility` · `mca` · `wellbeing`. All 5 collections feed the resident timeline + chronology PDF + pattern detection.
- **3 new pattern rules**: Falls cluster (2+ in 30d) · Missed care tasks rising (3+ in 7d) · Wellbeing deterioration (2+ deterioration-flagged obs in 14d). Detected automatically from any adult resident chronology.
- **Compliance integration** — every adult-module action records `audit_events` (care_task_create / fall_create / fall_signoff / mobility_create / mca_create / mca_signoff / wellbeing_create) with full before/after metadata.
- **Tested**: 10/10 new tests in `test_iteration31.py`, 90/90 across iter25-31 combined, frontend smoke confirmed all 8 Adult Quick Actions render, Care Tasks panel embedded in Daily Care, Falls panel in Health, MCA panel in Safeguarding (collapsed), end-to-end care task creation flow.

## Implemented (2026-02-09 — Iteration 30 — Sidebar split: Children's vs Adult Services)
- **Sidebar grew from 6 to 7 locked operational areas** (user-mandated): Dashboard · **Children's Services** · **Adult Services** · Home Operations · Staff Operations · Compliance & Oversight · Admin. Adult Services now has its own dedicated sidebar entry — never blended with Children's again.
- **`ChildrensServicesHub`** (`/children`) — "OFSTED REGULATED" ribbon, 5 tabs: All Children · Medication Round · Incidents · Statutory Visits · Pocket Money. Pre-filters all embedded views to `sector=children`.
- **`AdultServicesHub`** (`/adults`) — "CQC REGULATED" ribbon, 5 tabs: All Residents · Medication Round · **Wellbeing &amp; Incidents** · **Appointments &amp; Visits** · Finance. Adult-appropriate terminology in every tab label. Pre-filters embedded views to `sector=adult`.
- **`Residents.jsx` accepts `sector` prop** — pre-filters list, restricts service-type dropdown when adding (no accidentally adding an adult under Children's hub or vice versa). Default service-type defaults to first allowed sector option.
- **Backend `/api/residents?sector=children` bug fix**: now also includes legacy residents with `service_type=null` or missing field (was excluding 4 demo children residents seeded before the field existed). Sector partitioning is now strictly disjoint with zero overlap.
- **Legacy `/residents` URL → 301 to `/children`** (most-common case) so existing bookmarks and `<Link>`s still work.
- **Tested**: 4/4 new tests in `test_iteration30.py` (sector includes legacy nulls · adult excludes children · invalid sector graceful · zero overlap between sectors). 22/22 PASS for iter28-30 combined. Frontend smoke confirmed 7-item sidebar, 4 children in `/children`, 2 adults in `/adults`, legacy redirect working.

## Implemented (2026-02-09 — Iteration 29 — Sector-aware Resident Profile (Children's vs Adult))
- **Sector-aware Quick Actions panel**:
  - Children: Add daily note · Log incident · Missing from care · Body map · **Start key work** ✨ (NEW — user-flagged) · Medication · Pocket money · Handover note.
  - Adult: Daily observation · Medication · Care task · **Log fall** · Appointment · Welfare check · MCA / capacity · Contact.
  - Sector ribbon ("Children's services" / "Adult services") visible at top-right of QA panel.
- **Operational Overview** (`OverviewOperational.jsx`) — replaces the old static demographic-heavy Overview body with a "What staff need to know RIGHT NOW" command-centre. Sector-aware widget set:
  - Children widgets: safeguarding (14d) · incidents (7d) · missing (30d) · body maps (30d) · return interviews outstanding · key work (days since last).
  - Adult widgets: active medications · med refusals (14d) · appointments (next 7d) · falls (30d) · MCA / capacity status · daily observations (7d).
  - Live alerts row (urgent severity tone) for: currently missing · risk review overdue · falls pattern.
  - Each widget has a deep-link to the relevant tab; severity-coloured left-border (high=red / medium=amber / low=green).
- **Sector-aware Daily Care tab content**:
  - Children: Care plan & wishes · Therapeutic key work · Recent daily notes.
  - Adult: Care delivery & routines · Wellbeing observations · Key working sessions.
- **`Dashboard.PracticeAttentionCard` removed** (user-flagged: Therapeutic Practice should not float on Dashboard — it lives inside Key Work now).
- **Endpoint `GET /api/residents/{rid}/operational-summary`** — server-side aggregator. Single round-trip computes sector classification + alerts + sector-specific widgets from existing collections (no fabricated data). Audit-quality counts: refused medications, falls (text-search incident bodies for "fall"/"fell"), appointments by date range, MCA status by `capacity_status_at` age in days.
- **Tested**: 6/6 backend tests in `test_iteration29.py` (children/adult widget shapes · widget field shape · currently_missing alert urgency · 404 unknown resident · 401 unauth). Frontend smoke confirmed sector ribbons, sector-correct quick actions on both Maddy (children) and Tom (adult), operational widgets render with correct severity colours.

## Implemented (2026-02-09 — Iteration 28 — Chronology / Timeline rebuild · flagship safeguarding chronology)
- **Replaces basic 3-source timeline with a full operational chronology** built from 9 source collections: incidents · missing_episodes · return_interviews · body_maps · medication_admins (refused/withheld only) · statutory_visits · key_work_sessions · health_appointments · notes. Each source is normalised into a unified event shape (id · at · category · severity · title · summary · actor_name · tags · metadata · category_label · category_colour · category_icon).
- **Backend `timeline_service.py`**:
  - `build_chronology(db, rid, categories, from_at, to_at, q, safeguarding_only, limit)` aggregates + filters + sorts.
  - 18 colour-coded categories with icons (`CATEGORY_META`): safeguarding · missing · police · incident · restraint · self_harm · exploitation · body_map · health · medication · education · professional · key_work · therapeutic · achievement · review · note · return_interview · placement.
  - `detect_patterns(events)` — 9 deterministic non-AI rules: repeat missing (3+/30d) · recurring missing location · recurring associates · police clustering (3+/60d) · self-harm cluster (2+/30d) · medication refusal spike (3+/14d) · aggression escalation (3+/30d) · night-time incidents (3+/30d, 22:00-06:00) · active safeguarding period (2+/14d).
- **Endpoints**:
  - `GET /api/residents/{rid}/timeline` — filters: categories, from_at, to_at, q, safeguarding_only, limit. Returns items + counts_by_category + total + category_meta.
  - `GET /api/residents/{rid}/timeline/patterns` — rules-based pattern insights.
  - `GET /api/residents/{rid}/timeline.pdf` — Senior+ inspection-ready chronology PDF with 6 scope shortcuts: full · safeguarding · missing · incidents · police · custom (uses current frontend filters). Includes patterns banner, counts strip, full event table, audit hash.
- **Backend `chronology_pdf.py`** — A4 portrait, colour-coded events, severity tones, patterns table, audit hash, scope/filter summary line.
- **Frontend `ChronologyTab.jsx`** (replaces old `TimelineTab` inside Resident Profile · Timeline tab):
  - Sticky filter strip: search (debounced 300ms) · date range · 12 toggle chips (Safeguarding / Missing / Incidents / Self-harm / Restraint / Police / Medication / Health / Key work / Therapeutic / Professionals / Achievements) with live counts · Clear button.
  - **Patterns banner**: red-tinted alert card showing each detected pattern with severity pill + title + message; dismissible.
  - **Day-grouped event cards**: colour-coded left bar by category, icon, severity pill, tag chips (police / self-harm / etc.), expandable to show metadata (location, associates, police ref, exploitation indicators, frameworks, signed-off-by) + deep-link to source incident.
  - **Export menu** (6 scopes): Full · Safeguarding only · Missing-from-care · Incidents · Police involvement · Use current filters. Auth via Bearer token (Senior+ enforced server-side).
- **URL deep-link preserved**: `/residents/:id?tab=timeline` lands directly in the chronology view.
- **Tested**: 12/12 backend pytest in `test_iteration28.py` (aggregation · filter combos · safeguarding-only · search · date range · patterns shape · 4 PDF scopes · staff RBAC 403 · 404 unknown resident · CATEGORY_META completeness). 70/70 PASS across iter25-28. Frontend Playwright smoke confirmed 93 events grouped over 8 days, 5 patterns surfaced, safeguarding filter narrows to 17, export menu opens.

## Implemented (2026-02-09 — Iteration 27 — Sidebar Lockdown + Hub Architecture + Admin)
- **Sidebar locked to 6 operational areas** (architectural commit — must NOT grow without explicit product approval): Dashboard · Residents · Home Operations · Staff Operations · Compliance & Oversight · Admin. Group headers removed (each area is a single nav item). Admin gated `minTier: 3`.
- **Resident-as-HUB philosophy**: every resident-specific workflow (Daily Notes / Incidents / Medication / Statutory Visits / Risk / Missing-from-care / Return Interviews / Body Maps / Key Work / Health / Education / Finance / Documents / Timeline / Therapeutic Practice / Support Plans / Care Plans) lives inside the 8-tab Resident Profile. Staff feel "I'm supporting THIS young person" instead of "I'm jumping between disconnected modules."
- **`HubTabs` primitive** (`/components/HubTabs.jsx`): reusable tab strip with `?tab=<id>` deep-linkable URL, role-aware `hidden` flag per tab.
- **`/residents` Residents Hub** (5 tabs, `?tab=` deep-link): All Residents (default) · Medication Round · Incidents · Statutory Visits · Cross-home Finance. Existing cross-home pages embedded directly — no rewriting required. Operational hub for the home; opening a young person navigates to the full 8-tab profile.
- **`/staff-operations` Staff Ops Hub** (5 tabs): Rota & Shifts · Shift Handover · Supervisions · Training · Safer Recruitment (manager+ only). Handover ALSO remains a Dashboard quick-action tile (used every shift).
- **`/compliance` Compliance & Oversight Hub** (senior+ only, 4 tabs role-aware): Ofsted Readiness · CQC Readiness (auto-shown when adult sector active) · Audit Log (senior+) · AI Reports (manager+).
- **`/operations` Home Operations** gained a 5th tab: **Petty Cash** — moved out of the sidebar/Finance group (it's a home-wide cash-float workflow, not resident-specific).
- **`/admin` Admin landing page** (manager+admin):
  - System overview stat tiles: Users · Residents · Incidents · Daily Notes · Compliance Logs · Audit Events + Users-by-role pills.
  - User CRUD: Create user (managers cannot create admins; admins can create any role); Delete user (admin only, cannot self-delete).
  - Roles & Permissions reference matrix (4 tier cards explaining what each tier can do).
- **Backend additions**:
  - `POST /api/admin/users` (manager+, blocks manager-creating-admin), `DELETE /api/admin/users/{uid}` (admin-only, blocks self-delete), `GET /api/admin/system-info` (manager+ counts aggregator).
  - All admin actions audit-logged (`admin_user_create`, `admin_user_delete`).
- **Legacy routes preserved** (`/medications`, `/incidents`, `/visits`, `/pocket-money`, `/petty-cash`, `/staff`, `/handover`, `/training`, `/supervisions`, `/hr`, `/ofsted`, `/cqc-readiness`, `/audit`, `/reports`, `/key-work`) — kept alive in `App.js` so all pre-existing `<Link>`s and bookmarks still work, but removed from the sidebar.
- **Tested**: testing_agent_v3_fork iteration 27 — backend 228 passed / 1 skipped (iter19→iter27), frontend 100% across all hubs, role gating, deep-links, tabs, admin CRUD. See `/app/test_reports/iteration_27.json`.

## Implemented (2026-02-09 — Iteration 26 — Home Operations & Compliance)
- **Dedicated Home Operations sidebar area** (`/operations`) — strictly home-wide, never pollutes Resident Profile or sidebar with resident-level workflows. Resident-specific workflows continue to live inside the 8-tab Resident Profile.
- **Unified compliance schema** (one config-driven backend, NOT 14 separate CRUDs):
  - `compliance_check_types` (15 seeded, idempotent on startup): each defines fields (number/text/checkbox), `frequency_days`, `status_rules` (ok/warn bounds + `all_required_true` mode), `requires_manager_review`, group + icon. Adding new check types is config-only.
  - `compliance_logs` (entries) with auto-evaluated status (`ok` / `action_needed` / `fail`), values dict, performed_by, manager sign-off fields, audit trail.
  - `maintenance_issues` with severity (low→urgent), status (reported→in_progress→resolved), category (repair/hazard/cleaning/vehicle/room).
- **Seeded check types** (15): fridge_temperature · freezer_temperature · water_temp_hot · water_temp_cold · legionella_flush · fire_alarm_test · smoke_alarm_check · emergency_lighting · fire_drill · sharps_check · window_restrictor_check · vehicle_check · cleaning_audit · hs_audit · room_inspection.
- **Endpoints**:
  - `GET /api/compliance/check-types` (any auth) · `GET /api/compliance/dashboard` (rows + counts) · `GET /api/compliance/logs` (filter check_type_id, status) · `POST /api/compliance/logs` (any auth — staff record during shifts) · `POST /api/compliance/logs/{id}/sign-off` (manager+) · `DELETE /api/compliance/logs/{id}` (manager+)
  - `GET/POST /api/maintenance` (any auth create) · `PATCH /api/maintenance/{id}` (auto-stamps resolved_at + resolved_by_name when status=resolved) · `DELETE /api/maintenance/{id}` (manager+)
  - `GET /api/compliance/snapshot.pdf` (manager+ only) — inspection-ready compliance snapshot PDF with status strip, per-check-type table, recent activity, open maintenance issues, audit hash.
- **Audit integration**: every compliance_log_create/sign-off/delete + maintenance_create/update/delete writes an `audit_events` row.
- **Frontend `/operations` hub** (single sidebar entry, 4 tabs):
  1. **Compliance** — "Needs attention" panel (overdue + due-soon, sorted by urgency) + grouped check tiles by category (Temperature & food safety, Water hygiene, Fire safety, Health & safety, Audits). Each tile shows last-done relative time + RAG status pill; click to open Quick-Log modal.
  2. **Safety checks** — full grid of all 15 checks with description + "Log check" button.
  3. **Maintenance** — Open/Resolved/All filter pills, urgent-issues banner, mobile-first issue rows, manager-only Delete; create/edit modal with severity + category + status + resolution notes.
  4. **History** — table of all logs with manager-only sign-off / delete actions.
- **Mobile-first quick-entry modal**: bottom-sheet on mobile, dialog on desktop. Per-check-type field schema drives the form. Sticky save/cancel footer.
- **RBAC**:
  - All staff (tier 1+): record checks, create + edit maintenance issues (operational reality during shifts).
  - Senior (tier 2+): same.
  - Manager+ (tier 3+): sign-off compliance logs, delete logs, delete maintenance, download Compliance Snapshot PDF.
- **Tested**: testing_agent_v3_fork iteration 26 — backend 15/15 PASS in `test_iteration26.py`, regression 105/106 (1 unrelated network timeout). Frontend Playwright GREEN across manager / senior / staff / mobile (390×844). RBAC verified: ops-snapshot-pdf, history signoff/delete, maint-delete all correctly hidden for staff & senior; nav-operations visible to all roles. See `/app/test_reports/iteration_26.json`.

## Implemented (2026-02-09 — Iteration 25 — Therapeutic Practice & Key Work)
- **Therapeutic content seed** (`seed_therapeutic.py`, idempotent on startup): 9 frameworks (Bronfenbrenner, Attachment, Trauma-Informed, Contextual Safeguarding, PACE, Restorative, Maslow, Social Learning, Child Development), 9 themed resource packs (EBD / Trauma / Emotional regulation / CSE awareness / Missing-from-care prevention / Identity / Healthy relationships / Independence / Education engagement) each with `session_idea`/`worksheet`/`activity`/`reflection_prompt`/`discussion_prompt` sections, 9 key-work topics with framework+resource+prompt defaults, 12 guided prompts indexed by `context` (key_work_planning|recording|risk_assessment|support_plan) and theme tags.
- **Key Work Sessions** (`/api/key-work/sessions`): Senior+ create/edit; combined plan→run→review document with goals, follow-up actions, frameworks_applied[], resource_pack_ids[], prompt_responses{}, mood_before/after (1-5), young_person_voice, staff_reflection, outcomes, review_date, safeguarding_flag. Manager+ sign-off required for safeguarding-flagged or high-risk topics. Once `signed_off_at` is set, Senior cannot PATCH (Manager+ only). PDF export with frameworks/resources/prompts inline. Audit-recorded.
- **Smart Recommendations** (rules-based, NOT AI): `/api/key-work/recommendations` (home-wide) and `/api/residents/{id}/key-work/recommendations` (per resident). 7 deterministic rules: repeat missing → CSE+contextual safeguarding; ≥3 behaviour incidents/30d → ER+PACE+trauma-informed; open safeguarding → trauma-informed+contextual; high risk → Bronfenbrenner+protective relationships; self-harm 90d → trauma-informed+ER+identity; 0 sessions in 21d → "session overdue"; no YP voice last session → prompt next time.
- **Frontend pages**: `/key-work` hub (mine/all/recs tabs), `/key-work/new` + `/edit` editor (with sticky right-side guided-prompts panel + practice recommendations chip from rules engine), `/key-work/{id}` detail + PDF + sign-off, `/frameworks(/{id})` library, `/resources(/{id})` library with theme filter.
- **Surfaces** (per user request, *NO sidebar group*): Resident Profile → **Daily Care tab** → "Therapeutic key work" accordion (`acc-key-work`) — same operational pattern as Medication / Statutory Visits — with KeyWorkPanel showing live recs + recent sessions + Frameworks/Resources discovery links. Dashboard `PracticeAttentionCard` for Senior+ as a "Practice attention" CTA. Sidebar deliberately kept clean (no Therapeutic Practice group).
- **8-tab resident profile preserved**: Overview / Daily Care / Safeguarding / Health / Education & Independence / Finance / Documents / Timeline. No new tabs added.
- **Tested**: testing_agent_v3_fork iteration 25 + retest — backend 35/35 PASS, frontend 100% PASS on all restructure + bugfix checks. Two bugfixes from initial run: PATCH guard now depends solely on `signed_off_at` (not status); Dashboard imports `useNavigate`. See `/app/test_reports/iteration_25.json` and `/app/test_reports/iteration_25_retest.json`.

## Implemented (2026-02-09 — Iteration 24 — Audit Log + Inline Edit + Witness Picker)
- **Audit log** (`audit_service.record_audit`) — write-only `audit_events` collection wired into every safeguarding-relevant write path (resident PATCH, photo upload/remove, document add/delete, return-interview create/sign-off, missing-episode patch, incident create/patch/status). Each event captures actor (id/name/role), action, object_type, object_id, resident_id (denormalised), human-readable summary, field-level changes diff (`before` → `after`), metadata.
  - Read endpoints (Senior+ only): `GET /api/audit` (filter by resident, actor, object_type, action, date range, free-text safe q), `GET /api/audit/facets` (actor/type/action lists for dropdowns), `GET /api/residents/{id}/audit`.
  - Frontend: `/audit` page (Senior+) — inspector-friendly UI grouped by day, actor initials, action badge, change chips per field, search + 5 filters; sidebar gated to Senior+.
- **Inline editing on Resident Profile** — `<InlineField>` component (pencil → input → save/cancel, Enter/Esc shortcuts, sensitive-field confirm). Wired on header (Key worker, Social worker) and Overview tab (local_authority, key_worker, risk_level, risk_next_review, social_worker_name, social_worker_contact, phone). Resident PATCH widened from Manager+ to **Senior+**. Each save writes a field-level audit event.
- **Witness picker on Incidents** — staff (live `/auth/users/picker`), young people (live `/residents`), external professionals (free-text name/role/org/contact). `WitnessRef` model with max_length caps. Witness notes textarea. Witnesses persist on POST/PATCH `/incidents`, render on `/incidents/{id}` (`incident-witnesses-section`), embed in incident PDF (`WITNESSES & PEOPLE PRESENT` table — kind/name/role-org/contact), and appear in audit metadata.
- **Hardenings**: `WitnessRef` fields capped at 200/2000 chars; `/audit` `q` parameter strips regex metacharacters (no ReDoS); restored Maddy O'Brien `key_worker` after test fixture.
- **Tested**: testing_agent_v3_fork iteration 24 — backend 28/28 PASS in `test_iteration24.py` (audit endpoints + RBAC, audit diff on PATCH, witness PDF section via pypdf decode, photo/document/return-interview/missing/incident audit-event recording). Frontend Playwright e2e GREEN: nav-audit hidden for staff, audit page filters all functional, inline edits persist, witness picker dropdown 3-tab works. See `/app/test_reports/iteration_24.json`.

## Implemented (2026-02-09 — Iteration 23 — Children's-side Safeguarding Polish)
- **Resident photo upload**: Local-disk storage at `/app/backend/uploads/photos/`. `POST /api/residents/{id}/photo` (Senior+); replaces prior photo cleanly. Photo embedded in Missing Pack PDF header.
- **Files/uploads infrastructure**: `POST /api/uploads` (multipart, kind=document/photo/return_interview), `GET /api/files/{id}` accepts Bearer **OR** `?token=<jwt>` query param so `<img>` tags work, `DELETE /api/files/{id}` (Senior+). 10MB max; PDF/DOCX/PNG/JPG.
- **Return Interview** (statutory missing-from-care follow-up):
  - `POST /api/return-interviews` (Senior+) auto-closes the missing episode, appends timeline event.
  - Fields: account of events, locations visited, who they were with, safeguarding concerns, exploitation indicators (10 preset chips), actions taken, follow-up required.
  - `POST /api/return-interviews/{id}/sign-off` (Manager+) records signed_off_by + signed_off_at + manager_comments.
  - `GET /api/return-interviews/{id}/pdf` — clean A4 PDF including manager sign-off section.
  - Frontend: triggered from open missing-episode "Mark returned & start interview" CTA; episodes list shows RI status pill, RI PDF download, Manager sign-off button.
- **Documents Tab full build-out**:
  - 7 priority categories (Risk Assessments, Support Plans, Placement Plans, Education Documents, Medical Documents, Referral Documents, Safeguarding Documents) + legacy categories.
  - Real file upload (10MB, PDF/DOCX/PNG/JPG) with Download button on each doc.
  - `expiry_date` AND new `review_date` fields with overdue / due-soon visual warnings; top-of-tab "X documents overdue review" red banner.
- **Inspection-Ready Snapshot**:
  - `GET /api/inspection/snapshot[?scope=auto|ofsted|cqc|both]` (Manager+) returns service mix, 12 live counts (open safeguarding, open missing, MAR completeness %, missed doses 24h, statutory visits overdue, visits next 14d, handovers 24h, residents w/o note 24h, outstanding actions, risk reviews overdue, document reviews overdue).
  - `GET /api/inspection/snapshot/pdf` — manager-only one-click PDF, auto-detects Ofsted-only / CQC-only / combined scope; gold-banded inspection branding with 12 metric cards, recent incidents, open missing, outstanding actions, regulator self-rating.
  - Dashboard CTA card (`inspection-snapshot-card`) for managers shows live counts + "Generate snapshot" download button.
- **Login hero** now reads "children's homes and adult-care teams … inspection-ready" — no longer children-only.
- **Tested**: testing_agent_v3_fork iteration 23 — backend 43/43 PASS in `/app/backend/tests/test_iteration23.py` (uploads, file-token query mode, photo lifecycle, RI full RBAC + sign-off, documents new categories, inspection snapshot scopes, RBAC regression). Frontend smoke screenshots verified RI workflow rendering correctly inside the Missing accordion. See `/app/test_reports/iteration_23.json`.

## Implemented (2026-02-09 — Iteration 22 — Adult Services Modular Overlay)
- **Modular service-type platform**: same core, conditional modules per `service_type` (children / adult_supported_living / elderly_residential / dementia / mental_health / veteran). Children's workflows are NOT altered — strict regression-safety.
- **Backend**: `Resident` model extended with `service_type` + adult fields (NHS#, GP, tenancy, mental-health diagnoses); legacy residents default to `children`. New endpoints:
  - `GET /api/service-types` — full registry of 6 service types.
  - `GET /api/service-types/active` — sectors/types with live counts; powers feature gating.
  - `GET /api/cqc/readiness` — service_users, overdue medication reviews, open adult safeguarding, audits due, CQC Five Key Questions.
  - `GET /api/residents` accepts `?service_type=` (single) and `?sector=adult` (multi-type aggregation).
- **Frontend**:
  - `CQCReadiness.jsx` page (Senior+).
  - `App.js` route `/cqc-readiness` gated via `SeniorOrAbove` (staff redirected to `/`).
  - `Layout.jsx` "Adult Services" sidebar group conditional on `requiresAdultSector` + `minTier:2` — hidden if no adult residents OR if user is Staff.
  - `ServiceBadge.jsx` pill on Resident header. `AdultProfileSection` only renders for adult service_types — children profiles untouched.
- **Seed**: Tom Whitfield (adult_supported_living) + Margaret Lewis (elderly_residential).
- **Tested**: testing_agent_v3_fork iteration 22 — 13/13 backend pytest GREEN + Playwright e2e GREEN. Children's 8-tab profile / pocket money / visits / notes / incidents / handover / RBAC all confirmed regression-free. See `/app/test_reports/iteration_22.json`.

## Roadmap

### P0 — User-locked architecture (DO NOT REGRESS)
- **Sidebar locked to 7 hubs**: Dashboard · Children's Services · Adult Services · Home Operations · Staff Operations · Compliance & Oversight · Admin.
- Resident-specific workflows live INSIDE the 8-tab Resident Profile (never in the sidebar).
- Home-wide workflows live ONLY in Home Operations.
- Children's & Adult sectors are strictly partitioned — zero resident overlap.
- Resident Profile is sector-aware (Children's vs Adult — Quick Actions, Overview widgets, Daily Care content all branch).

### P0 — Next focus (TBD with user)
- ✅ ~~Iteration 28: Chronology / Timeline rebuild~~ (2026-02-09)
- ✅ ~~Iteration 29: Sector-aware Resident Profile + Key Work in Quick Actions~~ (2026-02-09)
- ✅ ~~Iteration 30: Sidebar split into Children's vs Adult Services~~ (2026-02-09)
- ✅ ~~Iteration 31: Adult Services modules build-out (Care Tasks, Falls, Mobility, MCA, Wellbeing)~~ (2026-02-09)
- ✅ ~~Iteration 32: Realistic adult demo data seeding + deployment-readiness stress regression~~ (2026-02-10)
- ✅ ~~Iteration 33: Staff Reflective Practice &amp; Wellbeing Hub — 'My Reflection'~~ (2026-02-10)
- ✅ ~~Iteration 34: Ofsted Inspection Command Centre (Phase A) — children's-only war-room~~ (2026-02-10)
- ✅ ~~Iteration 35: Regulation 44 Operational Intelligence — 40 audit modules / 8 categories / live RAG~~ (2026-02-10)
- ✅ ~~Iteration 36: Phase C — Inspection Simulation Mode, Pre-Inspection Scan PDF, Reg 44 auto-draft~~ (2026-02-10)
- ✅ ~~Iteration 37: Phase C close-out — Action Ownership/Accountability, Cross-Module Pattern Intelligence, Strategy Meeting Pack PDF~~ (2026-02-15)
- ✅ ~~Iteration 38: Phase D · Live Staffing Operations — clock in/out, sleep-ins, leave/sickness, shift swaps, staffing overview & ratios & pressure indicators~~ (2026-02-15)
- ✅ ~~Iteration 38b: Unified workforce hub with sector + shift-mode filters (Organisation-wide is the default, drill-in is optional, pressure indicators intentionally remain org-wide)~~ (2026-02-15)
- ✅ ~~Iteration 39: Service-Mode Separation — pre-login sector selector, per-session single-sector experience, sector-themed login, sidebar always shows ONE sector at a time, Switch-sector in avatar menu, admin Organisation settings panel with force-archive flow~~ (2026-02-15)
- ✅ ~~Iteration 39b: Sector-native workspace — global sidebar sector badge, sector-aware Compliance & Oversight (Ofsted/Reg44/Safeguarding/Sim/Patterns vs CQC/KLOE/CareQuality/Falls/MCA/Med), sector-aware Dashboard tiles & terminology, useSectorCopy() helper for consistent wording~~ (2026-02-15)
- ✅ ~~Iteration 39c: Sector immersion — sector-specific Quick Actions (children: Key Work/Missing/Body Map; adult: MAR Round/Care Task/Fall/Wellbeing), sector-specific "At a glance" widgets (adult: Adult safeguarding/Overdue care tasks/MAR refusals/Falls/Wellbeing reviews due), workspace identity ("Children's Residential Workspace" / "Adult Care Workspace"), CQC-native questioning headline, backend /dashboard/urgency extended with care_tasks_overdue + medication_refusals_14d + falls_30d + wellbeing_reviews_due~~ (2026-02-15)
- ✅ ~~Iteration 40: Operational Intelligence v1 — deterministic, evidence-linked, sector-aware forecast engine (children: missing velocity/safeguarding cluster/restraint escalation/risk reviews drift; adult: falls velocity/medication refusals/care tasks overdue/wellbeing reviews), Emerging Risks dashboard panel with severity/trend/confidence and explanation modal showing the full evidence chain + linked regulation + recommended action, Resident Stability scoring (stable / emerging / escalating / critical) with auditable factor chain (score = sum of factor weights), per-resident card on profile~~ (2026-02-15)
- ✅ ~~Iteration 40b: Burnout Forecasting — deterministic, manager+-only team wellbeing intelligence. Aggregate-metadata-only (overtime, sleep-ins, sickness days, shift swaps, late clock-ins, consecutive working days, stressed-mood counts; self-care check-ins as mitigator). NEVER reads private reflection text. Risk levels low/medium/high with labels "Steady" / "Pressure increasing" / "Support recommended". Explainable factor chain (score = sum of factor weights, clamped at 0). Supportive recommended actions per domain. New /api/intelligence/burnout-forecast endpoint. "Team Wellbeing & Burnout Risk" panel on Staff Operations → Team Wellbeing tab with explanation modal showing full factor chain, mitigators, supportive actions, and persistent privacy boundary. 9/9 backend tests + 23/23 regression PASS. Frontend manager flow + RBAC verified~~ (2026-02-15)
- ✅ ~~Iteration 41: Placement Intelligence & Matching Engine — children's-only, manager+-only. Deterministic, live-operational placement matching, NOT a referral form. `build_home_readiness` analyses incidents/restraints/missing/safeguarding/police trends + burnout signal → emotional_climate / behaviour_pressure / missing_trend / safeguarding_pressure / staffing_readiness tiles + overall good/watch/elevated/high_risk. `build_match_analysis` adds group dynamics scoring (age vulnerability mismatch, CSE/CE overlap, known associates overlap, missing-influence, behaviour-trigger, emotional contagion, capacity, home-state amplifier) → matching confidence (strong/manageable/elevated/not_recommended) + "what would need to change" suggestions + explainable factor chain linking specific current residents. Full referral schema (1.info → 2.needs → 3.risks → 4.capacity → 5.group impact → 6.conditions → 7.decision → 8.audit trail). RI/Ofsted-ready Matching Assessment PDF with audit hash. New tab "Referrals & Matching" inside Children's Services Hub. 18/18 backend tests + frontend E2E verified~~ (2026-02-15)
- ✅ ~~Iteration 41b: Instant Match Simulator — live placement decision-support sandbox inside Referrals & Matching. Three input modes (paste referral text/email · upload PDF/TXT · quick manual entry). Deterministic keyword extraction (16 needs, 6 risk dimensions, urgency, legal status, age, gender, LA, SW, associates) with matched-phrase evidence chain. Reuses `build_match_analysis` against current home but NEVER persists data — managers can run as many as they like during a phone call. "NON-BINDING SIMULATION" notice persistent throughout. "Save as formal referral" CTA pre-fills the editor with extracted data. PDF text extraction via pypdf. 13/13 backend tests + 36/36 regression PASS. Frontend E2E verified (manager flow + RBAC + sector boundary preserved)~~ (2026-02-15)
- ✅ ~~Iteration 41c: Recent Simulations log — placement decision audit history with strict privacy boundary. Lightweight metadata only (id, ran_at, ran_by, yp_initials, matching_confidence, score, risk_band, source, status, converted_referral_id, manager_note ≤400 chars). NEVER persists: raw_text, file content, narrative, needs lists, known associates, reason, social worker contact, safeguarding history. Statuses: under_review / more_info_requested / not_progressed / converted. Saving a simulation as a formal referral now auto-links it via `?simulation_id=` and marks the sim as converted with auto audit trail. Manager+ list/patch, admin-only delete. "Recent simulations" panel below active referrals with confidence + status pills, edit modal for outcome + rationale. 14/14 backend tests + 39/39 regression PASS. Frontend E2E verified (RBAC + sector boundary + convert linkage)~~ (2026-02-15)
- ✅ ~~Iteration 41d: Placement Conversion Analytics tile inside Children's Compliance & Oversight (new "Placement Analytics" tab, manager+ only, minTier=3). Executive-style oversight: hero KPIs (total simulations + delta arrow, conversion %, avg risk band, modal confidence), 3 distribution cards (outcomes / risk / confidence) with stacked bars + legends, Referral Pressure card (weekly bars, out-of-hours count, spike detection ≥1.6× rolling avg), Home Readiness Trend card (good/watch/elevated/unstable distribution + avg home score). Period switcher 7/30/90 days. Simulator now records `home_readiness_at_run` + `home_score_at_run` so trend analytics build over time. Privacy: aggregate-only — recursive walk confirms no PII/initials/narrative leaks. 12/12 backend tests + 45/45 regression PASS. Frontend RBAC verified (staff blocked, senior tab hidden)~~ (2026-02-15)
- ✅ ~~Iteration 41e: Local Authority breakdown inside Placement Analytics — "Commissioning & referral trends" card. Aggregate-only per-LA intelligence (top 10 sorted by volume): simulation count + proportional volume bar, conversion rate, more-info rate, OOH count, avg risk band, modal matching confidence, and a deterministic neutral-tone insight line ("Low conversion — review placement-fit patterns; predominantly out-of-hours referrals." / "Strong conversion pattern." / "Stable referral pattern — no notable trend signals."). Reflective ethos — never punitive, never a league table. LA captured deterministically from referral text (case-insensitive regex) or overrides. Privacy: organisational metadata only, no PII, no narrative, no initials. Unused LA sims excluded. 11/11 backend tests + 57/57 regression PASS. Frontend E2E verified (manager renders 6+ LAs with volume bars + insights; adult sector boundary holds)~~ (2026-02-15)
- ✅ ~~Iteration 42: Placement Stability Intelligence — deterministic, evidence-linked, supportive-tone predictive intelligence. Per-resident scoring compares first 14d post-admission ("baseline") vs latest 14d ("current") across 7 signal pairs (incidents, missing, restraints, safeguarding, police, peer-conflict, self-harm) + protective factors (days-since-last-incident/missing, reduced incidents, reduced missing, key-work engagement, education engagement). Score = risk weights − protective weights (clamped). Six supportive status labels (Stabilising / Steady / Watching for early signs / Support recommended / Immediate review recommended / Recently admitted). Tone strictly non-punitive. PlacementStabilityCard on every children's resident profile with click-to-modal showing full evidence chain + suggested interventions. EmergingPlacementConcernsPanel takes over the previously-placeholder Safeguarding Intelligence tab in Children's Compliance & Oversight — surfaces both "Where support may be needed" AND "Positive trajectory · quietly going well" lists, with drill-down modal embedding the per-child card. 16/16 backend tests + 85/85 regression PASS. Frontend E2E verified (RBAC + sector boundary preserved)~~ (2026-02-15)
- ✅ ~~Iteration 42b: Placement Stability Trajectory — longitudinal/weekly stability score series (4–12 week rolling). Reuses snapshot factor engine — each weekly point is a 14d rolling window compared vs first 14d post-admission. Deterministic trajectory label: stabilising / improving / steady / fluctuating / deteriorating / insufficient_data / no_admission (computed from linear-regression slope + variance + first-half vs second-half delta). Each weekly point includes evidence-linked "what changed" event list for the 7-day delta window (incidents, missing, key-work notes — no narratives, no PII). NEW endpoint GET /api/placement-stability/trajectory/{resident_id}?weeks=10 (any authed user; weeks param clamped 4..12). NEW StabilitySparkline.jsx component (lightweight SVG, no chart lib). PlacementStabilityCard now shows trajectory block with sparkline + label on the card surface, and modal opens to a TrajectorySection with larger sparkline + week-list selector + per-week detail panel ("Concern" / "Protective" / events list) + "Open chronology" deep-link to /residents/{id}?tab=timeline filtered to the week. Tone strictly supportive — surfaces stabilisation as clearly as deterioration. Privacy: events are id/at/label/category/kind/severity only — never narrative. 12/12 backend pytest in /app/backend/tests/test_iteration42b.py + 37/37 regression PASS. Frontend E2E verified (manager flow on Maddy O'Brien — sparkline renders, week-list interactions, chronology deep-link confirmed)~~ (2026-02-16)
- ✅ ~~Iteration 42c: Org-wide Placement Stability Trajectory — extended Emerging Placement Concerns panel (Children's Compliance & Oversight → Safeguarding Intelligence tab, manager+ only) to enrich each resident row with a compact 8-week trajectory: trajectory_label + trajectory_label_text + trajectory_summary + score_min/max/current/earliest + sparkline[] (each point only {week_ending_at, score, status, status_label} — no PII, no event lists). New `_compact_trajectory()` helper + `with_trajectory` flag on `build_emerging_placement_concerns`. Frontend: EmergingPlacementConcernsPanel rows now render a mini sparkline (110×32px, no axis) on the right + trajectory pill (Stabilising / Improving / Steady / Fluctuating / Support recommended / Building) next to the status pill + supportive trajectory_summary line under top_risk/top_protective. Both "Where support may be needed" AND "Positive trajectory · quietly going well" sections show sparklines — supports daily safeguarding stand-ups, manager handovers, Reg 44 prep, early intervention, and identifying children quietly improving. Tone preserved — NOT a risk league table. 6/6 new backend tests in /app/backend/tests/test_iteration42c.py + 49/49 regression (iter40b/41/42/42b) = 55/55 PASS. Testing agent code review: clean, exhaustive TRAJ_META, DRY sparkline reuse, no PII leakage, supportive tone preserved~~ (2026-02-16)
- ✅ ~~Iteration 43 (Phase F.1): Safer Recruitment & HR · Operational Personnel Files — major redesign of /hr around expandable folder-style modules that feel like a real Ofsted-ready HR drive (NOT generic HR software). 44-folder registry across 6 operational tabs (Recruitment 16 / Compliance 9 / Supervisions 4 / Training 6 / HR 10 / Audit). New `staff_personnel.py` deterministic RAG compute engine: per-folder status (green/amber/red/grey) from required-flag + expiry windows + review-windows. Sector-aware (children-default; adult sector ignores children-specific folders like Safer Recruitment Checks). Agency Compliance folder auto-hides unless `is_agency=true`. Real file uploads via existing /api/uploads infrastructure (10MB PDF/DOCX/PNG/JPG). NEW endpoints (manager+admin only): GET /api/hr/folders · GET /api/hr/staff (org-wide RAG dashboard sorted red-first) · GET /api/hr/staff/{id} (full personnel file with 6 tabs) · POST/PATCH/DELETE /api/hr/staff/{id}/files · PATCH /api/hr/staff/{id}/profile · GET /api/hr/staff/{id}/missing-items · GET /api/hr/staff/{id}/audit. Frontend rewritten: SaferRecruitment.jsx now an HR command centre (hero with 4 KPI tiles, search, staff list with RAG + agency badge + last-reviewed + top-missing chips). StaffPersonnelFile.jsx — drill-down with sticky header (RAG bar, profile, "Open all missing items" CTA), 6-tab nav with red-dot indicator per tab having any missing items, supportive tab questions ("Can this person legally and safely work here?", "Is this staff member currently compliant?"). PersonnelFolderCard.jsx — expandable folder with files list, expiry-pill per file (expired/Nd to expiry), inline edit metadata (expiry/review/notes), versioning support, delete with audit log. HRAuditTab.jsx — read-only timeline of every upload/update/delete/profile change. Missing-items drawer with click-through to jump-and-expand the right folder. Demo seed populates all 8 staff with realistic RAG spread (manager mostly green, senior expired Mandatory Training + DBS expiring soon, staff missing references). Full audit trail via existing record_audit. 18/18 new backend tests in /app/backend/tests/test_iteration43_hr.py + 46/46 regression = 64/64 PASS. Frontend E2E verified by testing agent: 100% pass on all spec'd flows and data-testids~~ (2026-02-17)
- ✅ ~~Iteration 44 (Phase F.2): Single Central Record (SCR) · Inspection-Ready One-Tap PDF — flagship operational SCR exporter. New `scr_pdf.py` (ReportLab A4 landscape with RAG-tinted cells, audit hash footer, Inspection-Ready badge band) + `build_scr_row()` / `build_scr()` in `staff_personnel.py` (deterministic one-row-per-staff with name/role/employment/start/DBS no-issue-expiry/barred-list/RTW/ID/refs/quals/training/supervision/appraisal/probation/overall RAG). NEW endpoints (manager+admin only): GET /api/hr/scr (live JSON dashboard with filter passthrough + KPI tiles) · GET /api/hr/scr.pdf (PDF export with audit log). Filters supported: non_compliant_only, role, employment_type, status. KPIs: compliant / expiring DBS 60d / overdue supervisions / missing references / expired training. Fixed a latent bug in `compute_folder_status`: review-window check now uses LATEST file's review-anchor + review_days (was incorrectly using MIN, which always fired red once any old file existed). Frontend: new `SCRDashboard.jsx` (premium hero with 5 KPI tiles, filter bar w/ checkbox + 3 selects + clear, RAG-coloured wide table 15 columns horizontal-scrollable, one-tap "Export Inspection-Ready PDF" button using blob download). Added "Open Single Central Record" CTA to `SaferRecruitment.jsx` hero. 13/13 new backend tests in /app/backend/tests/test_iteration43b_scr.py + 19/19 prior HR regression + 55/55 deeper regression = 87/87 PASS. Frontend E2E verified by testing agent: 100% pass, all 12 data-testids present, PDF download confirmed, determinism + RBAC + filter logic all green~~ (2026-02-18)
- ✅ ~~Iteration 45 (Phase F.3): Inspector Preview Link — secure time-limited public SCR access for Reg 44 visitors / Ofsted inspectors / RIs. New `inspector_links.py`: token generation (secrets.token_urlsafe(48) → 256 bits entropy), sha-256 hashed at rest, scope-locking `filter_inspector_payload()` allow-list (strips staff_id, role enum, missing_count, etc.), `make_qr_data_url()` (qrcode lib → base64 PNG). NEW endpoints: POST /api/hr/scr/inspector-link (manager+, 1h/4h/24h expiry only — strict validation rejects 0/2/3/5/12/48/etc., returns raw token ONCE in share_url + QR data URL + warning text, snapshots active filters), GET /api/hr/scr/inspector-links (manager+ list with token_prefix only — never full token), DELETE /api/hr/scr/inspector-link/{id} (idempotent revoke). PUBLIC unauthenticated GET /api/hr/scr/inspector-preview/{token} returns 200 with stripped SCR payload, 404 for invalid/expired/revoked (same response — no info leak), increments view_count + captures IP + UA. Frontend: new public `/inspector-preview/:token` route mounted OUTSIDE Protected/Layout (no sidebar, no auth gate) — banner "Read-only inspector preview · Expires {time}", privacy scope notice, KPI tiles, full SCR table; "Access expired" page for bad tokens. New `InspectorLinkManager.jsx` modal (two tabs: Create / Manage active links). Create tab: security warning band, expiry chip selector (1/4/24h), filter snapshot preview, required acknowledgement checkbox (disables submit until checked), ShareCard with copy-to-clipboard + QR image + "Link ready" celebration. Manage tab: link list with token_prefix display, Active/Expired/Revoked status pills, view_count + last_viewed_at, one-click Revoke with confirmation. Added "Inspector preview link" CTA to SCRDashboard hero. Every action audit-logged (hr_inspector_link_created/viewed/revoked). 17/17 new backend tests in /app/backend/tests/test_iteration45_inspector.py + 32/32 SCR+HR regression = 49/49 PASS. Frontend E2E verified: 100% on security-critical public flow + manager create + share + expired-page; minor UX polish applied to ensure manage-tab cleanly clears ShareCard state on tab switch~~ (2026-02-19)
- ✅ ~~Iteration 46 (Phase F.4): Manager Handover Digest — operational heartbeat of the home. New `handover_digest.py` deterministic cross-module aggregator with 9 sections (Safeguarding / Missing From Care / Incidents / Placement Stability / Home Intelligence / Staffing / Compliance / Child Spotlight / Manager Actions Required) + supportive Positives surface. Reuses existing engines (placement_stability, burnout_forecast, build_scr) — same data in → same digest out. New `handover_pdf.py` A4-portrait single-page executive PDF with KPI grid, action-required band, child spotlight, intelligence alerts/recs/positives, audit hash. NEW endpoints (manager+ only): GET /api/handover/digest?period=shift|week|month (JSON), GET /api/handover/digest.pdf?period=X (PDF with audit log as Ofsted-evidence of leadership oversight). Pattern detection: incident categories rising vs prior period; missing repeat patterns; supervision overdue spillover. Frontend: new `/handover-digest` route + 'Manager Digest' tab in StaffOperationsHub (tier<3 hidden). Hero with period chip selector (Morning handover / Weekly management / Monthly oversight) + PDF + Print + Email actions. "What do I need to do today?" red/amber band with Urgent / Overdue / Due today columns + Safeguarding sub-band. 8 RAG-coloured KPI tiles. Child Spotlight (3 cards: Most improved / Highest concern / Review required) each with why + evidence + recommended_action. Three-column body for Safeguarding & Missing / Incidents & Placement / Staffing & Compliance. Home Intelligence panel with cross-module alerts + recommendations + supportive positives. Email button drafts a mailto: handover summary. Print CSS hides controls. 18/18 new backend tests in /app/backend/tests/test_iteration46_handover.py + 49/49 prior regression = 67/67 PASS. Testing agent: backend 100%, RBAC verified, full UI render blocked by Playwright/sector-flow tooling (not a product issue) — main agent self-verified JSON + PDF integrity (alerts sensible, 6 actions detected, PDF 4.2KB valid)~~ (2026-02-20)
- 🔜 **Iteration 39 (next)**: Real notifications via Resend (email) + Twilio (SMS) — overdue safeguarding actions, missing return-interview reminders, escalations, supervisions, medication concerns, accountability assignments. Intelligent, limited, non-spammy, digest fallback.
- 🟡 **Iteration 40**: Workflow / UX / Mobile refinement — reduce-clicks audit on top 5 flows, mobile-first quick actions + handover sign-out/in, dashboard prioritisation, React Query caching, performance pass.
- 🟢 **Iteration 41**: Refactor server.py monolith (~8.5k lines) into /app/backend/routes/* modules.

## Implemented (2026-02-15 — Iteration 38 — Phase D · Live Staffing Operations)
- **`staffing_service.py`** — `build_staffing_overview(db)` single-call live operational dashboard derived from real rota + clock-in + leave + sleep-in + reflection data. Returns:
  - `on_shift_now[]` (with `clocked_in`, `is_late_clock_in`, `is_sleep_in`, `disturbance_count`)
  - `next_24h[]` upcoming roster
  - `coverage_gaps[]` (shift started >grace mins ago and not clocked in)
  - `ratios[]` per sector with `mode` (awake/asleep), `required` vs `actual`, status ok/warn/critical — uses sector-specific defaults (children's awake 1:2 / asleep 1:6, adult supported 1:2.5, elderly 1:3 etc.) which are admin-configurable.
  - `pressure{}` — overtime_staff_7d (>48h/wk), agency_pct_14d, sickness_pct_14d, sleep_ins_30d, disturbance_count_30d, pending_swaps, pending_leave, burnout_check_ins_14d (cross-link to Iter 33 wellbeing).
  - `config{}` — surfaced so the UI knows current thresholds.
  - Sensible UK defaults baked in (`DEFAULT_CONFIG`) but everything is overridable via `/api/staffing/config` (admin-only PATCH). Per-org configuration without code changes.
- **Backend endpoints** (Iter 38 block):
  - `GET /api/staffing/overview` (any auth) · `GET /api/staffing/config` (manager+) · `PATCH /api/staffing/config` (admin-only, audit-logged).
  - `POST /api/shifts/{id}/clock-in` / `clock-out` — self-only for staff, manager+ can clock-in for anyone. Returns `clock_in_variance_minutes` (signed: late = +ve), `actual_minutes_worked`, `overtime_minutes`. Audit-logged.
  - `POST /api/shifts/{id}/disturbance` — sleep-in disturbance log (paid waking time). Stores reason, minutes, optional resident_id. Auto-flags shift as `is_sleep_in=true`. Owner or senior+ only.
  - `GET/POST /api/leave-requests` · 6 kinds (annual_leave/sickness/parental/training/compassionate/unpaid). Staff scoped to self via `mine=true` query (also forced for tier<3). `POST /approve` / `/reject` manager+ only with `decision_notes`. `POST /cancel` allowed for owner or manager+.
  - `GET/POST /api/shift-swaps` — full lifecycle: requester creates (targeted at staff_id OR open to anyone) → `pending_target` or `open` → `POST /accept` (target or anyone if open, not requester) → `pending_manager` → `POST /approve` (manager+) atomically reassigns `shift.staff_id`. `POST /reject` and `/cancel` round it out. Cannot swap a shift already clocked in to.
  - `GET /api/staffing/mine` — fast staff endpoint: current shift, next shift in 24h, recent 7d, week_hours (sum of actual_minutes_worked or planned).
  - All write actions land in the `audit_events` collection (Iter 24 audit log).
- **Frontend Live Staffing Operations dashboard** (`/app/frontend/src/components/staffing/LiveStaffingOps.jsx`) — rendered at top of `/staff-operations` Rota & Shifts tab. Mobile-first. Care-sector flavour (not generic HR). Sections:
  - **MyShiftBar** — exported for re-use. For staff: shows current shift with Clock-in/out CTA, sleep-in icon, week hours rolling total, variance after clock-in. For managers: shows their own shift the same way. If no current shift but next in 24h, shows next-shift summary; otherwise a friendly "Coffee · no shift in the next 24h" state.
  - **Header banner** — awake/asleep cover mode aware (different gradient at night), live count e.g. "3/4 on shift now" with coverage-gap badge.
  - **Coverage gaps red strip** — only rendered when gaps exist; per-staff late-by minutes.
  - **On-shift-now grid** — initials avatar (green=clocked-in, amber=not yet), sleep-in moon icon, agency pill, disturbance count, manager-only "Log dist." CTA.
  - **Staffing ratios per sector** — only sectors with residents are shown, with required vs actual, gap, status pill (On track / Watch / Gap).
  - **Rota pressure tiles** — Agency cover · Sickness · Overtime · Sleep-in disturbances with status-coloured borders + overtime detail (heart icon, "+hours over threshold"), with a calm note about safeguarding focus implications.
  - **Workflow shortcuts** — Leave & sickness · Shift swaps · Team wellbeing · Inspection staffing tile, each surfacing pending counts when non-zero.
- **Frontend `/leave-requests`** — list with pill statuses, mobile-first request modal (kind select, date range with auto-day-count, reason). Manager Approve/Reject/Cancel; staff owner Cancel. Tab strip: My requests / Pending approval (mgr) / All (mgr).
- **Frontend `/shift-swaps`** — same shape. New-swap modal filters shift picker to only the requester's future not-clocked-in shifts. Target picker excludes self. Empty states are mobile-friendly. Manager Approve/Reject; either party can Cancel.
- **Schema additions**:
  - `Shift` extended with: `is_sleep_in` `is_agency` `clocked_in_at/by_id/by_name/geo/method` `clock_in_variance_minutes` `clocked_out_at/by_id/by_name/geo` `clock_out_notes` `actual_minutes_worked` `overtime_minutes` `sleep_in_disturbances[]`.
  - New collections: `leave_requests`, `shift_swap_requests`, `staffing_config` (singleton).
- **Tested**: 12/12 backend pytest in `/app/backend/tests/test_iteration38.py` (overview shape · config RBAC · clock-in/out lifecycle + self-only · sleep-in disturbance flow · leave full lifecycle + scoping · swap full lifecycle inc. shift reassignment + can't-swap-after-clock-in · /staffing/mine shape). 33/33 regression (iter34-37) PASS. `testing_agent_v3_fork` 100% pass on all targeted manager and staff flows including end-to-end clock-in/out, leave creation, swap request, sub-tab regression. Report: `/app/test_reports/iteration_34.json`.

## Implemented (2026-02-15 — Iteration 37 — Operational Ecosystem close-out)
- **Action Ownership &amp; Accountability** — `inspection_actions` schema upgraded with `assigned_to_id`, `assigned_to_name`, `due_date`, `escalated_at/by/to/reason`, `signed_off_at/by_name`, `evidence_notes`, full `action_log[]` audit trail per action. Backend endpoints:
  - `POST /api/inspection-actions` accepts assignee + due_date at creation (manager+).
  - `PATCH /api/inspection-actions/{id}` (senior+) for inline reassign, due-date change, status updates, evidence notes; auto-stamps `resolved_at`/`resolved_by_name`.
  - `POST /api/inspection-actions/{id}/escalate` (manager+) — bumps to high priority, stamps escalated_at/by/to + reason, audit-logged.
  - `POST /api/inspection-actions/{id}/sign-off` (manager+) — only on resolved actions, records signed_off_at/by_name + evidence_notes, audit-logged.
  - `GET /api/inspection-actions` decorates each item with computed `is_overdue` and `needs_escalation` flags.
- **Cross-Module Pattern Intelligence** (`/app/backend/cross_module_patterns.py`) — DETERMINISTIC aggregation across 9 collections (incidents · missing_episodes · medication_admins · education_records · documents · inspection_actions · regulation_44_visits · residents · audit_events). Returns:
  - Recurring themes (incident categories trending 30d)
  - Repeat-concern children (≥2 distinct concern types in 30d)
  - Escalation trends (this week vs last week deltas across 5 streams)
  - Unresolved risks (safeguarding open >48h, high-priority actions overdue, risk reviews overdue, documents expired)
  - Safeguarding hotspots (recurring locations, 4 time-of-day clusters with %, repeat residents ≥3 incidents)
  - Leadership blind spots (unowned active actions, resolved actions awaiting sign-off, no Reg 44 visit in 60d)
  - Endpoint: `GET /api/ofsted/cross-module-patterns` (senior+ only).
- **Strategy Meeting Pack PDF** (`/app/backend/strategy_meeting_pack_pdf.py`) — per-child one-click PDF for strategy / placement / serious-incident reviews. 11 sections: cover summary, risk profile, open safeguarding (60d), chronology table (60d), missing history + RIs, body maps, key work sessions (last 5), family contact / known associates with [RISK] tag, police involvement, outstanding inspection actions (with assignee + due), latest Reg 44 manager-oversight visit.
  - Endpoint: `GET /api/reports/strategy-meeting-pack/{resident_id}.pdf` (manager+ only). 404 on unknown resident. Audit-logged as `strategy_meeting_pack_download`.
- **Frontend — Ofsted Command Centre 4th tab**: "Cross-module intelligence" (`/app/frontend/src/pages/CrossModulePatternsView.jsx`) — full operational intelligence dashboard with gradient header, escalation trend chips (up/down/neutral), recurring themes, repeat-concern child cards with concern-type pills + deep-link to profile, unresolved risks 2-column grid with severity pills and deep-links, hotspots three-column (locations / time-of-day with bar gauges / repeat residents), leadership blind-spot list, and "generated at" footer.
- **Frontend — ActionPlanPanel rewrite** with full accountability UX: 4 summary tiles (Overdue / Unowned / Escalated / Awaiting sign-off — clickable to filter list); create form now exposes assignee dropdown + priority + due-date; per-action inline assignee selector + due-date picker (manager+ only); Overdue, Escalated and Signed off badges; Escalate modal with target picker + reason (audit-logged); Sign-off modal with optional evidence notes (only shown on resolved+unsigned items, manager+).
- **Frontend — Strategy Meeting Pack download** on Resident Profile → Safeguarding tab: prominent bar with single "Strategy pack" download button. Visible ONLY for children's residents (sector strictly enforced — adults excluded by design) and ONLY for manager+ tier.
- **Tested**: 10/10 backend pytest in `test_iteration37.py` (cross-module RBAC + payload shape + repeat-concern invariants · strategy pack RBAC + 404 + audit recording · action accountability lifecycle: create with assignee+due → reassign → escalate → resolve → sign-off; sign-off requires resolved; escalate RBAC; is_overdue flag for past due_date). 23/23 PASS Iter34/35/36 regression. Frontend testing_agent_v3_fork: 100% pass on all targeted flows including full lifecycle + sector and tier gating verification. See `/app/test_reports/iteration_33.json`.

## Implemented (2026-02-10 — Iteration 36 — Phase C: Simulation + Scan PDF + Auto-Draft)
- **Inspection Simulation Mode** (`/app/backend/inspection_simulation.py`) — DETERMINISTIC rules engine, NOT AI. Reads Regulation 44 + Command Centre payloads. Returns predicted Ofsted rating, 9 Quality Standards predicted judgement, likely strengths (≤8), likely weaknesses with reg+QS attribution, likely inspection concerns (≤10) with **inspector probe questions**, repeated compliance failures, safeguarding exposure, prioritised P0/P1 recommendations with concrete steps.
- **Pre-Inspection Readiness Scan PDF** — ReportLab single-document scan (manager+).
- **Regulation 44 auto-draft** — pre-fills the Reg 44 visit summary editor from live data: green modules → strengths · red/amber → development · high-severity concerns → immediate · recently_resolved → progress · simulation recs → recommendations · predicted rating → overall_judgement. Includes data_signature for traceability.
- **Frontend** (`InspectionSimulationView.jsx`) — 3rd tab on /ofsted with gradient banner, 9 QS cards, two-column strengths/weaknesses, inspection concerns with probe questions, prioritised recommendations.
- **Cross-tab auto-draft flow**: Auto-draft button → fetches draft → switches to Reg 44 tab → opens visit editor pre-filled with amber banner.
- **Backend endpoints**: GET `/api/ofsted/inspection-simulation` (senior+) · GET `/api/ofsted/regulation-44/auto-draft` (senior+) · GET `/api/ofsted/pre-inspection-scan.pdf` (manager+, audit-logged).
- **Tested**: 8/8 backend pytest in `test_iteration36.py`. Frontend Playwright: simulation tab, all sections, PDF download, RBAC per role, mobile, determinism. One critical bug fixed inline per testing-agent RCA (VisitSummaryPanel useEffect race overwriting auto-draft — gated with `!autoDraft`). See `/app/test_reports/iteration_32.json`.

## Implemented (2026-02-10 — Iteration 35 — Regulation 44 Operational Intelligence)
- **40-module Regulation 44 registry** (`/app/backend/regulation_44_modules.py`) organised into 8 categories: Home & Environment · Safeguarding & Risk · Health & Wellbeing · Young Person Records · Practice & Culture · Education & Engagement · Workforce · Governance & Compliance. Each module declares: regulation refs (Children's Homes Regs 2015 + statutory guidance), 9 Quality Standards mapping, evidence sources, mode (live/manual), fix_link.
- **25 LIVE modules** auto-compute from real platform data: home/H&S/fire safety, maintenance, safeguarding, risk assessments, behaviour mgmt, restraint, missing-from-care, incidents/accidents, medication, health appointments, YP files, care planning, missing documentation, key work, children's voice, therapeutic practice, education, training, supervision, staffing rotas, leadership oversight, manager monitoring, action plan. Each computes: indicators (live metric chips), overdue actions (deep-linked), pattern alerts (e.g. behaviour cluster, restraint cluster, repeat-missing), RAG score 0-100.
- **15 MANUAL modules** (location risk, food/nutrition, admissions, independence skills, equality/diversity, online safety, CCTV, visitors/contact, staff personnel, safer recruitment, agency staff, complaints, consequences, Reg 40 notifications, statement of purpose) — accept manager evidence notes. RAG flips green once a note is logged.
- **Regulation 44 visit summary** persistent collection with 6 fields (strengths · areas for development · immediate concerns · progress since last · recommendations · manager comments) + visit date · visitor name · overall judgement (outstanding/good/RI/inadequate).
- **Frontend** (`/app/frontend/src/pages/Regulation44View.jsx`): tab strip inside /ofsted (Command centre · Regulation 44 modules). Top summary with overall score + filters (search + RAG). 8 collapsible category accordions with RAG colouring, module count, red/amber counts. Each module is an expandable card showing: numeric badge, MANUAL pill, RAG pill, QS pills, indicator chips, regulation_refs pills, pattern alerts, outstanding actions with deep-links, manual evidence editor (manager+), evidence-source line, "Open operational area" link. Reg 44 visit summary panel (manager+ create). Collapsible 9-QS legend at the bottom.
- **Backend endpoints**: `GET /api/ofsted/regulation-44` (senior+) · `GET /api/ofsted/regulation-44/modules` · `POST /api/ofsted/regulation-44/notes` (manager+, upsert per module) · `GET/POST/DELETE /api/ofsted/regulation-44/visits` (senior list, manager+ write).
- **Tested**: 8/8 backend pytest in `test_iteration35.py` (40-module shape, 8 categories, live module spot-checks, adult-resident exclusion, notes RBAC + module-id validation, notes flip RAG to green, visits CRUD lifecycle, 401 unauth). Frontend Playwright covered: tab strip, 40 modules visible, accordion open/close, manual note add → RAG flips green, visit summary edit/save, RAG + search filters, RBAC parity (senior cannot add notes/visits; staff sees clean access-denied state), children-only scope verified at UI, mobile 390×844 clean. One UX nit caught by testing agent (staff stuck-loader) fixed inline with new `ofsted-access-denied` empty state. See `/app/test_reports/iteration_31.json`.

## Implemented (2026-02-10 — Iteration 34 — Ofsted Inspection Command Centre Phase A)
- **Complete rewrite of `/ofsted`** as a children's-services inspection war-room (sector strictly = children; adult sector untouched, lives at `/cqc-readiness`).
- **10 domain tiles** (Safeguarding · Missing · Health/Medication · Education · Documentation · Staffing · Home Environment · Key Work · Compliance · Resident Voice) with RAG rating + deep-links.
- **Live Safeguarding Overview** (4 metrics + pattern alerts for restraint/repeat-missing/self-harm/police clusters + recent 7d escalations).
- **Critical Actions panel** — prioritised high→medium→low feed with severity/domain/search filters.
- **Children Requiring Attention** — per-child cards with severity + reason list.
- **Manager Action Plan** — Active/Resolved-this-week tabs, audit-logged, with resolution attribution.
- **Dashboard tile** (`OfstedReadinessDashboardTile`, senior+) showing overall % + rating + high-priority count.
- **Backend**: `/api/ofsted/command-centre` (senior+) + `/api/inspection-actions` CRUD. New `inspection_actions` collection.
- **Tested**: 7/7 backend pytest in `test_iteration34.py`. Frontend Playwright all sections + RBAC + mobile. Three testing-agent findings (React dup-key, missing testids, mobile pill overlap) fixed inline. See `/app/test_reports/iteration_30.json`.

## Implemented (2026-02-10 — Iteration 33 — Staff Reflective Practice &amp; Wellbeing Hub)
- **New private space "My Reflection"** for staff wellbeing &amp; reflective practice — accessed ONLY via the sidebar user-avatar dropdown (sidebar remains locked at 7 items, no surveillance feel).
- **Privacy-first hybrid model**:
  - Wellbeing emoji check-ins (5 moods: overwhelmed/stressed/okay/positive/confident × shift_context) — owner-only on raw data; aggregated as anonymised 14-day trend visible to manager+.
  - Reflections (shift_reflection · win · guided) — PRIVATE by default. Staff toggles `shared_with_manager` per entry to opt in for supervision visibility.
  - Backend GET enforces: owner always; manager+ only when `shared_with_manager=true`.
- **5 reflection prompt sets**: shift_reflection (7 prompts: feel/went_well/challenging/emotional/supported/manager_aware/proud), Gibbs reflective cycle (6 stages), Trauma-informed reflection (6 prompts), Restorative reflection (5 prompts), Learning from incident (6 prompts).
- **Burnout pattern engine — supportive, never punitive**:
  - Staff view: gentle in-app nudge when 3+ stressed/overwhelmed check-ins in 14 days ("You've been stretched lately… would booking a chat with your manager — or just taking 10 minutes for yourself — help today?").
  - Manager view: anonymised dashboard tile "X team members may benefit from a wellbeing chat". Names appear ONLY for staff who have explicitly shared a reflection (rolls into `amber_anonymous_count` otherwise).
- **Manager supervision-prep view** (`/reflection/supervision/:userId`, manager-only): mood mix bar chart (14d), supervision flag if stress pattern detected, shared reflections list (private entries NEVER shown), win count shared.
- **Backend endpoints** (all under `/api/reflection/`):
  - `GET /prompt-sets` — metadata: 5 prompt sets + mood_meta (emoji/label/tone/score)
  - `POST /checkins` · `GET /checkins/mine` · `DELETE /checkins/{cid}` (own-only)
  - `POST /entries` · `GET /entries/mine` · `GET /entries/{eid}` (owner OR manager+ when shared) · `PATCH /entries/{eid}` · `DELETE /entries/{eid}` (owner-only)
  - `GET /my-pattern` — gentle supportive nudge for the staff member
  - `GET /wellbeing/awareness` (manager+) — team aggregate; names only for shared
  - `GET /supervision/{user_id}` (manager+) — full supervision-prep view (shared reflections + mood trend + amber flag)
- **Frontend pages**: `/reflection` (4 tabs: Overview / Shift reflections / Wins / Check-ins) + `/reflection/supervision/:userId` (manager-only) + new "Team Wellbeing" tab inside Staff Operations hub (manager+).
- **Tested**: 14/14 backend pytest in `test_iteration33.py` (privacy, RBAC, patterns, supervision view, team awareness, 401). Frontend Playwright covered all flows: avatar dropdown, check-in modal, all 3 reflection kinds, pattern nudge appearance, manager supervision view, privacy regression (private entries NEVER leak to manager, staff redirected from supervision route). Zero console errors. Sidebar remains at locked 7 items. See `/app/test_reports/iteration_29.json`.

## Implemented (2026-02-10 — Iteration 32 — Adult demo data &amp; deployment-readiness stress regression)
- **Realistic Adult Services demo seed** (`/app/backend/seed_adult_demo.py`, idempotent on startup):
  - **Tom Whitfield** (adult_supported_living): 10 care_tasks (4 missed in 7d → triggers `missed_care_cluster` pattern, 2 refused, 2 pending today, 2 completed), 5 wellbeing observations across 12 days showing a deterioration trend (mood: stable → flat → low → withdrawn → low, with sleep/nutrition decline) → triggers `wellbeing_deterioration` pattern, 1 near-miss fall (stairwell, signed off), 1 mobility assessment (low risk, sedation watch), 1 unsigned fluctuating MCA on evening medication refusal (with Voiceability advocate + family), 3 appointments (escalated CMHT review tomorrow).
  - **Margaret Lewis** (elderly_residential): 25 care_tasks (recurring 4-routine daily schedule across 7 days, 3 hygiene refusals per MCA-fluctuating plan, 2 pending today, 20 completed), 6 wellbeing observations (mood mostly stable but 1 agitated day, nutrition oscillating, sleep mostly poor/disturbed, 5 deterioration-flagged) → triggers `wellbeing_deterioration`, 2 falls in 30 days (1 signed off, 1 unsigned — A&E attendance, manager-action visible) → triggers `falls_cluster` pattern, 1 high-falls-risk mobility assessment (walking_aid, two-staff hoist), 2 MCA assessments (1 signed-off has_capacity, 1 unsigned fluctuating personal-care refusal with advocate), 5 health appointments (past GP/physio/A&amp;E + upcoming physio/orthopaedic).
- **Deliberately triggered**: 4 pattern engine rules (Tom: missed_care_cluster + wellbeing_deterioration · Margaret: falls_cluster + wellbeing_deterioration), high-severity operational alerts on both, manager-action backlog (2 unsigned items), CQC oversight indicators (fluctuating capacity status, nutrition/sleep concerns).
- **Cosmetic frontend fixes** (caught by testing agent, applied inline):
  - `ResidentDetail.jsx` header: `Young person` badge → `Service user` for adult sector.
  - `ResidentDetail.jsx` top action: `Child Missing` button now sector-gated (children's only). Active-missing badge text adapts to "Missing person" for adult sector.
- **Tested**: 31/31 backend pytest in `test_iteration32.py` (operational summary + chronology + pattern detection + filtering + PDF export + RBAC + audit). Backend perf excellent: operational-summary 7ms, timeline (49 events) 10ms, PDF 64ms — all well below 500/800/3000ms thresholds. Sector partitioning regression-clean. Frontend smoke verified Adult sector ribbons, 8 sector-correct Quick Actions, operational alerts visible on both adult profiles, mobile 390×844 clean. See `/app/test_reports/iteration_28.json` (testing agent's auto-numbered output).
- **Deployment Health Check**: env vars OK, no hardcoded URLs, CORS allows all, MongoDB-only persistence, uploads dir persistent, no secrets in source, supervisor managing backend+frontend+mongodb. Production-ready.

### P1
- Phase D — Staff Operations expansion inside the hub (sleep-in tracking, shift swaps, leave, clock in/out, daily staffing overview) — adds tabs to `/staff-operations`.
- Phase F — Safer Recruitment & HR build-out inside the existing Recruitment tab (DBS, right-to-work, interviews, SCR).
- Adult Services deepening (support plans, welfare/wellbeing, mood logs, hospital admissions, deeper CQC analytics).
- Phase B — full multi-tenant 9-role RBAC + organisation table (deferred).

### P2
- Phase E — Training/CPD certificate uploads.
- Real Email/SMS notifications (currently mocked).
- Refactor `server.py` (~6,700 lines) into `/app/backend/routes/` modules — admin + compliance + maintenance routers natural first slice.
- Refactor `HomeOperations.jsx` (~1,070 lines) into `/pages/operations/*`.
- Refactor `ResidentDetail.jsx` (~1,800 lines) into per-tab files.

## Test Credentials
See `/app/memory/test_credentials.md`.
