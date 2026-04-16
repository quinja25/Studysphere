# StudySphere — Project Context for Claude

## What is StudySphere?

A **virtual study room + community platform** connecting students with alumni. Features real-time collaborative sessions (video, chat, screen share), gamified XP/leveling, alumni mentorship, and AI-powered study tools.

---

## Tech Stack

- **Frontend**: React (CRA), React Router v6, Socket.io-client, Google OAuth (`@react-oauth/google`)
- **Backend**: Node.js / Express, Socket.io, Sequelize ORM, MySQL
- **Auth**: JWT (15min access + 30d refresh) + Google OAuth (server-side token verify)
- **AI**: OpenAI `gpt-4o-mini` + `text-embedding-3-small`. Set `OLLAMA_BASE_URL` to use local Ollama (`llama3.2` + `nomic-embed-text`)
- **Config**: All secrets via `.env`. `server/config/config.js` reads env vars for Sequelize.

---

## What's Built

### Backend
- **Auth**: register/login (email + Google OAuth), bcrypt, JWT refresh tokens, rate limiting, `api.js` auto-refresh on 401
- **Email Verification**: auto-send on register, `POST /users/send-verification`, `GET /users/verify-email`; dev fallback logs link to console
- **Users**: profile CRUD (`bio`, `linkedinUrl`, `githubUrl`, `website`), XP/level, streaks, weekly goal, `StudySessions`, total study stats
- **Groups**: create/delete, bcrypt-hashed passwords, `hasPassword` scrubbed from GET, `POST /groups/:id/verify-password`
- **Group Membership**: add/remove, list by user or group
- **Chat**: real-time via Socket.io, pin/delete messages
- **AI (RAG)**: hybrid FULLTEXT + vector search over Wiki, Q&A, Posts, Resources; 50k token/day budget; quiz generation; `AiMessages` history; `/ai/suggest`, `/ai/ask` (stateless); provider abstracted in `server/services/openai.js`
- **Wiki / Q&A / Posts**: full CRUD, FULLTEXT search, tagging (`tags` TEXT column, comma-separated), embedding sync, view/vote counts
- **Resources Marketplace**: XP-gated unlock, `UserResources`, download tracking, XP debt allowed
- **Streaks**: leaderboard, `node-cron` weekly reset Monday 00:00
- **Endorsements**: student→alumni one-per-pair
- **Admin/Trust**: `trustScore`, `isAdmin`, `isShadowBanned`, `TrustEvents`, `Reports`, shadow-ban at trustScore < 20
- **Embedding pipeline**: `ContentEmbeddings` table, in-memory cache + IVF index, bulk re-index on startup if empty
- **Session Recaps**: `SessionRecaps` table, AI summary after session, Dashboard "Recaps" tab
- **Session Goals**: `SessionGoals` table, +25 XP bonus on completion
- **Per-user documents**: `documentProcessor.js` (textbook/past-paper/notes chunking), `UserDocuments` model, `POST /ai/upload-document`, `GET /ai/documents`, `DELETE /ai/documents/:id`

### Frontend
- **Auth**: Login, Register (email + Google OAuth), ForgotPassword + ResetPassword, `/verify-email` page, Dashboard resend banner
- **Study Room** (`/group/:id`): WebRTC video (adaptive quality), screen share, mic/cam toggle, Pomodoro timer (socket-synced), chat sidebar, whiteboard sidebar, AI assistant sidebar (RAG + quiz + PDF upload), ambient sound, exit modal (XP/level-up/streak/recap preview), Session Goals banner, `sendBeacon` fallback; TURN via `REACT_APP_TURN_URL/USERNAME/CREDENTIAL`
- **Lobby** (`/lobby`): rooms list, streak reminder banner, right-click delete (host only)
- **Find Group** (`/find-group`): filter, privacy badge, password modal
- **Dashboard** (`/dashboard`): profile editing, XP bar, streak card, weekly goal ring, study stats, My Groups tab, Recaps tab
- **Chat / DMs** (`/chat`): Study Rooms vs Messages sidebar, `__dm_{min}_{max}` naming
- **Q&A / Wiki / Marketplace / Alumni**: full CRUD UIs, AI Suggest, tag pills, XP debt mechanic, endorsements, reports
- **AI Chat** (`/ai-chat`): standalone RAG chat, source cards, provider badge
- **Admin Dashboard** (`/admin`): stats, trust distribution, report queue, user management
- **Schedule** (`/schedule`): Google Calendar OAuth
- **ConfirmModal**: replaces all `window.confirm()` calls, supports `danger` prop

