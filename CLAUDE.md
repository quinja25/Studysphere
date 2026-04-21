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
- **AI (RAG)**: hybrid FULLTEXT + vector search over Wiki, Q&A, Posts, Resources; 50k token/day budget; quiz generation; `AiMessages` history; `/ai/suggest`, `/ai/ask` (stateless); provider abstracted in `server/services/openai.js`. RAG pipeline now includes cross-encoder reranker (`rerank.js`), conversational query rewriter (`queryRewriter.js`), HyDE (`hyde.js`, skipped for queries > 120 chars), type-aware chunker (`adaptiveChunker.js`), query intent classifier with per-source boosts (`queryIntent.js`) — all opt-in via env vars, run in parallel with FULLTEXT search where possible.
- **AI feedback loop**: `AiFeedback` table, `POST /ai/feedback`, `GET /ai/feedback/my`, `GET /ai/feedback/stats/mine`. `feedbackAggregates.js` service computes per-source-type up/down counts for scoring influence.
- **Wiki / Q&A / Posts**: full CRUD, FULLTEXT search, tagging (`tags` TEXT column, comma-separated), embedding sync, view/vote counts
- **Resources Marketplace**: XP-gated unlock, `UserResources`, download tracking, XP debt allowed
- **Streaks**: leaderboard, `node-cron` weekly reset Monday 00:00
- **Endorsements**: student→alumni one-per-pair
- **Admin/Trust**: `trustScore`, `isAdmin`, `isShadowBanned`, `TrustEvents`, `Reports`, shadow-ban at trustScore < 20
- **Embedding pipeline**: `ContentEmbeddings` table, in-memory cache + IVF index, bulk re-index on startup if empty
- **Session Recaps**: `SessionRecaps` table, AI summary after session, Dashboard "Recaps" tab
- **Session Goals**: `SessionGoals` table, +25 XP bonus on completion
- **Per-user documents**: `documentProcessor.js` (textbook/past-paper/notes chunking), `UserDocuments` model, `POST /ai/upload-document`, `GET /ai/documents`, `DELETE /ai/documents/:id`
- **Notifications**: `Notifications` table, `notificationService.createAndEmit()` persists + pushes via Socket.io `user_${userId}` room. Emitters wired for new answers (notify question author), new endorsements (notify alumni), and admin report actions (notify reporter). REST routes: `GET /notifications`, `GET /notifications/unread-count`, `PUT /notifications/:id/read`, `PUT /notifications/read-all`, `DELETE /notifications/:id`. All routes auth-scoped to the current user.
- **Waitlist**: `WaitlistEntries` table (email unique, role, curriculum). `POST /public/waitlist` (5/hr/IP rate limit, email validation, idempotent findOrCreate, returns total count). `GET /public/waitlist/count` (60s cache). No auth required.
- **Public landing endpoints** (`server/routes/Public.js`, no auth): `GET /public/stats` returns `{studentsOnline, activeRooms, questionsLast24h, unansweredQuestions, lastAnswerMinutesAgo}` — `studentsOnline`/`activeRooms` read from the Socket.io presence map exposed via `app.set('roomUsers', ...)`, DB counts fail-safe to 0. `GET /public/open-questions?limit=3` returns recent unanswered questions (capped at 6). `POST /public/ai-try` is a no-auth IB-aware AI preview: `express-rate-limit` 3/day/IP, 200-char prompt cap, `trust proxy` respected, IB command-term guidance injected into system prompt, **no DB writes**. All three cache-headered (30 s).

