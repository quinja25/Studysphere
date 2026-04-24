# StudySphere — Project Context for Claude

## What is StudySphere?

An **AI-powered Q&A and study platform** for IB/A-Level students. The core product is a RAG-based AI tutor trained on curriculum-specific content (wiki articles, Q&A, past papers, uploaded notes) that answers subject questions with cited sources. Layered on top: community Q&A, alumni mentorship, study rooms (video + Pomodoro), gamified XP/streaks, and a resources marketplace.

**The primary differentiator is the AI**: it's scoped to the IB/A-Level curriculum, references the user's own uploaded documents, and improves via a community knowledge base — something generic ChatGPT cannot replicate.

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
- **Email Verification**: auto-send on register, `POST /users/send-verification`, `GET /users/verify-email`
- **Users**: profile CRUD (`bio`, `linkedinUrl`, `githubUrl`, `website`), XP/level, streaks, weekly goal, total study stats
- **Groups**: create/delete, bcrypt-hashed passwords, `POST /groups/:id/verify-password`
- **Chat**: real-time via Socket.io, pin/delete messages
- **AI (RAG)**: hybrid FULLTEXT + vector search over Wiki, Q&A, Posts, Resources; 50k token/day budget; quiz generation; `AiMessages` history; `/ai/suggest`, `/ai/ask` (stateless); provider abstracted in `server/services/openai.js`. Pipeline: cross-encoder reranker (`rerank.js`), conversational query rewriter (`queryRewriter.js`), HyDE (`hyde.js`), adaptive chunker (`adaptiveChunker.js`), query intent classifier (`queryIntent.js`) — all opt-in via env vars.
- **AI feedback loop**: `AiFeedback` table, `POST /ai/feedback`, thumbs up/down per message. `feedbackAggregates.js` computes per-source-type scoring influence.
- **Wiki / Q&A / Posts**: full CRUD, FULLTEXT search, tagging, embedding sync, view/vote counts
- **Resources Marketplace**: XP-gated unlock, download tracking, XP debt allowed
- **Streaks**: leaderboard, `node-cron` weekly reset Monday 00:00
- **Endorsements**: student→alumni one-per-pair
- **Admin/Trust**: `trustScore`, `isAdmin`, `isShadowBanned`, `TrustEvents`, `Reports`, shadow-ban at trustScore < 20
- **Embedding pipeline**: `ContentEmbeddings` table, in-memory cache + IVF index, bulk re-index on startup if empty
- **Session Recaps**: `SessionRecaps` table, AI summary after session
- **Session Goals**: `SessionGoals` table, +25 XP bonus on completion
- **Per-user documents**: `documentProcessor.js` (textbook/past-paper/notes chunking), `UserDocuments` model, `POST /ai/upload-document`, `GET /ai/documents`, `DELETE /ai/documents/:id`
- **Notifications**: `Notifications` table, `notificationService.createAndEmit()` — socket push to `user_${userId}` room. Wired for new answers, endorsements, admin report actions. REST: `GET /notifications`, `GET /notifications/unread-count`, `PUT /notifications/:id/read`, `PUT /notifications/read-all`, `DELETE /notifications/:id`.
- **Waitlist**: `WaitlistEntries` table. `POST /public/waitlist` (5/hr/IP), `GET /public/waitlist/count` (60s cache).
- **Public endpoints** (`server/routes/Public.js`, no auth): `GET /public/stats`, `GET /public/open-questions?limit=N`, `POST /public/ai-try` (IB preview, 3/day/IP, 200-char cap, no DB writes). All 30s cache-headered.

