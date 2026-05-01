# StudySphere — Project Context for Claude

## What is StudySphere?

An **AI-powered Q&A and study platform** for IB/A-Level students. The core product is a RAG-based AI tutor trained on curriculum-specific content (wiki articles, Q&A, past papers, uploaded notes) that answers subject questions with cited sources. Layered on top: community Q&A, study rooms (video + Pomodoro), gamified XP/streaks, and a resources marketplace.

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
- **Q&A / Wiki / Marketplace**: full CRUD UIs, AI Suggest, tag pills, XP debt mechanic, reports
- **Study Room** (`/group/:id`): WebRTC video, screen share, Pomodoro timer (socket-synced), chat sidebar, whiteboard, AI assistant sidebar (`AiAssistant.js` — same RAG + feedback controls as AI Chat), exit modal, Session Goals
- **Lobby** (`/lobby`): rooms list, streak reminder
- **Dashboard** (`/dashboard`): profile editing, XP bar, streak card, weekly goal ring, My Groups tab, Recaps tab
- **Chat / DMs** (`/chat`): Study Rooms vs Messages sidebar, `__dm_{min}_{max}` naming
- **Admin Dashboard** (`/admin`): stats, trust distribution, report queue, user management
- **Notification bell**: `NotificationContext` + socket, `<NotificationBell />` in NavBar — badge, dropdown, mark-read
- **Waitlist** (`/`): dark coming-soon page, animated counter, `<LiveStatsStrip />`, `<TryAiWidget />`
- **Public landing** (`/home`): IB-first hero, `<TryAiWidget />` (3 IB chips, posts to `/public/ai-try`)
- **ConfirmModal**: replaces all `window.confirm()` calls

---

## RAG System

> Full documentation: **[rag.md](rag.md)** — pipeline phases, chunking strategies, scoring, known issues, recommended fixes, and past paper ingestion guide.
>
> UX flows: **[ux-flows.md](ux-flows.md)** — all user-facing flows from visitor → student → admin.

Hybrid FULLTEXT + vector search → RRF merge → optional rerank → top 5 chunks injected into LLM prompt. Three phases: ingestion (`embeddingSync.js` + `adaptiveChunker.js`), caching (in-memory normalized vectors + IVF index in `embeddingService.js`), retrieval (`ragRetriever.js`).

**Key files:** `embeddingService.js`, `embeddingSync.js`, `adaptiveChunker.js`, `documentProcessor.js`, `ragRetriever.js`, `rerank.js`, `hyde.js`, `queryRewriter.js`, `queryIntent.js`, `feedbackAggregates.js` — all in `server/services/`. Provider abstracted in `openai.js`.

**Shipped upgrades** (all behind env flags, cost-zero defaults): cross-encoder reranker, query rewriter, HyDE, adaptive chunking (on by default), intent classifier, thumbs feedback loop, post-RRF personalization boost.

**191 IB Economics past papers** ingested via `server/scripts/ingest-past-papers.js` (5,623 chunks in `GlobalDocuments.chunksJson`). Embeddings not yet generated — run `POST /ai/reindex`.

**Per-subject ingest scripts** for Chemistry, Physics, Biology, Mathematics in `server/scripts/ingest-<subject>.js`. All use shared `ingest-common.js` module with MCQ chunker, structured question chunker, IB PDF text cleaning, and mark scheme handling. See `rag.md` "Past Paper Ingestion Guide" for usage and how to add new subjects.

**Fixed (previously known gaps):** `global_document` added to exam intent boost (`queryIntent.js`), `CHARS_PER_TOKEN` standardized to 4 (`adaptiveChunker.js`), `cleanPDFText()` wired into `documentProcessor.js` for all user PDF uploads, `POST /ai/quiz` works without `groupId` (standalone AI Chat).