### Frontend
- **Auth**: Login, Register (email + Google OAuth), ForgotPassword + ResetPassword, `/verify-email` page, Dashboard resend banner
- **Study Room** (`/group/:id`): WebRTC video (adaptive quality), screen share, mic/cam toggle, Pomodoro timer (socket-synced), chat sidebar, whiteboard sidebar, AI assistant sidebar (RAG + quiz + PDF upload), ambient sound, exit modal (XP/level-up/streak/recap preview), Session Goals banner, `sendBeacon` fallback; TURN via `REACT_APP_TURN_URL/USERNAME/CREDENTIAL`
- **Lobby** (`/lobby`): rooms list, streak reminder banner, right-click delete (host only)
- **Find Group** (`/find-group`): filter, privacy badge, password modal
- **Dashboard** (`/dashboard`): profile editing, XP bar, streak card, weekly goal ring, study stats, My Groups tab, Recaps tab
- **Chat / DMs** (`/chat`): Study Rooms vs Messages sidebar, `__dm_{min}_{max}` naming
- **Q&A / Wiki / Marketplace / Alumni**: full CRUD UIs, AI Suggest, tag pills, XP debt mechanic, endorsements, reports
- **AI Chat** (`/ai-chat`): standalone RAG chat, source cards, provider badge, per-message thumbs up/down feedback (posts to `/ai/feedback` with `clickedSources`), ConfirmModal on doc delete, docType badge + title on cited uploaded documents.
- **Study Room AI sidebar** (`AiAssistant.js`): same thumbs feedback controls on every assistant message.
- **Admin Dashboard** (`/admin`): stats, trust distribution, report queue, user management
- **Notification bell**: `NotificationContext` opens a socket to `user_${userId}`, initial fetch via `GET /notifications`, optimistic mark-read. `<NotificationBell />` mounted in `NavBar`: bell icon + red badge, dropdown with click-through to `n.link`, mark-all-read, per-item dismiss.
- **Waitlist landing** (`/`): Dark-themed coming-soon page. Email + role + curriculum signup form posting to `POST /public/waitlist`. Live animated waitlist counter (`GET /public/waitlist/count`). `<LiveStatsStrip />`, `<TryAiWidget />`, features grid, testimonials. IntersectionObserver scroll reveal. `Waitlist.js` + `Waitlist.css`.
- **Public landing** (`/home`): IB-first hero ("Get a 7 in IB. Together."), `<LiveStatsStrip />` pulling `/public/stats` on 60 s poll, `<TryAiWidget />` (3 IB sample chips, 200-char cap, posts to `/public/ai-try`, 429 → sign-up CTA, shows cited source pills). Copy leads with "the only AI trained on the IB curriculum" USP. (Moved from `/` to `/home` to make room for the waitlist page.)
- **Mentor landing** (`/for-mentors`): separate alumni-facing page. Hero "Your IB experience is worth paying for" + projected-impact card ($24–$80/mo bounty projection, Verified Mentor credit). Reuses `<LiveStatsStrip items={MENTOR_ITEMS} />` for alumni-relevant metrics (unanswered questions first). Live unanswered-Q feed from `/public/open-questions`. Four pillars — Earn (coming soon), Verified Badge (live), Cohorts (coming soon), Email-reply (coming soon). Mentor social-proof cards + honest FAQ. CTA → `/registration?role=alumni`.
- **Shared components**: `LiveStatsStrip` accepts a custom `items` prop so the same component drives both student and mentor stat rows. `Home.js` nav + `ForMentors.js` nav cross-link each audience.
- **Schedule** (`/schedule`): Google Calendar OAuth
- **ConfirmModal**: replaces all `window.confirm()` calls, supports `danger` prop

---

## RAG System

**Data flow:** Content created → `adaptiveChunker.chunkContent()` per-type chunks (Q+acceptedAnswer, wiki section boundaries, 200-tok post windows; falls back to flat sliding-window if `RAG_ADAPTIVE_CHUNKS=false`) → `openai.js` embeds → `ContentEmbeddings` BLOB. On query: `rewriteQuery()` (optional) → `retrieveContext()` kicks off `hyde()` + `classifyQuery()` + FULLTEXT in parallel → vector search with HyDE text (or original) → RRF merge → apply intent boosts → `rerank()` top candidates → slice to maxChunks → inject into LLM prompt.

**Key files:**
| File | Responsibility |
|------|---------------|
| `server/services/embeddingService.js` | `chunkText()`, `findSimilar()` (in-memory cache + IVF), BLOB serialization |
| `server/services/embeddingSync.js` | `indexContent()`, `removeContent()`, `reindexAll()`; uses adaptive chunker when enabled |
| `server/services/adaptiveChunker.js` | `chunkContent(sourceType, record)` — type-aware chunks |
| `server/services/ragRetriever.js` | `retrieveContext()` — parallel HyDE + intent + FULLTEXT + vector, RRF, boosts, rerank |
| `server/services/rerank.js` | `rerank(query, chunks)` — Cohere or Ollama cross-encoder, opt-in |
| `server/services/hyde.js` | `generateHypotheticalAnswer()` — opt-in HyDE |
| `server/services/queryRewriter.js` | `rewriteQuery(message, history)` — conversational rewrite, opt-in |
| `server/services/queryIntent.js` | `classifyQuery()` — heuristic (free) or LLM mode, returns per-source-type boosts |
| `server/services/feedbackAggregates.js` | `sourceTypeStats()`, `sourcePerformance()` — aggregate thumbs feedback |
| `server/services/openai.js` | `chatCompletion()`, `createEmbedding()`, `createEmbeddingBatch()` — provider-abstracted |
| `server/routes/Ai.js` | `/ai/chat`, `/ai/ask`, `/ai/quiz`, `/ai/sources`, `/ai/reindex` — all wire query rewriter |
| `server/routes/AiFeedback.js` | `/ai/feedback` POST/my/stats |

**Vector search:** In-memory cache (pre-normalized Float32Array). IVF index built when corpus ≥ `RAG_IVF_MIN_ROWS` (500) — k-means into √n clusters, probes top 15%. Cache invalidated on every write.