### Frontend
- **Auth**: Login, Register (email + Google OAuth), ForgotPassword + ResetPassword, `/verify-email` page
- **AI Chat** (`/ai-chat`): standalone RAG chat, source cards, provider badge, per-message thumbs feedback, ConfirmModal on doc delete, docType badge on cited uploaded documents — **primary AI surface**
- **Q&A / Wiki / Marketplace / Alumni**: full CRUD UIs, AI Suggest, tag pills, XP debt mechanic, endorsements, reports
- **Study Room** (`/group/:id`): WebRTC video, screen share, Pomodoro timer (socket-synced), chat sidebar, whiteboard, AI assistant sidebar (`AiAssistant.js` — same RAG + feedback controls as AI Chat), exit modal, Session Goals
- **Lobby** (`/lobby`): rooms list, streak reminder
- **Dashboard** (`/dashboard`): profile editing, XP bar, streak card, weekly goal ring, My Groups tab, Recaps tab
- **Chat / DMs** (`/chat`): Study Rooms vs Messages sidebar, `__dm_{min}_{max}` naming
- **Admin Dashboard** (`/admin`): stats, trust distribution, report queue, user management
- **Notification bell**: `NotificationContext` + socket, `<NotificationBell />` in NavBar — badge, dropdown, mark-read
- **Waitlist** (`/`): dark coming-soon page, animated counter, `<LiveStatsStrip />`, `<TryAiWidget />`
- **Public landing** (`/home`): IB-first hero, `<TryAiWidget />` (3 IB chips, posts to `/public/ai-try`)
- **Mentor landing** (`/for-mentors`): alumni value prop, live unanswered-Q feed, CTA → `/registration?role=alumni`
- **ConfirmModal**: replaces all `window.confirm()` calls

---

## RAG System

**Data flow:** Content created → `adaptiveChunker.chunkContent()` per-type chunks → embed → `ContentEmbeddings` BLOB. On query: `rewriteQuery()` (optional) → `retrieveContext()` kicks off `hyde()` + `classifyQuery()` + FULLTEXT in parallel → vector search → RRF merge → intent boosts → `rerank()` → inject into LLM prompt.

**Key files:**
| File | Responsibility |
|------|---------------|
| `server/services/embeddingService.js` | `chunkText()`, `findSimilar()` (in-memory cache + IVF), BLOB serialization |
| `server/services/embeddingSync.js` | `indexContent()`, `removeContent()`, `reindexAll()`; uses adaptive chunker |
| `server/services/adaptiveChunker.js` | `chunkContent(sourceType, record)` — type-aware chunks |
| `server/services/ragRetriever.js` | `retrieveContext()` — parallel HyDE + intent + FULLTEXT + vector, RRF, boosts, rerank |
| `server/services/rerank.js` | `rerank(query, chunks)` — Cohere or Ollama cross-encoder, opt-in |
| `server/services/hyde.js` | `generateHypotheticalAnswer()` — opt-in HyDE |
| `server/services/queryRewriter.js` | `rewriteQuery(message, history)` — conversational rewrite, opt-in |
| `server/services/queryIntent.js` | `classifyQuery()` — heuristic (free) or LLM mode, per-source boosts |
| `server/services/feedbackAggregates.js` | `sourceTypeStats()`, `sourcePerformance()` — aggregate thumbs feedback |
| `server/services/openai.js` | `chatCompletion()`, `createEmbedding()`, `createEmbeddingBatch()` — provider-abstracted |
| `server/routes/Ai.js` | `/ai/chat`, `/ai/ask`, `/ai/quiz`, `/ai/sources`, `/ai/reindex` |
| `server/routes/AiFeedback.js` | `/ai/feedback` POST/my/stats |

**Vector search:** In-memory cache (pre-normalized Float32Array). IVF index built when corpus ≥ `RAG_IVF_MIN_ROWS` (500) — k-means into √n clusters, probes top 15%.

**Scoring bonuses:** +0.1 recency, log views/likes, +0.3 accepted answer, +0.15 alumni author, +0.3 subject match, +0.025 user-uploaded doc post-RRF. RRF merge (`k=60`).

**Adding a new content type:** (1) Add case to `getContentText()` in `embeddingSync.js`. (2) Add to `reindexAll()`. (3) Add to `sourceType` ENUM + migrate. (4) Add FULLTEXT search fn in `ragRetriever.js`. (5) Add to `retrieveContext()` Promise.all. (6) Hook CRUD routes with `indexContent`/`removeContent`.