**Remaining gaps** (see `rag.md` "Known Issues"): no subject-specific chunking in generic pipeline, question regexes biased toward humanities for user uploads, no mark scheme detection on user uploads, Resources/Posts lack subject in prefix (models don't have subject field).

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
- Global document library — `GlobalDocuments` model, admin upload, `indexGlobalDocument()` in `embeddingSync.js`, add to retriever with +0.2 bonus ✅ **Done** — 191 IB Economics past papers (2010–2025, May + November) ingested into `GlobalDocuments` via `server/scripts/ingest-past-papers.js`. 5,623 chunks stored in `chunksJson`. Embeddings not yet generated — run `POST /ai/reindex` to activate RAG. pdf-parse downgraded to v1.1.1 to fix API incompatibility.
- RAG eval harness — `server/scripts/rag-eval.js`, 20 IB Economics golden questions, baseline GPT-4o-mini answers recorded in `server/scripts/rag-eval-results.json`. Run `--rag` after reindex to get RAG answers, then `--compare` to diff.
- Per-user doc persistence — wire `GET /ai/documents` into `/ai-chat` (frontend only)
- Feedback-driven RAG scoring — nightly job wiring `feedbackAggregates` into RRF prior

---

## Monetization

**Pricing:**
- **Free:** 10 AI queries/day, 3 document uploads, stateless AI, unlimited rooms + streaks
- **Student Pro ($7/mo or $59/yr):** Unlimited AI queries + documents, conversational memory, Spaced Repetition, weekly progress email
- **Institution:** $3–5/student/yr

**Pro is "Personal AI Tutor"**: the free tier uses only the shared knowledge base; Pro adds the student's own uploaded documents with prioritized recall and conversational memory. Upgrade prompts trigger at: document limit hit, generic AI answer, follow-up question attempt, Spaced Repetition tab view.

**Revenue roadmap:** (1) Deploy → (2) PostHog analytics → (3) Spaced Repetition (primary daily-use Pro feature) → (4) Stripe paywall → (5) Referral system → (6) Institutional portal.

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

---

## ML Roadmap — Personalized Learning Intelligence

The platform already collects rich signals (query embeddings, feedback ratings, quiz results, study sessions, streaks, document uploads). The ML roadmap turns these signals into a personalized learning engine that no ChatGPT wrapper can replicate. Every tier builds on existing infrastructure; no new ML framework is required until Tier 3.

### Competitive Moat

ChatGPT wrappers are stateless, generic, and solo. StudySphere's ML layer creates three compounding advantages:
1. **Curriculum-scoped knowledge base** — RAG trained on IB/A-Level past papers, mark schemes, wiki articles, community Q&A with accepted answers. Answers cite specific sources (e.g. "Paper 1 Q3b, May 2024").
2. **Community knowledge flywheel** — every Q&A answer, wiki edit, resource upload, and thumbs feedback makes the AI smarter. Feedback-driven scoring tunes retrieval quality over time.
3. **Integrated study context** — the AI lives inside study rooms, knows the student's subject/curriculum/grade, references their uploaded notes, and schedules future review via spaced repetition.

---

### Tier 1 — Build on Existing Infrastructure (1–3 weeks each)

#### 1A. Knowledge Gap Detection

**Goal:** Identify which IB syllabus topics a student has not studied or is weak on, based on their query history and quiz performance.

**How it works:**
1. **Embed the IB syllabus** — one-time job. Each subject's syllabus is broken into topic nodes (e.g. "Chemistry → Organic Chemistry → Nucleophilic Substitution"). Embed each topic using `createEmbedding()` from `server/services/openai.js`. Store in a new `SyllabusTopics` table with columns: `id`, `subject`, `topicPath` (e.g. "Chemistry > Organic Chemistry > Nucleophilic Substitution"), `embedding BLOB`, `level` (1=unit, 2=topic, 3=subtopic).
2. **Classify queries by topic** — for each query in `AiMessages` where `role='user'`, compute cosine similarity against syllabus embeddings. Assign the top-1 topic (threshold ≥ 0.6). Store mapping in `QueryTopicMap`: `userId`, `messageId`, `topicId`, `similarity`, `createdAt`.
3. **Compute coverage scores** — per user per subject, count queries and quiz attempts per syllabus topic. Normalize to a 0–1 coverage score. Topics with zero interaction = "blind spots"; topics with low quiz accuracy = "weak areas".
4. **Surface in dashboard** — new `<KnowledgeMap />` component on `/dashboard`. Heat map of syllabus topics: green (strong), yellow (some exposure), red (weak), grey (untouched). Click a gap → pre-filled AI chat: "Explain [topic] for IB [subject] HL".

**Key files to create/modify:**
| File | Change |
|------|--------|
| `server/models/SyllabusTopics.js` | New model: `id`, `subject`, `topicPath`, `embedding`, `level` |
| `server/models/QueryTopicMap.js` | New model: `userId`, `messageId`, `topicId`, `similarity` |
| `server/services/knowledgeGap.js` | New service: `classifyQuery(userId, queryText)`, `getCoverageMap(userId, subject)`, `getBlindSpots(userId, subject)` |
| `server/routes/Ml.js` | New route: `GET /ml/knowledge-map/:subject`, `GET /ml/blind-spots/:subject` |
| `server/scripts/seed-syllabus.js` | One-time script: parse IB syllabus → embed → insert into `SyllabusTopics` |
| `client/src/components/KnowledgeMap.js` | Heat map visualization of topic coverage |

**Data signals used:** `AiMessages` (query text), `AiFeedback` (thumbs on topic-related answers), quiz results (when adaptive quiz ships).

**Env vars:** `ML_KNOWLEDGE_GAP_ENABLED` (default off), `ML_TOPIC_SIMILARITY_THRESHOLD` (0.6).

#### 1B. Adaptive Quiz Generation

**Goal:** Generate quizzes that target the student's difficulty frontier — not too easy, not too hard — using item response theory (IRT) principles.

**How it works:**
1. **Track quiz performance** — new `QuizAttempts` table: `userId`, `topicId`, `question`, `correctAnswer`, `userAnswer`, `isCorrect`, `difficulty` (1–5), `responseTimeMs`, `createdAt`.
2. **Estimate topic mastery** — per user per topic, fit a simple logistic model: `P(correct) = 1 / (1 + e^(-(ability - difficulty)))`. Start with ability = 0, update after each attempt using a Bayesian update (ELO-style: `ability += K * (actual - expected)`, K=0.3).
3. **Select next question difficulty** — target the student's "zone of proximal development": pick difficulty where estimated P(correct) ≈ 0.65–0.75. Use RAG to retrieve syllabus-relevant content at that difficulty, then prompt GPT to generate a question at the target difficulty level.
4. **Feed into spaced repetition** — incorrect answers automatically create `DiaryEntries` for SM-2 review scheduling.

**Key files to create/modify:**
| File | Change |
|------|--------|
| `server/models/QuizAttempts.js` | New model: tracks every quiz answer with difficulty + correctness |
| `server/services/adaptiveQuiz.js` | New service: `estimateMastery(userId, topicId)`, `selectDifficulty(userId, topicId)`, `generateAdaptiveQuiz(userId, subject, topicId?)` |
| `server/routes/Ai.js` | Modify `/ai/quiz` to accept `?adaptive=true` — uses mastery estimation instead of random |
| `client/src/pages/Quiz.js` | Show difficulty indicator, track response time, post results to `QuizAttempts` |

**Env vars:** `ML_ADAPTIVE_QUIZ_ENABLED` (default off), `ML_IRT_K_FACTOR` (0.3), `ML_TARGET_PCORRECT` (0.7).

#### 1C. Smart Retrieval Personalization

**Goal:** Tune RAG retrieval weights per user based on their feedback and engagement patterns.

**How it works:**
1. **Build user preference profile** — aggregate `AiFeedback` by `sourceType`: which source types (wiki, past_paper, notes, Q&A) get thumbs-up vs thumbs-down for this user?
2. **Compute per-user source boosts** — `userBoost[sourceType] = (thumbsUp - thumbsDown) / totalFeedback * 0.2`. Clamp to [-0.1, +0.2].
3. **Inject into RAG pipeline** — in `ragRetriever.js`, after RRF merge, apply `score += userBoost[chunk.sourceType]` per user. This is a natural extension of the existing post-RRF personalization boost (+0.025 for user docs).
4. **Explanation style detection** — classify user's thumbs-up answers by style (worked example, theory, visual/diagram reference, step-by-step). Add a soft prompt instruction to `chatCompletion()`: "This student prefers [style] explanations."

**Key files to modify:**
| File | Change |
|------|--------|
| `server/services/feedbackAggregates.js` | Add `userSourcePreferences(userId)` — returns per-source-type boost scores |
| `server/services/ragRetriever.js` | In `retrieveContext()`, after RRF, apply user preference boosts |
| `server/services/openai.js` | In `chatCompletion()`, prepend explanation style preference to system prompt |

**No new env vars** — piggybacks on existing feedback infrastructure. Active when `userId` is present (same as current personalization boost).

---

### Tier 2 — New ML Features (1–2 months each)

#### 2A. Predicted IB Score

**Goal:** Give students a projected exam score per subject that updates as they study, creating a powerful engagement loop.

**How it works:**
1. **Feature vector per user per subject:**
   - Topic coverage % (from knowledge gap map)
   - Average quiz mastery across topics (from adaptive quiz)
   - Study hours in last 7/30 days (from `StudySessions`)
   - Streak consistency (from `Streaks`)
   - Days until exam (from user profile `examDate` field — new)
   - Document uploads count (proxy for preparation depth)
   - AI query frequency trend (increasing = engaged, decreasing = disengaged)
2. **Model:** Start with a hand-tuned heuristic (weighted sum of normalized features → map to IB 1–7 scale). Graduate to logistic regression once real exam results are collected post-May/November sessions.
3. **Calibration:** Collect actual IB scores from alumni users voluntarily (new `ExamResults` table). Use these to calibrate the model. Even 50–100 data points per subject significantly improve predictions.
4. **Frontend:** Score ring on `/dashboard` — "Projected: 6 in Chemistry HL". Trend arrow (up/down/stable). Breakdown by contributing factor. Weekly email digest for Pro users.

**Key files to create/modify:**
| File | Change |
|------|--------|
| `server/models/ExamResults.js` | New model: `userId`, `subject`, `level` (HL/SL), `predictedScore`, `actualScore` (nullable), `examSession` (e.g. "May 2026") |
| `server/services/scorePredictor.js` | New service: `predictScore(userId, subject)`, `getFeatureVector(userId, subject)`, `calibrate(subject)` |
| `server/routes/Ml.js` | Add `GET /ml/predicted-score/:subject`, `POST /ml/actual-score` (alumni self-report) |
| `client/src/components/ScorePredictor.js` | Score ring + trend + factor breakdown |

**Env vars:** `ML_SCORE_PREDICTOR_ENABLED` (default off).

#### 2B. Study Plan Optimizer

**Goal:** Generate a personalized daily/weekly study plan that allocates time across subjects and topics based on gaps, exam proximity, and available hours.

**How it works:**
1. **Inputs:** knowledge gap map (per topic coverage + mastery), exam dates, `weeklyGoalMinutes` (already on Users model), historical study patterns from `StudySessions`.
2. **Constraint optimization:** Allocate minutes per topic per day. Priorities: (a) blind spots in high-weight exam topics first, (b) weak topics where mastery is below threshold, (c) maintenance review for strong topics. Weight by IB syllabus topic exam weight (stored in `SyllabusTopics.examWeight` — new column, 0–1).
3. **Implementation:** Start rule-based (greedy allocation by priority score). Can later swap in a proper optimizer (linear programming via `javascript-lp-solver` or call out to a Python microservice).
4. **Delivery:** `GET /ml/study-plan?days=7` returns a JSON schedule. Frontend renders as a weekly calendar on `/dashboard`. Daily push notification via existing `Notifications` system: "Today: 45min Organic Chemistry, 20min Probability".

**Key files to create/modify:**
| File | Change |
|------|--------|
| `server/services/studyPlanner.js` | New service: `generatePlan(userId, days)`, `prioritizeTopics(userId, subject)` |
| `server/routes/Ml.js` | Add `GET /ml/study-plan`, `PUT /ml/study-plan/preferences` |
| `client/src/components/StudyPlan.js` | Weekly calendar view with topic blocks |
| `server/models/SyllabusTopics.js` | Add `examWeight FLOAT` column |

#### 2C. Content Quality Scoring

**Goal:** Automatically score community content quality to improve RAG retrieval and surface the best answers.

**How it works:**
1. **Feature vector per content item:**
   - Vote count (normalized by age)
   - `isAccepted` (for answers)
   - Author trust score + alumni status
   - `AiFeedback` aggregate: how often this source gets thumbs-up when cited by RAG
   - View-to-engagement ratio
   - Text quality signals: length, formatting, presence of equations/diagrams, reading level
2. **Model:** Logistic regression trained on `isAccepted` as ground truth for answers; for other content types, use thumbs-up rate as proxy label. Features are all available in existing tables.
3. **Integration:** Content quality score becomes a new RAG scoring bonus (post-RRF, +0 to +0.15 based on quality percentile). Replaces the current static +0.3 `isAccepted` bonus with a learned score.
4. **Moderation assist:** Flag low-quality content for admin review. Auto-suppress content below quality threshold from RAG retrieval.

**Key files to modify:**
| File | Change |
|------|--------|
| `server/services/contentScorer.js` | New service: `scoreContent(sourceType, sourceId)`, `batchScore()`, `trainModel()` |
| `server/services/ragRetriever.js` | Replace static bonuses with learned quality score |
| `server/routes/Admin.js` | Add `GET /admin/low-quality-content` — flagged items below threshold |

---

### Tier 3 — Advanced ML (3–6 months, requires data accumulation)

#### 3A. Learning Trajectory Modeling

**Goal:** Predict future struggles and intervene before the student hits a wall, based on sequence patterns across all users.

**How it works:**
1. **Sequence representation:** For each student, build a time-ordered sequence of events: `[query(topic, timestamp), quiz(topic, score, timestamp), session(duration, timestamp), feedback(rating, timestamp)]`. Encode each event as a feature vector.
2. **Model:** Train a lightweight sequence model (LSTM or Transformer) on historical user trajectories. Input: last N events. Output: predicted next-topic struggle probability, predicted engagement drop-off, recommended intervention type.
3. **Training data:** Requires 6+ months of user data with 500+ active users to train meaningfully. Use transfer learning from general education research datasets to bootstrap.
4. **Interventions:** "Students with your study pattern typically struggle with Paper 2 Section B — here's a targeted review." Push via notifications. Proactive AI chat message when user opens the platform.

**Prerequisites:** Tier 1 fully deployed, 500+ MAU, 6 months of data. Consider a Python microservice (`Flask`/`FastAPI`) for model training and inference, called from Node.js via HTTP.

#### 3B. Exam Question Predictor

**Goal:** Predict which topics and question types are most likely to appear on the next IB exam session, based on historical patterns.

**How it works:**
1. **Data collection:** Parse past 10 years of IB past papers (per subject). Tag each question with: topic, subtopic, question type (short answer, essay, data-based, multiple choice), marks, cognitive level (AO1/AO2/AO3). Store in `PastPaperQuestions` table.
2. **Pattern analysis:**
   - Topic frequency cycling: IB examiners rotate emphasis across years. Fit a simple frequency model — topics not tested recently have higher probability.
   - Examiner report signals: parse examiner reports for phrases like "candidates struggled with" or "well-prepared for" — these predict emphasis shifts.
   - Syllabus change detection: new syllabus additions are almost always tested in the first 2 sessions.
3. **Output:** Per subject, ranked list of topics with probability estimates: "Magnetic Fields: 78% likely on Paper 1, May 2027". Show on dashboard as "Exam Forecast" card.
4. **Validation:** Backtest against held-out years to measure prediction accuracy before shipping to users.

**Key files to create:**
| File | Change |
|------|--------|
| `server/models/PastPaperQuestions.js` | New model: `subject`, `year`, `session`, `paper`, `questionNumber`, `topic`, `subtopic`, `questionType`, `marks`, `cognitiveLevel` |
| `server/services/examPredictor.js` | New service: `predictTopics(subject, session)`, `getTopicFrequency(subject)`, `backtest(subject, heldOutYear)` |
| `server/scripts/parse-past-papers.js` | Script to parse and tag past paper PDFs (LLM-assisted) |

---

### ML Integration with RAG Pipeline

All ML features feed back into the RAG system as the delivery mechanism:

```
Student asks question
  → RAG retrieves relevant content (existing)
  → Knowledge Gap: adds context "student is weak on this topic" to system prompt
  → Retrieval Personalization: adjusts source weights based on learning style
  → Content Quality: boosts high-quality sources, suppresses low-quality
  → Adaptive Quiz: appends "try this practice question" at target difficulty
  → Spaced Repetition: schedules review of this topic based on forgetting curve
  → Score Predictor: updates projected score after interaction
```

### ML Data Models (New Tables)

**SyllabusTopics**: id, subject, topicPath, level (1=unit, 2=topic, 3=subtopic), examWeight FLOAT, embedding BLOB
**QueryTopicMap**: userId FK, messageId FK, topicId FK, similarity FLOAT, createdAt
**QuizAttempts**: userId FK, topicId FK, question TEXT, correctAnswer, userAnswer, isCorrect, difficulty (1–5), responseTimeMs, createdAt
**ExamResults**: userId FK, subject, level ENUM('HL','SL'), predictedScore, actualScore (nullable), examSession STRING
**PastPaperQuestions**: subject, year, session ENUM('May','November'), paper, questionNumber, topic, subtopic, questionType, marks, cognitiveLevel ENUM('AO1','AO2','AO3')

### ML Env Vars

| Variable | Default | Description |
|----------|---------|-------------|
| `ML_KNOWLEDGE_GAP_ENABLED` | `false` | Enable syllabus gap detection |
| `ML_TOPIC_SIMILARITY_THRESHOLD` | `0.6` | Min cosine similarity for topic classification |
| `ML_ADAPTIVE_QUIZ_ENABLED` | `false` | Enable IRT-based adaptive quiz |
| `ML_IRT_K_FACTOR` | `0.3` | ELO-style update rate for mastery estimation |
| `ML_TARGET_PCORRECT` | `0.7` | Target probability of correct answer for question selection |
| `ML_SCORE_PREDICTOR_ENABLED` | `false` | Enable projected IB score |
| `ML_STUDY_PLANNER_ENABLED` | `false` | Enable personalized study plans |
| `ML_CONTENT_SCORER_ENABLED` | `false` | Enable learned content quality scoring |

### ML Implementation Order

| Priority | Feature | Depends On | Gate |
|----------|---------|------------|------|
| 1 | Knowledge Gap Detection | Syllabus seed data | Gate 1 (post-deploy) |
| 2 | Smart Retrieval Personalization | Existing `AiFeedback` data | Gate 1 |
| 3 | Adaptive Quiz Generation | Knowledge Gap + Spaced Repetition | Gate 1 |
| 4 | Content Quality Scoring | 1k+ feedback entries | Gate 1 |
| 5 | Predicted IB Score | Knowledge Gap + Adaptive Quiz | Gate 2 (Pro feature) |
| 6 | Study Plan Optimizer | Knowledge Gap + Score Predictor | Gate 2 (Pro feature) |
| 7 | Learning Trajectory Modeling | 500+ MAU, 6 months data | Gate 3 |
| 8 | Exam Question Predictor | Past paper corpus | Gate 3 |