**Scoring bonuses:** +0.1 recency, log views/likes, +0.3 accepted answer, +0.15 alumni author, +0.3 subject match. RRF merge (`k=60`).

**Adding a new content type:** (1) Add case to `getContentText()` in `embeddingSync.js`. (2) Add to `reindexAll()`. (3) Add to `sourceType` ENUM + migrate. (4) Add FULLTEXT search fn in `ragRetriever.js`. (5) Add to `retrieveContext()` Promise.all. (6) Hook CRUD routes with `indexContent`/`removeContent`.

**RAG env vars:** `OPENAI_API_KEY`, `OLLAMA_BASE_URL/MODEL/EMBED_MODEL`, `AI_DAILY_TOKEN_LIMIT` (50000), `RAG_MAX_CHUNKS` (5), `RAG_CHUNK_SIZE` (150), `RAG_CHUNK_OVERLAP` (50), `RAG_SIMILARITY_THRESHOLD` (0.5), `RAG_IVF_MIN_ROWS` (500), `RAG_IVF_NPROBE` (0=auto), `RAG_ADAPTIVE_CHUNKS` (default `true`), `RAG_RERANK_PROVIDER` (`cohere`/`ollama`/`off`), `RAG_RERANK_CANDIDATES` (20), `RAG_RERANK_MODEL` (for Ollama), `COHERE_API_KEY`, `RAG_QUERY_REWRITE_ENABLED` (default off), `RAG_HYDE_ENABLED` (default off), `RAG_INTENT_MODE` (`heuristic`/`llm`/`off`, default heuristic).

---

## RAG Upgrade Paths

**Shipped (all behind env flags; default flags keep cost at zero):**

| # | Upgrade | Files | Flag | Status |
|---|---------|-------|------|--------|
| 1 | Cross-encoder reranker (Cohere or Ollama) | `rerank.js` | `RAG_RERANK_PROVIDER` | Live, off by default |
| 2 | Conversational query rewriter | `queryRewriter.js` + `Ai.js` | `RAG_QUERY_REWRITE_ENABLED` | Live, off by default |
| 3 | HyDE | `hyde.js` | `RAG_HYDE_ENABLED` | Live, off by default, skipped for queries > 120 chars |
| 5 | Adaptive per-type chunking | `adaptiveChunker.js` + `embeddingSync.js` | `RAG_ADAPTIVE_CHUNKS` | Live, **on** by default |
| 7 | Query intent classifier + per-source boosts | `queryIntent.js` | `RAG_INTENT_MODE` | Live, heuristic mode default (free) |
| 8 | Thumbs feedback loop | `AiFeedback` model + `/ai/feedback` + `feedbackAggregates.js` | — | Live, frontend wired in `AiChat.js` + `AiAssistant.js` |
| 9 | Post-RRF personalization boost | `ragRetriever.js` `retrieveContext()` | always-on when `userId` present | Live — user-uploaded `document` chunks get +0.025 rrfScore after RRF merge + intent boosts. Combined with pre-RRF +0.3 in `vectorSearch()`. Safe: `source === 'document'` is user-scoped only; `global_document` is a separate ENUM. |

Pipeline efficiency: HyDE + intent classify kicked off in parallel with FULLTEXT search; vector search only blocks on HyDE; worst-case serial LLM calls when every flag enabled = 3 (rewrite → HyDE/intent parallel → final answer) + 1 HTTP call (reranker).

**Not yet shipped (deliberate defer):**

### 4. pgvector migration
**Symptom:** corpus > 100k chunks, in-memory IVF eats RAM and cold-starts slowly.
**Fix:** move `ContentEmbeddings.embedding` from MySQL BLOB → Postgres `vector(1536)` with HNSW index. Already listed in Tech Debt.
- **How**: dump embeddings via `pg_dump`-style script; provision Supabase/Railway Postgres with pgvector; swap `findSimilar()` to `SELECT ... ORDER BY embedding <=> $1 LIMIT $2`. Drop the in-memory cache entirely.
- **Effort**: 3–5 days. Defer until production corpus exceeds ~50k chunks.

### 6. Embedding model upgrade
**Symptom:** recall plateaus on scientific / IB-specific vocabulary.
**Fix:** swap `text-embedding-3-small` (1536-d) → `text-embedding-3-large` (3072-d) or cross-lingual `BGE-M3`.
- **How**: change `createEmbedding()` model + schema: `embedding BLOB` → new column sized for 3072 dims. Must full re-index; old + new can't coexist on one column.
- **Cost**: 6.5× embedding cost, 2× storage. Defer until reranker + query rewrite + HyDE are all enabled and still saturate.

### Next-step bets not in the original list
- **Feedback-driven scoring:** wire `feedbackAggregates.sourcePerformance()` into the RRF score as a small per-source prior. Nightly job, not per-query.
- **RAG eval harness:** `server/scripts/rag-eval.js` with 20 golden-pair queries from `server/seed.js`, measures recall@5 and MRR. Re-run before flipping any RAG env flag in production so regressions are caught.