---

## RAG System

**Data flow:** Content created → `embeddingSync.js` chunks (~150 tokens, 50 overlap) → `openai.js` embeds → `ContentEmbeddings` BLOB → on query: parallel FULLTEXT + vector search → RRF merge → top N chunks injected into LLM prompt.

**Key files:**
| File | Responsibility |
|------|---------------|
| `server/services/embeddingService.js` | `chunkText()`, `findSimilar()` (in-memory cache + IVF), BLOB serialization |
| `server/services/embeddingSync.js` | `indexContent()`, `removeContent()`, `reindexAll()` |
| `server/services/ragRetriever.js` | `retrieveContext()` — parallel FULLTEXT + vector, RRF, scoring bonuses |
| `server/services/openai.js` | `chatCompletion()`, `createEmbedding()`, `createEmbeddingBatch()` — provider-abstracted |
| `server/routes/Ai.js` | `/ai/chat`, `/ai/ask`, `/ai/quiz`, `/ai/sources`, `/ai/reindex` |

**Vector search:** In-memory cache (pre-normalized Float32Array). IVF index built when corpus ≥ `RAG_IVF_MIN_ROWS` (500) — k-means into √n clusters, probes top 15%. Cache invalidated on every write.

**Scoring bonuses:** +0.1 recency, log views/likes, +0.3 accepted answer, +0.15 alumni author, +0.3 subject match. RRF merge (`k=60`).

**Adding a new content type:** (1) Add case to `getContentText()` in `embeddingSync.js`. (2) Add to `reindexAll()`. (3) Add to `sourceType` ENUM + migrate. (4) Add FULLTEXT search fn in `ragRetriever.js`. (5) Add to `retrieveContext()` Promise.all. (6) Hook CRUD routes with `indexContent`/`removeContent`.

**RAG env vars:** `OPENAI_API_KEY`, `OLLAMA_BASE_URL/MODEL/EMBED_MODEL`, `AI_DAILY_TOKEN_LIMIT` (50000), `RAG_MAX_CHUNKS` (5), `RAG_CHUNK_SIZE` (150), `RAG_CHUNK_OVERLAP` (50), `RAG_SIMILARITY_THRESHOLD` (0.5), `RAG_IVF_MIN_ROWS` (500), `RAG_IVF_NPROBE` (0=auto).

---

## API Endpoints

**Users:** `GET /users/`, `GET /users/public`, `GET /users/:id`, `POST /users/register`, `POST /users/login`, `POST /users/google-login`, `POST /users/refresh`, `PUT /users/:id`, `PUT /users/updateXP/:id`, `POST /users/forgot-password`, `POST /users/reset-password`, `POST /users/send-verification`, `GET /users/verify-email`

**Groups:** `GET /groups/`, `GET /groups/byID/:id`, `POST /groups/`, `POST /groups/:id/verify-password`, `DELETE /groups/:id`

**Group Membership:** `POST/DELETE /groupsUsers/user/:userId/group/:groupId`, `GET /groupsUsers/byUser/:userId`, `GET /groupsUsers/byGroup/:groupId`

**Chats:** `GET /chats/:groupId`, `POST /chats/`, `PUT /chats/pin/:id`, `DELETE /chats/:id`

**AI:** `POST /ai/chat`, `POST /ai/ask`, `POST /ai/quiz`, `POST /ai/suggest`, `GET /ai/sources`, `GET /ai/history/:groupId`, `DELETE /ai/history/:groupId`, `GET /ai/credits`, `POST /ai/reindex`, `POST /ai/upload-document`, `GET /ai/documents`, `DELETE /ai/documents/:id`

**Recaps:** `POST /recaps/generate`, `GET /recaps/byUser/:userId`, `GET /recaps/:id`

**Streaks:** `GET /streaks/me`, `GET /streaks/leaderboard`, `GET /streaks/:userId`, `GET /streaks/history/:userId`, `PUT /streaks/goal`