**RAG env vars:** `OPENAI_API_KEY`, `OLLAMA_BASE_URL/MODEL/EMBED_MODEL`, `AI_DAILY_TOKEN_LIMIT` (50000), `RAG_MAX_CHUNKS` (5), `RAG_CHUNK_SIZE` (150), `RAG_CHUNK_OVERLAP` (50), `RAG_SIMILARITY_THRESHOLD` (0.5), `RAG_IVF_MIN_ROWS` (500), `RAG_IVF_NPROBE` (0=auto), `RAG_ADAPTIVE_CHUNKS` (default `true`), `RAG_RERANK_PROVIDER` (`cohere`/`ollama`/`off`), `RAG_RERANK_CANDIDATES` (20), `COHERE_API_KEY`, `RAG_QUERY_REWRITE_ENABLED` (default off), `RAG_HYDE_ENABLED` (default off), `RAG_INTENT_MODE` (`heuristic`/`llm`/`off`, default heuristic).

---

## RAG Upgrade Paths

**Shipped (all behind env flags; default flags keep cost at zero):**

| # | Upgrade | Files | Flag | Status |
|---|---------|-------|------|--------|
| 1 | Cross-encoder reranker | `rerank.js` | `RAG_RERANK_PROVIDER` | Live, off by default |
| 2 | Conversational query rewriter | `queryRewriter.js` | `RAG_QUERY_REWRITE_ENABLED` | Live, off by default |
| 3 | HyDE | `hyde.js` | `RAG_HYDE_ENABLED` | Live, off by default, skipped for queries > 120 chars |
| 5 | Adaptive per-type chunking | `adaptiveChunker.js` | `RAG_ADAPTIVE_CHUNKS` | Live, **on** by default |
| 7 | Query intent classifier + boosts | `queryIntent.js` | `RAG_INTENT_MODE` | Live, heuristic default (free) |
| 8 | Thumbs feedback loop | `AiFeedback` + `feedbackAggregates.js` | — | Live |
| 9 | Post-RRF personalization boost | `ragRetriever.js` | always-on when `userId` present | Live |

**Not yet shipped:**
- **pgvector migration** — swap MySQL BLOB → Postgres `vector(1536)` + HNSW index. Defer until corpus > 50k chunks (~3–5 days).
- **Embedding model upgrade** — `text-embedding-3-small` → `text-embedding-3-large`. Defer until reranker + rewrite + HyDE are all enabled and still saturating (~6.5× cost).
- **Feedback-driven scoring** — wire `feedbackAggregates.sourcePerformance()` into RRF as a nightly prior.
- **RAG eval harness** — `server/scripts/rag-eval.js`, 20 golden-pair queries, measures recall@5 + MRR.

---

## API Endpoints

**Users:** `GET /users/`, `GET /users/public`, `GET /users/:id`, `POST /users/register`, `POST /users/login`, `POST /users/google-login`, `POST /users/refresh`, `PUT /users/:id`, `PUT /users/updateXP/:id`, `POST /users/forgot-password`, `POST /users/reset-password`, `POST /users/send-verification`, `GET /users/verify-email`

**Groups:** `GET /groups/`, `GET /groups/byID/:id`, `POST /groups/`, `POST /groups/:id/verify-password`, `DELETE /groups/:id`

**Group Membership:** `POST/DELETE /groupsUsers/user/:userId/group/:groupId`, `GET /groupsUsers/byUser/:userId`, `GET /groupsUsers/byGroup/:groupId`

**Chats:** `GET /chats/:groupId`, `POST /chats/`, `PUT /chats/pin/:id`, `DELETE /chats/:id`

**AI:** `POST /ai/chat`, `POST /ai/ask`, `POST /ai/quiz`, `POST /ai/suggest`, `GET /ai/sources`, `GET /ai/history/:groupId`, `DELETE /ai/history/:groupId`, `GET /ai/credits`, `POST /ai/reindex`, `POST /ai/upload-document`, `GET /ai/documents`, `DELETE /ai/documents/:id`

**AI Feedback:** `POST /ai/feedback` (body: `{queryText, rating, messageId?, clickedSources?, comment?}`), `GET /ai/feedback/my`, `GET /ai/feedback/stats/mine`

**Recaps:** `POST /recaps/generate`, `GET /recaps/byUser/:userId`, `GET /recaps/:id`