---

## API Endpoints

**Users:** `GET /users/`, `GET /users/public`, `GET /users/:id`, `POST /users/register`, `POST /users/login`, `POST /users/google-login`, `POST /users/refresh`, `PUT /users/:id`, `PUT /users/updateXP/:id`, `POST /users/forgot-password`, `POST /users/reset-password`, `POST /users/send-verification`, `GET /users/verify-email`

**Groups:** `GET /groups/`, `GET /groups/byID/:id`, `POST /groups/`, `POST /groups/:id/verify-password`, `DELETE /groups/:id`

**Group Membership:** `POST/DELETE /groupsUsers/user/:userId/group/:groupId`, `GET /groupsUsers/byUser/:userId`, `GET /groupsUsers/byGroup/:groupId`

**Chats:** `GET /chats/:groupId`, `POST /chats/`, `PUT /chats/pin/:id`, `DELETE /chats/:id`

**AI:** `POST /ai/chat`, `POST /ai/ask`, `POST /ai/quiz`, `POST /ai/suggest`, `GET /ai/sources`, `GET /ai/history/:groupId`, `DELETE /ai/history/:groupId`, `GET /ai/credits`, `POST /ai/reindex`, `POST /ai/upload-document`, `GET /ai/documents`, `DELETE /ai/documents/:id`

**AI Feedback:** `POST /ai/feedback` (body: `{queryText, rating, messageId?, clickedSources?, comment?}`), `GET /ai/feedback/my`, `GET /ai/feedback/stats/mine`. All auth-scoped.

**Recaps:** `POST /recaps/generate`, `GET /recaps/byUser/:userId`, `GET /recaps/:id`

**Streaks:** `GET /streaks/me`, `GET /streaks/leaderboard`, `GET /streaks/:userId`, `GET /streaks/history/:userId`, `PUT /streaks/goal`

**Content:** Standard CRUD at `/posts`, `/wiki`, `/qa`, `/resources`, `/endorsements`, `/reports`. Writes require auth.

**Admin** (requires `isAdmin`): `GET /admin/dashboard`, `GET /admin/reports`, `PUT /admin/reports/:id`, `GET /admin/users`, `PUT /admin/users/:id/ban|unban|make-admin`

**Notifications** (auth-scoped): `GET /notifications` (paginated), `GET /notifications/unread-count`, `PUT /notifications/:id/read`, `PUT /notifications/read-all`, `DELETE /notifications/:id`. Real-time push via Socket.io event `notification:new` to `user_${userId}` room.

**Public (no auth, rate-limited):** `GET /public/stats` (live presence + DB counts), `GET /public/open-questions?limit=N` (unanswered questions, N≤6), `POST /public/ai-try` (IB preview AI, 3/day/IP, prompt ≤200 chars, no DB writes), `GET /public/waitlist/count` (60s cached), `POST /public/waitlist` (5/hr/IP, email + role + curriculum, idempotent).

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
**Notifications**: userId FK, type ENUM('answer','endorsement','report_actioned'), relatedType, relatedId, content STRING(500), link, isRead (default false). Indexed on (userId, isRead) and (userId, createdAt).
**AiFeedback**: userId FK, messageId (nullable — null for stateless `/ai/ask`), queryText STRING(1000), rating ENUM('up','down'), comment STRING(1000) nullable, clickedSources TEXT (JSON array of `{source, sourceId}`). Indexed on (userId, createdAt) and (rating, createdAt).
**WaitlistEntries**: email STRING UNIQUE, role ENUM('student','alumni','other'), curriculum STRING nullable.

---

## Tests

Full pyramid — all backend passing. Run:
```bash
cd server && npm test          # 462 backend tests across 29 suites (routes, services, socket, integration/SQLite)
cd client && CI=true npm test  # 26 passing; 7 suites blocked by pre-existing react-router-dom v7 ESM × CRA Jest 27 incompat
cd e2e && npx playwright test  # 41 E2E tests (requires CRA dev server on :3000)
```
Coverage of RAG upgrades: `rerank.test.js` (10), `queryRewriter.test.js` (8), `hyde.test.js` (7), `adaptiveChunker.test.js` (25), `queryIntent.test.js` (18), `aiFeedback.test.js` (11), `feedbackAggregates.test.js` (7). Notifications: `notifications.test.js` (15) + `notificationService.test.js` (5). Public landing: `public.test.js` (18 — stats shape, socket-room counting, DB-failure fallback, rate-limit with per-IP keying via `X-Forwarded-For`, IB prompt injection, open-questions filter/limit/no-auth).

Remaining gaps: E2E study room flow (WebRTC requires browser media permissions), `/diary` routes (when Spaced Repetition ships), client Jest config fix for react-router-dom ESM.

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