**Content:** Standard CRUD at `/posts`, `/wiki`, `/qa`, `/resources`, `/endorsements`, `/reports`. Writes require auth.

**Admin** (requires `isAdmin`): `GET /admin/dashboard`, `GET /admin/reports`, `PUT /admin/reports/:id`, `GET /admin/users`, `PUT /admin/users/:id/ban|unban|make-admin`

**Socket.io:** `join_room` → `room_state`; `presence` → `user_joined`; `send_message` → `receive_message`; `whiteboard_draw/clear` → broadcast; `disconnect` → `user_left`; WebRTC offer/answer point-to-point routing.

---

## Data Models (Key Fields)

**Users**: id, name, email, username, password, role ENUM('student','alumni'), isVerified, xp, level, curriculum, subject, targetUniversity, major, gradeLevel, openHours, isPublic, picture, bio, linkedinUrl, githubUrl, website, aiCreditsUsed, aiCreditsResetAt, currentStreak, longestStreak, lastStudyDate (DATEONLY), weeklyGoalMinutes (120), weeklyStudiedMinutes, weeklyGoalResetAt, totalStudyMinutes, totalSessions, trustScore (100.0), isAdmin, isShadowBanned, bannedAt, banReason, isPro, proExpiresAt, stripeCustomerId

**Groups**: id, groupName, major, subject, gradeLevel, leader, isPublic, password (hashed), maxParticipants (10)

**Chats**: author, message, time, isPinned, GroupId FK

**AiMessages**: role ENUM('user','assistant'), content, tokens, groupId FK, userId FK

**StudySessions**: userId FK, groupId FK, startedAt, endedAt, durationMinutes, xpEarned

**Questions**: title, body, subject, authorId FK, isAnswered, tags (comma-separated)
**Answers**: content, questionId FK, authorId FK, isAccepted, votes
**WikiArticles**: title, content, subject, authorId FK, views, tags
**Posts**: title, content, type ENUM('blog','advice'), authorId FK, likes
**Resources**: title, description, content, price, authorId FK, type, downloads
**Endorsements**: studentId FK, alumniId FK, message — UNIQUE(studentId, alumniId)
**UserResources**: userId FK, resourceId FK — UNIQUE
**UserDocuments**: userId FK, title, subject, docType ENUM('textbook','past_paper','notes','other'), pageCount, chunkCount
**TrustEvents**: userId FK, reportedBy FK, type ENUM('report','warning','ban','unban','trust_decrease','trust_increase'), reason, trustDelta, newTrustScore
**Reports**: reporterId FK, reportedUserId FK, type ENUM('spam','harassment','inappropriate','impersonation','other'), description, status ENUM('pending','reviewed','dismissed','actioned')
**ContentEmbeddings**: sourceType ENUM('wiki','question','answer','resource','post'), sourceId, chunkIndex, chunkText, embedding BLOB (Float32Array), tokenCount, subject
**SessionRecaps**: groupId FK, generatedBy FK, summary, topicsCovered JSON, linksShared JSON, actionItems JSON, participantIds JSON, durationMinutes, startedAt, endedAt
**SessionGoals**: userId FK, groupId FK, goal STRING, isCompleted, completedAt

---

## Tests

Full pyramid — all passing. Run:
```bash
cd server && npm test          # 325 backend tests (routes, services, socket, integration/SQLite)
cd client && CI=true npm test  # 140 frontend component tests
cd e2e && npx playwright test  # 41 E2E tests (requires CRA dev server on :3000)
```
Remaining gap: E2E study room flow (WebRTC requires browser media permissions), `/diary` routes (when Spaced Repetition ships).

---

## Technical Debt

| Priority | Item | Effort | Notes |
|----------|------|--------|-------|
| 1 | **Deployment** (Railway + Vercel) | 1–2 days | Backend → Railway, frontend → Vercel, DB → Railway MySQL or Supabase pgvector |
| 2 | **CI/CD** (GitHub Actions) | 0.5 days | `cd server && npm test`, `cd client && npm test`, `cd e2e && npx playwright test` |
| 3 | **pgvector migration** | 3–5 days | Swap MySQL BLOBs → PostgreSQL `vector(1536)` + HNSW index |
| 4 | **Docker** | 1 day | `docker-compose.yml` with mysql:8 + server + client services |
| 5 | **Vite migration** | 1–2 days | Replace CRA; swap `REACT_APP_*` → `VITE_*`, `process.env` → `import.meta.env` |
| 6 | **TypeScript** | 1–2 weeks | Incremental: services → models → routes → frontend |