**Streaks:** `GET /streaks/me`, `GET /streaks/leaderboard`, `GET /streaks/:userId`, `GET /streaks/history/:userId`, `PUT /streaks/goal`

**Content:** Standard CRUD at `/posts`, `/wiki`, `/qa`, `/resources`, `/endorsements`, `/reports`. Writes require auth.

**Admin** (requires `isAdmin`): `GET /admin/dashboard`, `GET /admin/reports`, `PUT /admin/reports/:id`, `GET /admin/users`, `PUT /admin/users/:id/ban|unban|make-admin`

**Notifications:** `GET /notifications`, `GET /notifications/unread-count`, `PUT /notifications/:id/read`, `PUT /notifications/read-all`, `DELETE /notifications/:id`. Real-time via Socket.io `notification:new` to `user_${userId}`.

**Public (no auth, rate-limited):** `GET /public/stats`, `GET /public/open-questions?limit=N`, `POST /public/ai-try` (3/day/IP), `GET /public/waitlist/count`, `POST /public/waitlist`

**Socket.io:** `join_room` → `room_state`; `send_message` → `receive_message`; `whiteboard_draw/clear` → broadcast; WebRTC offer/answer point-to-point routing.

---

## Data Models (Key Fields)

**Users**: id, name, email, username, password, role ENUM('student','alumni'), isVerified, xp, level, curriculum, subject, targetUniversity, major, gradeLevel, isPublic, bio, linkedinUrl, githubUrl, website, aiCreditsUsed, aiCreditsResetAt, currentStreak, longestStreak, lastStudyDate, weeklyGoalMinutes (120), weeklyStudiedMinutes, totalStudyMinutes, totalSessions, trustScore (100.0), isAdmin, isShadowBanned, isPro, proExpiresAt, stripeCustomerId

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
**ContentEmbeddings**: sourceType ENUM('wiki','question','answer','resource','post','document'), sourceId, chunkIndex, chunkText, embedding BLOB (Float32Array), tokenCount, subject
**SessionRecaps**: groupId FK, generatedBy FK, summary, topicsCovered JSON, actionItems JSON, participantIds JSON, durationMinutes, startedAt, endedAt
**SessionGoals**: userId FK, groupId FK, goal STRING, isCompleted, completedAt
**Notifications**: userId FK, type ENUM('answer','endorsement','report_actioned'), relatedType, relatedId, content STRING(500), link, isRead. Indexed on (userId, isRead) and (userId, createdAt).
**AiFeedback**: userId FK, messageId (nullable), queryText STRING(1000), rating ENUM('up','down'), comment STRING(1000) nullable, clickedSources TEXT (JSON array `{source, sourceId}`).
**WaitlistEntries**: email STRING UNIQUE, role ENUM('student','alumni','other'), curriculum STRING nullable.

---

## Tests

```bash
cd server && npm test          # 462 backend tests, 29 suites
cd client && CI=true npm test  # 26 passing; 7 suites blocked by react-router-dom v7 ESM × CRA Jest 27 incompat
cd e2e && npx playwright test  # 41 E2E tests (requires dev server on :3000)
```

RAG test files: `rerank.test.js` (10), `queryRewriter.test.js` (8), `hyde.test.js` (7), `adaptiveChunker.test.js` (25), `queryIntent.test.js` (18), `aiFeedback.test.js` (11), `feedbackAggregates.test.js` (7). Notifications: `notifications.test.js` (15) + `notificationService.test.js` (5). Public: `public.test.js` (18).

Remaining gaps: E2E study room (WebRTC needs browser media permissions), `/diary` routes (Spaced Repetition not shipped), client Jest config for react-router-dom ESM.

---

## What to Implement Next

**Gate 0 — Deploy** (blocker for everything): Railway (backend) + Vercel (frontend). `railway.json` and `vercel.json` already exist. ~2 hrs.

**Gate 0b — Waitlist**: Test form locally, then share in `r/IBO`, `r/alevel`, Discord servers. Add PostHog snippet (`client/public/index.html`) — key events: `waitlist_signup`, `public_ai_try_submit`.