### Priority Order (as of 2026-04-21)

**Gate 0 — Deploy (blocker for everything)**
1. **Deploy** — Railway (backend) + Vercel (frontend). `railway.json` and `vercel.json` already exist. Nothing is testable or shareable until a live URL exists. ~2 hrs.

**Gate 0b — Waitlist activation**
2. **Test waitlist page locally** — verify form submits, counter animates, success state renders. Then share URL in `r/IBO`, `r/alevel`, relevant Discord servers.
3. **PostHog analytics** — add snippet to `client/public/index.html`. Key events: `waitlist_signup`, `public_ai_try_submit`. Required before scaling traffic — can't measure conversion without it.

**Gate 1 — Retention proof (no money yet)**
4. **Onboarding flow** — set subject → join/create room → first Pomodoro → first streak day. New users currently land cold with no guidance.
5. **Spaced Repetition** — highest-value Pro-gated feature. See Next Sprint below.

**Gate 2 — Revenue**
6. **Stripe paywall** — `<ProGate>` component + `POST /billing/checkout|webhook|portal`. Gates Spaced Repetition + Recaps. `isPro`/`proExpiresAt`/`stripeCustomerId` already on Users model. ~2–3 days.

---

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

## Personalization & Monetization Strategy

The core monetization strategy is to offer a **Student Pro** subscription that transforms the AI from a generic helper into a "Personal AI Tutor." This tutor has two sources of knowledge:

1.  **The Shared Knowledge Base:** A high-quality, curriculum-specific database of Wiki articles, Q&A, and official resources (e.g., `GlobalDocuments`). This is the default "brain" available to all users, ensuring baseline accuracy for subjects like "IB Physics HL."
2.  **The Personal Knowledge Base:** A private, secure space for each student's own materials—class notes, textbooks, past papers—uploaded as documents. This is what makes the AI feel personal.

The Pro tier is designed to supercharge the **Personal Knowledge Base** and create a seamless, intelligent blend between the two.

### Pro Tier Features (The "Personalized Feel")

1.  **A Deeper Personal Knowledge Base:**
    *   **Unlimited Document Uploads:** Free users can upload 3 documents to try it out. Pro users get unlimited space to build their AI's personal memory. This is the primary upgrade driver.
    *   **Prioritized Recall:** The AI will always prioritize the user's own documents when answering questions. Responses can explicitly reference the user's material, e.g., *"Based on page 47 of your uploaded textbook 'Calculus 101', the answer is... "*. This makes the personalization tangible.
    *   **Conversational Memory:** The AI remembers the last 10 conversations, allowing for natural follow-up questions without re-explaining context. The free tier remains stateless.

2.  **Personalized Learning Tools:**
    *   **Targeted Quiz Generation:** Pro users can generate quizzes based *specifically* on their uploaded documents, chat history, or topics identified as weak spots by the Spaced Repetition system.
    *   **Spaced Repetition System:** The core daily-driver for Pro users, helping them master content through active recall. This system is inherently personal.

3.  **Automated Personal Insights:**
    *   **Weekly Progress Reports:** A Pro-exclusive email summarizing study habits (`StudySessions`), flagging potential weak spots (based on AI queries or Spaced Repetition performance), and suggesting what to review next from their *personal* and the *shared* knowledge bases.

### The Free-to-Pro Funnel

The free tier offers a taste of the AI using only the **Shared Knowledge Base**. The upgrade prompts are contextual and highlight the value of personalization:

*   **Hit document limit:** "Upgrade to Pro to give your AI tutor unlimited memory for your textbooks and notes."
*   **After a generic answer:** "Get answers tailored to your exact course. Upgrade to Pro and upload your class materials."
*   **Ask a follow-up question:** "Your AI can remember this conversation. Upgrade to Pro to unlock conversational memory."
*   **View Spaced Repetition tab:** "Master your subjects with a personalized review schedule. Upgrade to Pro to unlock Spaced Repetition."

This strategy positions the Pro subscription not as an unlock of "more features," but as an investment in an AI that learns *with* and *from* the student, providing a uniquely tailored educational advantage.

---

## Cost-Effective RAG Architecture

The entire RAG system is designed to be highly cost-effective, which is critical for making the "Personal AI Tutor" a viable and profitable Pro feature. This is achieved by being strategic about *how* and *when* expensive AI models are used.

### 1. Strategic Model Selection

The most significant cost factor is the choice of AI models. The system deliberately uses cost-effective models for each step:

*   **Generation:** Defaults to `gpt-4o-mini`, which offers a strong balance of capability and low cost, making "unlimited" queries for Pro users economically feasible.
*   **Embedding:** Uses `text-embedding-3-small`, one of OpenAI's most cost-efficient embedding models. Embedding a 200-page textbook costs less than a penny.
*   **Local Fallback:** The entire stack can be pointed to a local Ollama instance (`OLLAMA_BASE_URL`), allowing for virtually free development and testing.

