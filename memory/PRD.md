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
- 🔜 **Iteration 32 candidates**: Pre-deploy health check · Strategy Meeting Pack PDF (chronology + risk + missing + body maps in 1 click) · Adult-services demo data seeding so adult residents arrive populated · Care task scheduler/template (recurring routines).

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