---

## What to Implement Next

### Next Sprint
1. **Spaced Repetition** — exit modal captures topics → `DiaryEntries` table → SM-2 algorithm → `/review` deck (Forgot/Hard/Good/Easy, +5 XP). Service: `server/services/spacedRepetition.js`. Endpoints: `POST /diary`, `GET /diary/due`, `PUT /diary/:id/review`, `PUT /diary/:id/archive`. Pro-gated.

### Backlog
- **Global document library** — `GlobalDocuments` model (no userId, adds curriculum/storagePath), admin upload routes at `/admin/documents`, `indexGlobalDocument()` in `embeddingSync.js`, add to `ragRetriever.js` Promise.all with +0.2 scoring bonus, Documents tab in AdminDashboard. ~1.5 days work; per-user pipeline already reusable.
- **Per-user doc persistence** — wire `GET /ai/documents` into `/ai-chat` page so uploaded PDFs are queryable outside the study room. Frontend-only change.
- Notification bell (`Notifications` table + socket `user_${userId}` rooms)
- Room energy indicator (message rate → energy score broadcast every 30s)
- Alumni availability heatmap (`ActivityLogs`, 7×24 grid)
- Peer reviews for Marketplace (`ResourceReviews`, star rating)
- Mobile app (React Native + Expo) — see iOS App Strategy below

---

## Business Features (Unbuilt)

**Pricing:** Free ($0, 10 AI/day) | Student Pro ($5/mo or $39/yr, unlimited AI + Pro features) | Alumni (free forever) | Institution ($3–5/student/yr)