### 2. A "Frugal" by Default RAG Pipeline

The system is designed to minimize expensive LLM calls. Many advanced features are opt-in or have "free" default modes, as detailed in `server/services/ragRetriever.js`.

*   **Free Heuristics:** The **Query Intent Classifier** (`queryIntent.js`) runs in a default `heuristic` mode, providing intelligent source boosting without any LLM call.
*   **Guarded LLM Calls:** Advanced features that require an LLM call are used sparingly and are disabled by default (e.g., `RAG_HYDE_ENABLED=false`, `RAG_QUERY_REWRITE_ENABLED=false`).
*   **Hybrid Search:** The system runs a cheap and fast database `FULLTEXT` search in parallel with the more expensive vector search, often finding high-quality results for keyword-based queries without any vector database interaction.

### 3. Efficient Merging and Ranking

Combining results from different sources is done without additional LLM calls.

*   **Reciprocal Rank Fusion (RRF):** The `retrieveContext` function uses RRF to merge ranked lists from `FULLTEXT` and vector search. RRF is a simple, effective algorithm that **does not require an LLM call**. It elegantly combines keyword and semantic search results.
*   **Opt-In Reranking:** The final, most precise step—using a cross-encoder to rerank candidates—is also opt-in (`RAG_RERANK_PROVIDER=off`). The system provides good results without it, making this a progressive enhancement.

### 4. Cost Control via Tiered Access

The monetization strategy is directly tied to this cost-effective architecture:

*   **Stateless Free Tier:** The free tier uses stateless AI. Pro users get **Conversational Memory**, which is more expensive as it includes chat history in the token count. This gates the higher-cost feature.
*   **Upload Limits:** The free tier's 3-document upload limit directly caps the one-time embedding and ongoing storage costs for non-paying users.

In essence, the RAG system is built on a "freemium" model at the architectural level: it provides a strong baseline experience using the cheapest possible methods and treats expensive LLM-powered enhancements as progressive, opt-in upgrades. This ensures that the cost to serve a free user is minimal, making the Pro tier a highly profitable upgrade.

---

## Business Features (Unbuilt)

**Pricing:**
- **Free:** Unlimited study rooms, streaks, community access, 10 AI queries/day, 3 document uploads, stateless AI.
- **Student Pro ($7/mo or $59/yr):** Everything in Free, plus the full **Personal AI Tutor** suite: unlimited AI queries, unlimited document uploads, conversational memory, Spaced Repetition, and personalized weekly insights.
- **Alumni:** Free forever.
- **Institution:** $3–5/student/yr (bulk licensing for schools).