**Gate 1 — Retention**: Onboarding flow (set subject → join/create room → first Pomodoro → first streak day). **Spaced Repetition** — exit modal captures topics → `DiaryEntries` table → SM-2 → `/review` deck (+5 XP). Endpoints: `POST /diary`, `GET /diary/due`, `PUT /diary/:id/review`. Pro-gated.

**Gate 2 — Revenue**: Stripe paywall — `<ProGate>` component + `POST /billing/checkout|webhook|portal`. `isPro`/`proExpiresAt`/`stripeCustomerId` already on Users model.

**Backlog:**
- Global document library — `GlobalDocuments` model, admin upload, `indexGlobalDocument()` in `embeddingSync.js`, add to retriever with +0.2 bonus
- Per-user doc persistence — wire `GET /ai/documents` into `/ai-chat` (frontend only)
- Feedback-driven RAG scoring — nightly job wiring `feedbackAggregates` into RRF prior

---

## Monetization

**Pricing:**
- **Free:** 10 AI queries/day, 3 document uploads, stateless AI, unlimited rooms + streaks
- **Student Pro ($7/mo or $59/yr):** Unlimited AI queries + documents, conversational memory, Spaced Repetition, weekly progress email
- **Alumni:** Free forever
- **Institution:** $3–5/student/yr

**Pro is "Personal AI Tutor"**: the free tier uses only the shared knowledge base; Pro adds the student's own uploaded documents with prioritized recall and conversational memory. Upgrade prompts trigger at: document limit hit, generic AI answer, follow-up question attempt, Spaced Repetition tab view.

**Revenue roadmap:** (1) Deploy → (2) PostHog analytics → (3) Spaced Repetition (primary daily-use Pro feature) → (4) Stripe paywall → (5) Referral system → (6) Bounty system (Stripe Connect, pays alumni per accepted answer) → (7) Institutional portal.

---

## Alumni Retention Strategy

Alumni need a selfish reason to stay — altruism doesn't scale. The core value prop for mentors is **a verifiable mentorship credential**, not a favor. Answering a few questions/week builds a public profile ("Helped 47 IB students in Physics HL") linkable on LinkedIn — a real differentiator for early-career grads (22-25) that no other platform offers outside formal programs.

**Sequencing:**
1. **Credential first** — LinkedIn-verified badge + public profile with contribution metrics. Free to operate, no revenue dependency.
2. **Bounties second** — Stripe Connect payouts funded by Pro subscription revenue. Don't build until paying students exist.

**Key principle:** Document uploads are a student behavior, not an alumni ask. Mentors answer questions — that's the atomic unit of value.

---

## Seed Data

```bash
node server/seed.js                    # seed + generate RAG embeddings (needs API key)
node server/seed.js --skip-embeddings  # seed DB only; run POST /ai/reindex later
node server/seed.js --content-only     # skip users, re-seed content tables only
```

**Test users** (password: `password123`, admin: `admin123`):
- `student1@test.com` / `student2@test.com` / `student3@test.com` — student (CS, Biology, Physics)
- `alumni1@test.com` / `alumni2@test.com` / `alumni3@test.com` — alumni (CS, Biology, Maths)
- `admin@test.com` — admin

---

## Local Dev Setup

Backend needs MySQL at `127.0.0.1:3306`.

```bash
# Homebrew (macOS)
brew install mysql && brew services start mysql
mysql -u root -e "CREATE DATABASE IF NOT EXISTS studysphere; CREATE DATABASE IF NOT EXISTS studysphere_test;"

# Or Docker
docker run -d --name studysphere-mysql -p 3306:3306 \
  -e MYSQL_ROOT_PASSWORD=password -e MYSQL_DATABASE=studysphere mysql:8
```

`server/.env` minimum: `DB_USER=root`, `DB_PASSWORD=`, `DB_NAME=studysphere`, `DB_HOST=127.0.0.1`

On first boot the server auto-seeds `IbSubjects` and triggers a background RAG reindex if `ContentEmbeddings` is empty. Run `node server/seed.js` to load sample content for the `/public/open-questions` feed.

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
- **WebRTC TURN**: set `REACT_APP_TURN_URL/USERNAME/CREDENTIAL` in `client/.env`; without TURN, symmetric NAT fails