**Revenue roadmap (priority order):**
1. **SEO meta tags + sitemap** — `react-helmet` on `/wiki/:id` + `/qa/:id`, `GET /sitemap.xml`, `public/robots.txt`
2. **Shareable achievement cards** — `html2canvas` → share at streak milestones + level-ups; OG tags on `/alumni/:id`
3. **Stripe paywall** — `POST /billing/checkout|webhook|portal`; `ProGate` component; gates: unlimited AI, recaps, spaced repetition. Env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID`. Note: `isPro`/`proExpiresAt`/`stripeCustomerId` already on Users model.
4. **Referral system** — `referralCode` on Users, `POST /users/claim-referral`, 7-day Pro trial for both parties
5. **Alumni LinkedIn verification** — LinkedIn OAuth → verify education → `isVerified = true`, checkmark badge
6. **Weekly progress email** — `node-cron` Monday 9 AM, nodemailer, opt-out via `emailNotifications` flag on Users
7. **Institutional admin portal** — `Institutions` table, email domain auto-assign Pro, `/institution-admin` page

---

## iOS App Strategy

**Decision: React Native + Expo.** Backend (REST + Socket.io) is unchanged. Auth logic ports with minor token-storage changes (`localStorage` → `expo-secure-store`). Expo Router mirrors React Router v6.

**Critical gotchas:**
- Screen share is impossible on iOS (ReplayKit limitation) — omit from study room
- Apple IAP required for in-app Pro subscriptions (StoreKit + `POST /billing/apple-iap/webhook`); Stripe stays for web
- JWT must be stored in Keychain via `expo-secure-store`, not AsyncStorage
- Google OAuth uses `expo-auth-session` instead of `@react-oauth/google`
- Background WebRTC needs CallKit — defer to post-MVP

**Backend additions needed:** `PUT /users/device-token` (store APNS token), `server/services/pushService.js` (FCM/APNS), `/.well-known/apple-app-site-association` for Universal Links, `POST /billing/apple-iap/webhook` (Phase 4).

**Phased roadmap:**

| Phase | Scope | Effort |
|-------|-------|--------|
| 1 — Core Loop | Auth, Dashboard, Lobby, Study room (chat + Pomodoro only), push notifications, deep links | 6–8 weeks |
| 2 — Study Room Parity | WebRTC video, whiteboard (`react-native-skia`), AI sidebar, Recaps, ambient sounds | 4–6 weeks |
| 3 — Content & Community | Q&A, Wiki, Alumni, DMs, AI Chat, Leaderboard | 4–6 weeks |
| 4 — Monetization | StoreKit Pro subscription, ProGate, Spaced Repetition deck | 2–3 weeks |

**Project structure:** `mobile/` at monorepo root alongside `client/` and `server/`, using Expo Router file-based routing under `mobile/app/`.

---

## Seed Data

**Script:** `server/seed.js`

```bash
node server/seed.js                    # seed + generate RAG embeddings (needs API key)
node server/seed.js --skip-embeddings  # seed DB only; run POST /ai/reindex later
node server/seed.js --content-only     # skip users, re-seed content tables only
```

Idempotent — skips rows that already exist. Seeds: 7 WikiArticles, 6 Questions, 7 Answers, 5 Resources, 5 Posts across CS/Maths/Physics subjects.

**Test users** (all password: `password123`):
- `student1@test.com` — student, CS
- `student2@test.com` — student, Biology
- `student3@test.com` — student, Physics
- `alumni1@test.com` — alumni, CS
- `alumni2@test.com` — alumni, Biology
- `alumni3@test.com` — alumni, Maths
- `admin@test.com` — admin (password: `admin123`)

---

## Recruiter-Visible Polish

### Still to do

| # | Issue | Fix |
|---|-------|-----|
| 1 | **Not deployed** | Railway (backend) + Vercel (frontend) — ~2 hrs. Link in README and GitHub About. |
| 2 | **`Group.js` is ~980 lines** | Extract `useWebRTC`, `useChatRoom`, `usePomodoro` hooks. Target < 300 lines. |
| 3 | **No TypeScript** | Incremental: services → models → routes → frontend |
| 4 | **CRA (deprecated)** | Migrate to Vite; swap `REACT_APP_*` → `VITE_*` |
| 5 | **No CI/CD** | Add `.github/workflows/test.yml` — runs `npm test` on server + client |
| 6 | **No Docker** | `docker-compose.yml` with mysql:8 + server + client |
| 7 | **No React ErrorBoundary** | Add one top-level `<ErrorBoundary>` in `App.js` |
| 8 | **No API docs** | Add `docs/api.md` or JSDoc comments on route files |
| 9 | **Commit discipline** | Use conventional commits going forward: `feat:`, `fix:`, `refactor:`, `test:`, `chore:` |

### Already done
- README with live demo link, tech stack, and run instructions
- `server/.env.example` and `client/.env.example`

---

## Marketing Strategy: Customer Release

### Target Audience

| Segment | Profile | Acquisition channel |
|---------|---------|-------------------|
| High school students (16–18) | IB, A-Level, AP exam pressure | Reddit (`r/IBO`, `r/alevel`, `r/APStudents`), Discord study servers |
| University undergrads (18–22) | Seeking accountability + alumni advice | Reddit, LinkedIn, "productivity" content |
| Alumni (22–30) | Want mentorship identity | LinkedIn outreach — free forever, zero friction to join |

### Positioning

> **"The study room that never closes."**

Lead with: (1) AI trained on your curriculum, (2) real study rooms with video + whiteboard, (3) streak gamification, (4) alumni who already passed your exams.

---

### Go-to-Market: Phase 1 — Community Seeding (Pre-launch, 4–6 weeks)

Goal: 200–500 engaged beta users before public launch. Do not charge yet.

1. **Reddit / Discord** — Post in `r/IBO`, `r/alevel`, `r/APStudents`. Lead with the pain ("tired of studying alone on Discord?"), not features. Join 3–5 active IB/A-Level Discord servers.
2. **School ambassador program** — 1 student per school runs a StudySphere room for their friend group. Incentive: permanent Pro + "Ambassador" badge + referral link.
3. **Alumni LinkedIn outreach** — Message recent IB/A-Level graduates offering free mentor status. Alumni presence drives student signups; students drive alumni engagement.

### Go-to-Market: Phase 2 — Public Launch

| Channel | Action |
|---------|--------|
| Product Hunt | Launch day post |
| Hacker News | "Show HN: StudySphere — AI study rooms for IB/A-Level students" |
| Reddit | Authentic posts in target subs |
| TikTok / Reels | 60s screen recording of the study room in action |
| Twitter/X | Dev thread: "I spent 6 months building this" |

**Day-1 requirements:** live deployment URL, 10 seed users already in rooms, README + GitHub repo linked.

---

### Growth Loops

1. **Streak sharing** — 7-day streak → prompt to share a card (`html2canvas`). Designed for Instagram Stories / Twitter.
2. **Session invite** — create room → copy invite link → classmates join → register. One session = multiple signups.
3. **Alumni discovery** — student endorses alumni → alumni shares profile on LinkedIn → new student signups.
4. **AI quality** — more PDF uploads → richer RAG → better answers → word of mouth.

---

### Content Marketing (SEO)

| Content | Target keyword |
|---------|---------------|
| Wiki articles per subject | "IB Physics HL past papers", "A-Level Maths revision" |
| Q&A pages | Long-tail subject questions |
| Landing page copy | "free study rooms online", "pomodoro timer study" |
| Blog / advice posts | "how to study for IB exams with AI" |

Quick wins: `react-helmet` OG tags on `/wiki/:id` + `/qa/:id`, `GET /sitemap.xml`, submit to Google Search Console on launch day.

---

### Retention

- **Day 1–7**: onboarding flow (set subject → join room → first Pomodoro). Email at 24h if no session started.
- **Week 1–Month 1**: daily streak reminder, weekly progress email (Monday), Session Recap email after each exit.
- **Month 1+**: Spaced Repetition deck, weekly leaderboard reset, alumni endorsements create social stakes.
- **Churn signals**: no session in 5 days → streak-at-risk email; no login in 14 days → rejoin prompt.

---

### Monetization Sequencing

| Milestone | Action |
|-----------|--------|
| 0–500 MAU | Free only — focus on retention and NPS |
| 500–2k MAU | Soft-launch Student Pro ($5/mo) to power users |
| 2k–10k MAU | Stripe paywall live; ProGate on AI + Recaps + Spaced Repetition |
| 10k+ MAU | Institutional plan — approach school IT coordinators |
| Post-PMF | Apple IAP for iOS |

Free tier must remain genuinely useful (10 AI/day, unlimited rooms + streaks). Users hitting the AI cap are the best conversion targets.

---

### Key Metrics

| Metric | Month 1 target | Month 3 target |
|--------|---------------|---------------|
| Signups | 200 | 1,000 |
| MAU | 100 | 500 |
| Sessions/week | 50 | 300 |
| D7 retention | 20% | 35% |
| Avg streak (active) | 3 days | 7 days |
| NPS | — | > 40 |

Use **PostHog** (open source, free tier) for event tracking. Key events: `signup`, `session_started`, `session_ended`, `ai_message_sent`, `streak_continued`, `pro_upgrade`.

---

### Pre-Launch Checklist

- [ ] Live deployment (Railway + Vercel)
- [ ] OG meta tags (`react-helmet`) on wiki + Q&A pages
- [ ] Google Analytics or PostHog snippet added
- [ ] 10 seed users + real rooms and Q&A content (`node server/seed.js`)
- [ ] 5 school ambassadors recruited
- [ ] 10 alumni profiles live on the platform
- [ ] Product Hunt draft ready (screenshots, tagline)

---

## Dev Notes

- Safe SQL only — parameterized inputs, no raw string interpolation
- Secrets via `.env` only — never hardcoded
- XP changes always go through `PUT /users/updateXP/:id`
- Real-time features use Socket.io unless stated otherwise
- Trust score must be considered for any new social interaction type
- `isAdmin` is read from `localStorage.userData` — takes effect after next login
- AI provider abstracted in `server/services/openai.js` — use `chatCompletion()` and `createEmbedding()`, never instantiate OpenAI directly
- `/ai/ask` is stateless (history from client); `/ai/chat` stores history in `AiMessages` (requires groupId)
- **WebRTC TURN**: set `REACT_APP_TURN_URL/USERNAME/CREDENTIAL` in `client/.env`; without TURN, symmetric NAT (school/corporate) will fail