**Revenue roadmap (priority order):**
1. **SEO meta tags + sitemap** — `react-helmet` on `/wiki/:id` + `/qa/:id`, `GET /sitemap.xml`, `public/robots.txt`
2. **Shareable achievement cards** — `html2canvas` → share at streak milestones + level-ups; OG tags on `/alumni/:id`
3. **Stripe paywall** — `POST /billing/checkout|webhook|portal`; `ProGate` component; gates: unlimited AI, recaps, spaced repetition. Env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID`. Note: `isPro`/`proExpiresAt`/`stripeCustomerId` already on Users model.
4. **Referral system** — `referralCode` on Users, `POST /users/claim-referral`, 7-day Pro trial for both parties
5. **Alumni LinkedIn verification** — LinkedIn OAuth → verify education → `isVerified = true`, checkmark badge
6. **Weekly progress email** — `node-cron` Monday 9 AM, nodemailer, opt-out via `emailNotifications` flag on Users
7. **Institutional admin portal** — `Institutions` table, email domain auto-assign Pro, `/institution-admin` page

---

## Monetization Reality Check

The product is mostly built. What blocks revenue is not features — it's retention, distribution, and a free tier that gives a reason to pay. Order of sequential gates, not parallel work:

### Gate 1 — Retention proof (no money yet)
- 100 users returning 3+ days/week for 4+ weeks.
- Without this, monetization is dead on arrival.
- Leading indicator: first-session → next-session return rate.
- Required before anything else: onboarding flow (set subject → join/create room → first Pomodoro → first streak day).

### Gate 2 — Willingness to pay (first $1k MRR)
- 200 Pro conversions from the retained cohort.
- Requires: Stripe paywall (`<ProGate>` component + `POST /billing/checkout|webhook|portal`) — data model already has `isPro`, `proExpiresAt`, `stripeCustomerId`.
- Requires: a Pro feature people actually want. Spaced Repetition is the best bet because it's daily-use, not one-shot. Session Recaps should also be Pro-gated.
- Analytics must exist before gate 2: PostHog or Amplitude. Without events on `signup`, `session_started`, `ai_message_sent`, `pro_upgrade`, the conversion funnel is un-diagnosable.

### Gate 3 — Scalable channel
Pick one:
- **Consumer ($5/mo direct):** needs ~40k MAU for $10k MRR at 5% conversion. Only viable channels at $5/mo LTV are SEO (wiki + Q&A pages with `react-helmet` + `/sitemap.xml`) and virality (streak sharing, room invites, alumni endorsement LinkedIn posts). Paid ads are infeasible at this price.
- **Institutional ($3–5/student/yr):** 50 schools × 500 students × $4 = $100k ARR. Warm intros through IB coordinators and tutor networks only — cold email is hopeless. Longer sales cycles, higher-touch, but tractable list of targets.

### Non-negotiable prerequisites
- Deployed to Railway + Vercel (~2 hrs). Cannot sell a URL that doesn't exist.
- Analytics before scale.
- Founder conducts ~20 user interviews before adding more features. The "Pro" feature list should come from what retained students say they'd pay for, not from this document.
- **Founder conducts ~20 user interviews before adding more features. The "Pro" feature list should be validated by what retained students say they'd pay for, using the "Personal AI Tutor" concept as the starting hypothesis.**

### The single hardest constraint
Most consumer ed-tech fails at monetization. Student-facing apps compete with free alternatives (Discord, Quizlet, ChatGPT, Khan Academy). What differentiates StudySphere is alumni mentorship — but alumni are an **existential product risk**, not a feature. See next section.

---

## Public Landing Pages

Two separate landing pages for two audiences. Same codebase, shared CSS vars, different copy and CTAs.

| | **`/` (students)** | **`/for-mentors` (alumni)** |
|--|--|--|
| Headline | Get a 7 in IB. **Together.** | Your IB experience is **worth paying for.** |
| Primary CTA | Get Started Free → `/registration` | Apply as Mentor → `/registration?role=alumni` |
| Live strip | studying now · live rooms · questions today · last answer | **IB questions waiting** · students online · new questions today · last answer |
| Interactive slice | `<TryAiWidget />` anonymous AI preview (3/day/IP) | Live `/public/open-questions` feed — 3 unanswered Qs a mentor could take |
| Feature framing | Rooms, AI, XP/streaks, knowledge base, mentorship | Bounties (soon), Verified Badge (live), Cohorts (soon), Email-reply (soon) |
| Social proof | Sample student cards with streaks | Sample mentor cards with university + "helped N students" + Verified check |
| Closing CTA | Your first session is one click away | Your first answer is one reply away |

**Why the split:** a student landing a cold page from Reddit/TikTok and an alumnus landing from a LinkedIn DM need different value props. Bundling them onto one page was diluting both.

**IB USP is the differentiator.** The `TryAiWidget` is explicitly scoped to IB (Maths AA, Bio HL, Chem SL, command terms, HL vs SL). This is the single hardest thing for a generic competitor (Discord + ChatGPT) to replicate — it's a curriculum moat, not a feature moat.

**Landing-page polish (done this session):**
- ✅ `/registration?role=alumni` now prefills the role dropdown (`Registration.js` reads `location.search`).
- ✅ OG + Twitter meta tags on both landings via `react-helmet-async` (`HelmetProvider` wraps `<App>`, each page declares its own `<Helmet>` block).

**Still open:**
- No OG image asset yet — meta tags reference URLs and titles but no social-preview image. Adding `client/public/og-home.png` + `og-for-mentors.png` (1200×630) closes this.
- PostHog events on `public_stats_view`, `public_ai_try_submit`, `public_ai_try_rate_limited`, `mentor_apply_click`. Without these the next landing-page iteration is guessing.
- Absolute `og:url` (currently `"/"` / `"/for-mentors"`) — swap to full canonical once a production domain exists.

---

## Alumni Supply-Side Strategy

Alumni are **not an audience** — they're a supply-side problem. Student mechanics (XP, streaks, levels) don't motivate 22–28-year-olds with jobs. Without 50+ active alumni, the value prop collapses to "Discord + ChatGPT" and the whole platform becomes undifferentiated.

### Why alumni won't show up or stay
1. **No personal upside.** They graduated. They don't need the platform.
2. **Time cost.** Working grads have ~0 spare cycles for mentoring strangers.
3. **Demand uncertainty.** Log in once, nobody's asking questions, leave forever.
4. **LinkedIn already exists.** Same DMs land there with better identity signal.

Until at least one of these flips, alumni signups decay to zero within 2 weeks of joining.

### The four levers (in priority order)

**1. Bounty system — pay them real money (the single biggest unlock).**
- Student posts a question tagged with a bounty (e.g. `$2`).
- Verified alumni answers. On acceptance, alumni gets paid.
- Platform takes 20% cut; rest to alumni.
- Turns StudySphere from "volunteer platform" → "gig economy for grads."
- Alumni earn coffee money on a 10-min train ride. Students pay less than a Chegg answer.
- Tech: requires **Stripe Connect** (marketplace pay-outs) on top of the Stripe paywall. ~1 week incremental.
- Data: `Bounties` table (`questionId`, `amount`, `status`, `fundingMethod`), `Payouts` table (`alumniId`, `amount`, `stripeTransferId`, `status`).
- Unit economics: if 5% of questions get bounties and alumni accept rate is 60%, the platform cut funds itself. Needs ~500 questions/month to produce meaningful alumni income.

**2. Async daily email digest — meet them where they are.**
- Nobody sits on the platform waiting. Don't require logins.
- `node-cron` 8am local time: email each alumnus 3 unanswered questions in their subject area.
- Reply-to-answer — parse inbound email via a provider like SendGrid Inbound Parse or Mailgun Routes.
- Zero-login participation → fundamentally changes the commitment curve.
- Requires: `AlumniEmailPreferences` table, inbound email parsing endpoint, subject-matching query.

**3. Off-platform identity signal.**
- Verified StudySphere Mentor badge with LinkedIn OAuth verification (already in backlog — see "Business Features > Alumni LinkedIn verification").
- Public profile page (`/alumni/:id`) with OG meta tags so profiles share well on LinkedIn / Twitter.
- Lifetime contribution metrics: "StudySphere Mentor — 127 IB students helped in 2026" → recruiter-visible, career-relevant.
- Without this, alumni have no reason to build reputation here instead of Reddit or Discord.

**4. University-branded alumni cohorts.**
- "Imperial Alumni" room, "Oxford PPE" room, "Cambridge CompSci" room.
- Solves the stickiness problem: alumni come *for the students* but stay *because other alumni from the same school are there*.
- Belonging, not broadcast. Private sub-communities, not yet another public channel.
- Data: `AlumniCohorts` (university, program, creator), `AlumniCohortMembers` (userId, cohortId). Requires verified university field on Users.

### The founder move nobody wants to do
Concierge-recruit the first **50 alumni** by hand, one-degree-out on LinkedIn — alumni of top IB / A-Level schools, Oxbridge, Ivy-equivalent. Personal intro call, Slack DM, tag the first 3 questions you want them to answer. Airbnb photographed apartments by hand. DoorDash's founders delivered meals. Two-sided marketplaces do not scale supply via signup forms at day zero. This work is not outsourceable.

### The one bet if forced to pick
**Bounties.** Everything else (async email, badges, cohorts) improves retention but won't get alumni in the door. Money will. Once 200 paid answers are flowing, StudySphere has a real business — not a study app hoping for volunteers.

### Priority order for implementation
1. LinkedIn verification + public profile OG meta (prerequisite for legitimacy, 2–3 days).
2. Stripe paywall (prerequisite for Pro; also prerequisite for Stripe Connect, ~2–3 days).
3. Stripe Connect + Bounties (~5–7 days on top of Stripe paywall).
4. Async email digest (~2–3 days).
5. University-branded cohorts (~3–5 days).

Only start (3) after (1) and (2) ship — bounties without a Pro paywall funds alumni out of thin air, and bounties without verified mentors attract scammers.

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

## Local Dev Setup (macOS)

The backend needs MySQL running at `127.0.0.1:3306` before `npm start`. If `cd server && npm start` fails with `ECONNREFUSED 127.0.0.1:3306`, MySQL is not running (or not installed).

### Option A — Homebrew (recommended)

```bash
brew install mysql
brew services start mysql

