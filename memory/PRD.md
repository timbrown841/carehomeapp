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

## Backlog
### P0
- Edit/delete UX in UI (currently API-only for some entities).
- Resident detail page with timeline (notes + incidents).

### P1
- CSV export of incidents/notes for inspections.
- Manager email/SMS alert on new safeguarding flag.
- User management UI (admin) — currently only seed accounts.
- Photo upload for residents.

### P2
- Trend charts (incidents per resident over time).
- Customisable note categories per home.
- Audit log of edits.
- Migrate FastAPI on_event → lifespan context manager.
- Brute-force login lockout (5 fails / 15 min).

## Test Credentials
See `/app/memory/test_credentials.md`.