# One-time: create the dev + test databases.
mysql -u root -e "CREATE DATABASE IF NOT EXISTS studysphere; CREATE DATABASE IF NOT EXISTS studysphere_test;"
```

Then confirm `server/.env` matches:

```
DB_USER=root
DB_PASSWORD=
DB_NAME=studysphere
DB_HOST=127.0.0.1
```

Homebrew's fresh MySQL has no root password by default. If you set one during install, put it in `DB_PASSWORD`.

### Option B — Docker

If you prefer containers (Docker Desktop must be installed first):

```bash
docker run -d --name studysphere-mysql \
  -p 3306:3306 \
  -e MYSQL_ROOT_PASSWORD=password \
  -e MYSQL_DATABASE=studysphere \
  mysql:8
```

Then set `DB_PASSWORD=password` in `server/.env`.

A `docker-compose.yml` for the full stack (mysql + server + client) is on the Tech Debt list — not shipped yet.

### Managing the service

```bash
brew services list           # show running services
brew services stop mysql     # stop MySQL
brew services restart mysql  # restart after config change
```

### First boot

On first boot the server auto-seeds `IbSubjects` and triggers a background RAG reindex (if `OPENAI_API_KEY` is set and `ContentEmbeddings` is empty). Run `node server/seed.js` to load the sample Wiki/Q&A/Posts/Resources used by the landing-page `/public/open-questions` feed — without seeded content, the mentor landing will render the empty-state ("No unanswered questions right now").

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
