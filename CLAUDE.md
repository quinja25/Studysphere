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

**Vector search:** In-memory cache (all rows loaded once, pre-normalized Float32Array). IVF index built when corpus ≥ `RAG_IVF_MIN_ROWS` (500) — k-means into √n clusters, probes top 15%. Cache invalidated on every write. Subject filters applied in-memory.

**Scoring bonuses:** +0.1 recency, log views/likes, +0.3 accepted answer, +0.15 alumni author, +0.3 subject match. RRF merge (`k=60`).

**Adding a new content type:** (1) Add case to `getContentText()` in `embeddingSync.js`. (2) Add to `reindexAll()` sources. (3) Add to `sourceType` ENUM + migrate. (4) Add FULLTEXT search fn in `ragRetriever.js`. (5) Add to `retrieveContext()` Promise.all. (6) Hook CRUD routes with `indexContent`/`removeContent`.

**RAG env vars:** `OPENAI_API_KEY`, `OLLAMA_BASE_URL/MODEL/EMBED_MODEL`, `AI_DAILY_TOKEN_LIMIT` (50000), `RAG_MAX_CHUNKS` (5), `RAG_CHUNK_SIZE` (150), `RAG_CHUNK_OVERLAP` (50), `RAG_SIMILARITY_THRESHOLD` (0.5), `RAG_IVF_MIN_ROWS` (500), `RAG_IVF_NPROBE` (0=auto).

---

## API Endpoints

**Users:** `GET /users/`, `GET /users/public`, `GET /users/:id`, `POST /users/register`, `POST /users/login`, `POST /users/google-login`, `POST /users/refresh`, `PUT /users/:id`, `PUT /users/updateXP/:id`, `POST /users/forgot-password`, `POST /users/reset-password`, `POST /users/send-verification`, `GET /users/verify-email`

**Groups:** `GET /groups/`, `GET /groups/byID/:id`, `POST /groups/`, `POST /groups/:id/verify-password`, `DELETE /groups/:id`

**Group Membership:** `POST/DELETE /groupsUsers/user/:userId/group/:groupId`, `GET /groupsUsers/byUser/:userId`, `GET /groupsUsers/byGroup/:groupId`

**Chats:** `GET /chats/:groupId`, `POST /chats/`, `PUT /chats/pin/:id`, `DELETE /chats/:id`

**AI:** `POST /ai/chat`, `POST /ai/ask`, `POST /ai/quiz`, `POST /ai/suggest`, `GET /ai/sources`, `GET /ai/history/:groupId`, `DELETE /ai/history/:groupId`, `GET /ai/credits`, `POST /ai/reindex`

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
| 3 | **pgvector migration** | 3–5 days | Swap MySQL BLOBs → PostgreSQL `vector(1536)` + HNSW index; solves both scaling and queryability |
| 4 | **Docker** | 1 day | `docker-compose.yml` with mysql:8 + server + client services |
| 5 | **Vite migration** | 1–2 days | Replace CRA; swap `REACT_APP_*` → `VITE_*`, `process.env` → `import.meta.env` |
| 6 | **TypeScript** | 1–2 weeks | Incremental: services first, then models, then routes; frontend last |

---

## What to Implement Next

### Next Sprint
1. **Spaced Repetition** — exit modal captures topics → `DiaryEntries` table → SM-2 algorithm → `/review` deck (Forgot/Hard/Good/Easy, +5 XP). New service: `server/services/spacedRepetition.js`. New endpoints: `POST /diary`, `GET /diary/due`, `PUT /diary/:id/review`, `PUT /diary/:id/archive`. Pro-gated feature.

### Backlog
- **Global document library** — admin-uploaded textbooks/past papers indexed into RAG for all users; see "Document Library" section for full plan
- **Per-user document persistence** — wire existing `UserDocuments` model + `indexDocument()` to the study room PDF upload so uploads survive beyond the session and appear in `/ai-chat`
- Notification bell (`Notifications` table + socket `user_${userId}` rooms)
- Room energy indicator (message rate → energy score broadcast every 30s)
- Alumni availability heatmap (`ActivityLogs`, 7×24 grid)
- Peer reviews for Marketplace (`ResourceReviews`, star rating)
- Mobile app (React Native + Expo)

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

### Why Mobile Matters

Students study everywhere — on the bus, between classes, in the library. The web app is desktop-first (sidebar-heavy, assumes a seated WebRTC setup). Mobile unlocks the two highest-leverage retention mechanics we already have: **streak push notifications** and **quick AI Q&A between classes**. This is a retention and engagement play, not just a platform port.

---

### Technology Decision: React Native + Expo

Four options were considered:

| Option | Verdict | Reason |
|--------|---------|--------|
| **PWA** | Not viable | iOS PWAs have no APNS push, get killed in background after 30s, no home screen badge — destroys streak notification mechanic |
| **Capacitor** | Risky | WKWebView WebRTC is flaky; desktop-first UI feels sluggish on mobile; App Store reviewers increasingly reject "web wrapper" apps |
| **React Native + Expo** | **Recommended** | React team can ramp immediately, Expo handles camera/mic/notifications/deep links, Expo Router mirrors React Router v6, EAS Build for App Store |
| **Native Swift** | Not now | Full rewrite, different language — only viable after PMF with dedicated iOS engineers |

**React Native + Expo** is the right call because:
- Backend is unchanged (REST + Socket.io work identically on mobile)
- `api.js` auth/refresh logic ports to RN with minor changes
- Expo Router (`expo-router`) closely mirrors our React Router v6 pattern
- EAS Build + EAS Submit handles App Store distribution without Xcode complexity
- Expo SDK covers every native capability we need

---

### What Can Be Reused vs. Rewritten

**Reuse directly (no changes):**
- Entire backend — all REST endpoints, Socket.io events, DB models
- `client/src/api.js` auth logic (adapt token storage — see gotchas below)
- Business logic in custom hooks (data-fetching patterns, XP calculations)
- Color/spacing constants once extracted

**Must rewrite for React Native:**
- All UI components — RN uses `View`/`Text`/`TextInput`/`FlatList`, not `div`/`span`
- All CSS → `StyleSheet.create()` or NativeWind (Tailwind syntax for RN)
- Navigation → Expo Router (file-based, mirrors our current structure)
- `localStorage` → `expo-secure-store` (JWT tokens must live in Keychain, never AsyncStorage — AsyncStorage is unencrypted)

**Needs new native implementation:**
| Feature | Library |
|---------|---------|
| Camera / microphone | `expo-camera`, `expo-av` |
| WebRTC video | `react-native-webrtc` |
| Push notifications | `expo-notifications` + APNS |
| Google OAuth | `expo-auth-session` with Google provider |
| PDF upload for AI | `expo-document-picker` |
| Ambient audio | `expo-av` with background audio mode declared |
| Haptics (XP / level-up) | `expo-haptics` |
| Deep links (email verify, password reset) | Universal Links + `expo-linking` |
| Whiteboard | `react-native-skia` (gesture-based drawing) |

---

### Critical Gotchas

1. **Screen share is impossible on iOS.** ReplayKit only captures within your own app — it cannot capture other apps or the home screen. The desktop "screen share" feature cannot exist on iOS. Study room screen will omit this button.

2. **Apple IAP is mandatory for digital subscriptions.** If Student Pro ($5/mo) is sold inside the iOS app, Apple requires StoreKit — Stripe checkout redirecting externally for digital goods gets the app rejected. Plan: implement StoreKit for iOS purchases, sync purchase state to backend via a new `POST /billing/apple-iap/webhook` endpoint. Stripe stays for web. Apple takes 30% (drops to 15% after year 1 for subscriptions). Alternative: make Pro purchaseable on web only, and the app just reads `isPro` from the API.

3. **JWT storage must be Keychain.** `expo-secure-store` is synchronous-API but async-execution — the `api.js` interceptor that reads tokens needs to become async on RN. The refresh-on-401 logic still works, just the token read/write calls change.

4. **Google OAuth flow is different.** `@react-oauth/google` is web-only. On RN use `expo-auth-session` with Google's OAuth provider, which opens an in-app browser. The backend `POST /users/google-login` endpoint is unchanged.

5. **Background WebRTC (voice calls) needs CallKit.** If users want to keep a video session running while the app is backgrounded, iOS requires CallKit integration + VoIP push certificates. This is significant additional complexity — scope it out of MVP.

6. **APNS device token must be stored on backend.** Add `deviceToken` (string, nullable) to the Users model and a `PUT /users/device-token` endpoint. Call it after login on mobile.

---

### Phased Roadmap

#### Phase 1 — Core Loop (~6–8 weeks)
Goal: ship something students actually use daily. De-risk WebRTC by deferring it.

- Auth: email login + register, Google OAuth (expo-auth-session), JWT in SecureStore
- Dashboard: XP bar, streak card, weekly goal ring, study stats
- Lobby + Find Group: browse rooms, join with password modal
- Study room: **chat + Pomodoro timer only** (Socket.io, no video yet)
- Push notifications: streak reminder (daily if `currentStreak > 0`), session invite
- Deep links: email verification, password reset (Universal Links)

#### Phase 2 — Study Room Parity (~4–6 weeks)
- WebRTC video (`react-native-webrtc`): camera on/off, mic toggle, TURN config
- Whiteboard: touch-optimized drawing with `react-native-skia`
- AI assistant: bottom sheet (replaces sidebar), RAG Q&A + quiz
- Session Recaps and Session Goals
- Ambient sounds: `expo-av` background audio

#### Phase 3 — Content & Community (~4–6 weeks)
- Q&A: browse, post questions, answer, vote
- Wiki articles: read + create
- Alumni directory + endorsements
- DMs / Chat (existing `__dm_` naming convention unchanged)
- AI Chat (standalone RAG, same as `/ai-chat` web page)
- Leaderboard + streaks

#### Phase 4 — Monetization (~2–3 weeks)
- StoreKit subscription for Student Pro
- `POST /billing/apple-iap/webhook` — validate receipt server-side, set `isPro`/`proExpiresAt`
- ProGate component (mirrors web's ProGate)
- Spaced Repetition deck (if built by then) — high retention value on mobile

---

### Backend Changes Required for Mobile

All additive — no breaking changes to existing web clients.

1. **`PUT /users/device-token`** — store APNS token; called by mobile app after login. Add `deviceToken VARCHAR(255)` to Users model.
2. **Push notification service** — `server/services/pushService.js` wrapping `node-apns` or `firebase-admin` (FCM works for both iOS and Android). Trigger points: streak reminder cron (already exists), session invite, Q&A answer on your post.
3. **Universal Links** — serve `/.well-known/apple-app-site-association` JSON from the Express server. Maps `/verify-email`, `/reset-password`, `/group/:id` to the mobile app.
4. **Apple IAP webhook** (Phase 4) — `POST /billing/apple-iap/webhook`. Validate with Apple's `/verifyReceipt` endpoint, update `isPro`/`proExpiresAt`/`stripeCustomerId` (reuse field or add `appleOriginalTransactionId`).

---

### Project Structure

Place the mobile app at `mobile/` in the monorepo root (alongside `client/` and `server/`).

```
mobile/
├── app/                          # Expo Router screens (file-based routing)
│   ├── (auth)/
│   │   ├── login.tsx
│   │   └── register.tsx
│   ├── (tabs)/
│   │   ├── dashboard.tsx
│   │   ├── lobby.tsx
│   │   ├── chat.tsx
│   │   └── qa.tsx
│   └── group/[id].tsx            # Study room
├── components/                   # RN components (NOT shared with client/)
├── hooks/                        # Data-fetching hooks (port from client/src)
├── services/
│   └── api.ts                    # Adapted from client/src/api.js (SecureStore tokens)
├── constants/
│   ├── colors.ts
│   └── spacing.ts
├── app.json                      # Expo config (bundle ID, permissions)
└── eas.json                      # EAS Build profiles (development, preview, production)
```

---

### App Store Checklist (before submission)

- [ ] Privacy manifest (`PrivacyInfo.xcprivacy`) declaring camera, microphone, and any tracking domains
- [ ] App Privacy answers on App Store Connect (data collected: email, usage data, device ID)
- [ ] Background modes declared in `app.json`: `audio` (ambient sounds), `remote-notification` (push)
- [ ] Universal Links configured and `apple-app-site-association` file verified
- [ ] Age rating: likely 4+ (no user-generated content visible to strangers by default)
- [ ] Screenshots: iPhone 6.7" and 6.5" required; iPad optional
- [ ] TestFlight beta before production submission

---

## Seed Data

**Script:** `server/seed.js`

Run with:
```bash
node server/seed.js                    # seed + generate RAG embeddings (needs API key)
node server/seed.js --skip-embeddings  # seed DB only; run POST /ai/reindex later
node server/seed.js --content-only     # skip users, re-seed content tables only
```

The script is idempotent — it skips rows that already exist (matched by title/email). Re-running is safe.

**What it seeds:**

| Table | Count | Subjects covered |
|-------|-------|-----------------|
| WikiArticles | 7 | CS (Big-O, DP, interview guide), Maths (epsilon-delta, eigenvalues, proof techniques), Physics (Newton's Laws) |
| Questions | 6 | CS (BFS/DFS, git rebase, interviews), Maths (FTC, derivatives, uniform continuity), Physics (mass vs weight) |
| Answers | 7 | All accepted + voted, so they get indexed by `reindexAll()` |
| Resources | 5 | Data structures cheatsheet, maths formula book, system design guide, proof templates, LeetCode patterns |
| Posts | 5 | Advice + blog posts from student and alumni perspectives |

**Schema migration:** The seed script also auto-adds any columns that exist in the Sequelize models but are missing from the live DB (avoids the `sync({ alter: true })` MySQL 64-key-limit bug). Currently handles: `WikiArticles.tags`, `Questions.tags`.

**Test users** (all password: `password123`):
- `student1@test.com` — student, CS
- `student2@test.com` — student, Biology
- `student3@test.com` — student, Physics
- `alumni1@test.com` — alumni, CS
- `alumni2@test.com` — alumni, Biology
- `alumni3@test.com` — alumni, Maths
- `admin@test.com` — admin (password: `admin123`)

---

## Document Library: Textbooks and Past Papers

### Current State

**Per-user pipeline: fully built.** Everything needed to upload, chunk, embed, and query personal PDFs already exists:

| File | What it does |
|------|-------------|
| `server/services/documentProcessor.js` | `processDocument(buffer, {title, subject, docType})` — smart chunking per type |
| `server/services/embeddingSync.js` | `indexDocument(userId, docId, chunks, subject)` / `removeDocument(docId)` |
| `server/routes/Ai.js` | `POST /ai/upload-document`, `GET /ai/documents`, `DELETE /ai/documents/:id` |
| `server/models/UserDocuments.js` | `userId, title, subject, docType ENUM('textbook','past_paper','notes','other'), pageCount, chunkCount` |

`documentProcessor.js` already handles three document types intelligently:
- **Textbook** — splits on chapter/section headers (regex-detected), chunks at 300 tokens with section context in each prefix
- **Past paper** — splits per question boundary, extracts marks + IB command terms into prefix for precise retrieval
- **Notes / other** — standard 150-token flat chunking

**Global documents: not yet built.** This is the next step. The chunking and embedding pipeline is fully reusable — only the model, routes, storage, and RAG wiring are new work.

---

### Global vs Per-User: Effectiveness

Both are worth implementing and they compound each other:

| Mode | Effectiveness | Why |
|------|--------------|-----|
| Global only | Good | Strong base for curriculum questions; nothing personal |
| Per-user only | Good for individuals | RAG is thin until users upload; no shared benefit |
| **Both** | **Best** | Global makes AI useful from day one for every user; per-user personalises over time |

A student asking "explain Young's modulus" should get context from both the global Physics textbook *and* their own uploaded lab notes. The RAG retriever can merge these seamlessly.

---

### Global Documents: Full Implementation Plan

#### Step 1 — New model: `GlobalDocuments`

Separate table from `UserDocuments` — no userId, adds curriculum and storage fields:

```js
// server/models/GlobalDocuments.js
GlobalDocuments = sequelize.define("GlobalDocuments", {
    title:        STRING  NOT NULL,       // "IB Physics HL Textbook (Pearson 2023)"
    filename:     STRING  NOT NULL,       // original upload filename
    storagePath:  STRING  NOT NULL,       // local path or S3 key
    subject:      STRING  NULL,           // "Physics", "Mathematics" — drives RAG subject filter
    curriculum:   ENUM('IB','A-Level','AP','GCSE','University','General') DEFAULT 'General',
    docType:      ENUM('textbook','past_paper','notes','other') DEFAULT 'other',
    uploadedBy:   INTEGER FK -> Users,    // admin userId
    pageCount:    INTEGER DEFAULT 0,
    chunkCount:   INTEGER DEFAULT 0,
    fileSize:     INTEGER DEFAULT 0,      // bytes
})
```

#### Step 2 — File storage

Dev: save PDFs to `server/uploads/documents/` (add to `.gitignore`).
Prod: swap to S3/R2 — `multer-s3` is a drop-in replacement for `multer.diskStorage`.

Filename convention: `${globalDoc.id}-${slugify(title)}.pdf` — avoids collisions.

Add env var `DOCUMENT_STORAGE=local|s3` so the upload handler can switch without code changes.

```
server/
└── uploads/
    └── documents/    ← PDFs land here in dev (gitignored)
```

#### Step 3 — New `sourceType` in ContentEmbeddings

```sql
ALTER TABLE ContentEmbeddings
  MODIFY sourceType ENUM('wiki','question','answer','resource','post','document','global_document');
```

Also add a new helper in `embeddingSync.js`:

```js
// Indexes a GlobalDocument — same as indexDocument() but userId is null
// and sourceType is 'global_document' so RAG always includes it (not user-scoped)
async function indexGlobalDocument(docId, chunks, subject = null) { ... }
async function removeGlobalDocument(docId) { ... }
```

#### Step 4 — Admin routes: `server/routes/GlobalDocuments.js`

```
POST   /admin/documents          upload PDF + metadata → process → embed → respond immediately, index async
GET    /admin/documents          list all with chunkCount, pageCount, fileSize, uploadedBy
GET    /admin/documents/:id      single document detail
DELETE /admin/documents/:id      remove file from disk/S3 + remove embeddings + destroy row
```

Reuses the existing `multer` config from `Ai.js` (PDF only, 20MB limit), `processDocument()` from `documentProcessor.js`, and `indexGlobalDocument()` from `embeddingSync.js`. All routes gated by `isAdmin` middleware.

The `POST` handler flow:
1. `multer` receives buffer (memory storage)
2. `processDocument(buffer, { title, subject, docType })` → `{ chunks, pages }`
3. Write buffer to disk: `server/uploads/documents/${id}-${slug}.pdf`
4. `GlobalDocuments.create({ ..., pageCount: pages, fileSize: buffer.length })`
5. Respond `201` with document record
6. `indexGlobalDocument(doc.id, chunks, subject)` runs async after response

#### Step 5 — RAG retriever wiring

In `server/services/ragRetriever.js`, add global documents to every `retrieveContext()` call — no userId filter, always included:

```js
// Inside retrieveContext(), add to the Promise.all alongside wiki/qa/etc:
searchGlobalDocuments(query, subject),   // vector search filtered to sourceType='global_document'
```

Global doc chunks get a **+0.2 scoring bonus** (higher than wiki/posts but lower than accepted answers) because they are authoritative curriculum material. Subject match bonus (+0.3) already applies.

#### Step 6 — `reindexAll()` update

Add `GlobalDocuments` to the sources loop in `embeddingSync.js` so `POST /ai/reindex` picks them up:

```js
{ type: 'global_document', model: GlobalDocuments, where: {} },
```

And add a case to `getContentText()`:

```js
case 'global_document': {
    const doc = await GlobalDocuments.findByPk(sourceId);
    // chunks are pre-stored — re-read the PDF from disk, re-process
    // OR store chunks as JSON in the DB to avoid re-reading the file
    ...
}
```

**Recommendation:** store chunks as JSON on `GlobalDocuments` (`chunksJson TEXT`) so reindex doesn't need the original file. Means `DELETE` must also clear this field.

#### Step 7 — Admin frontend: Documents tab in `/admin`

New tab in `client/src/pages/AdminDashboard.js`:

- Drag-and-drop PDF upload with a metadata form: Title, Subject (dropdown), Curriculum (dropdown), Type (textbook / past paper / notes)
- Document list table: title, subject, curriculum, type, pages, chunks, file size, uploaded date, delete button
- Indexing status indicator (chunk count = 0 means still processing or failed)

---

### Cost Analysis

**Not expensive.** The per-user pipeline being fully built means ~1.5 days of dev work, not a week.

**Development (one-time):**

| Task | Effort |
|------|--------|
| `GlobalDocuments` model | 30 min |
| Admin routes (reuses existing multer + processDocument) | 2–3 hrs |
| `indexGlobalDocument()` in embeddingSync | 1 hr |
| RAG wiring in ragRetriever | 1–2 hrs |
| Admin frontend tab | 3–4 hrs |
| **Total** | **~1.5 days** |

**Embedding API cost (one-time, per upload):**

OpenAI `text-embedding-3-small` = $0.02 per million tokens. Pay once on upload, never again unless reindexing.

| Content | ~Tokens | Cost |
|---------|---------|------|
| Full IB textbook (500 pages) | ~500k | ~$0.01 |
| Past paper | ~10k | ~$0.0002 |
| 10 textbooks + 20 past papers | ~5.2M | **~$0.10 total** |

With Ollama (`nomic-embed-text`): **$0**.

**Storage (ongoing):**

| Item | Size | Cost |
|------|------|------|
| PDFs (10 textbooks) | ~200–500 MB | Cloudflare R2: **free** (10 GB free tier, no egress fees) |
| MySQL embeddings (10k chunks × 6 KB) | ~60 MB | Negligible |
| In-memory vector index | ~60 MB RAM | Negligible |

Use **Cloudflare R2** for production PDF storage — free tier covers everything, no egress fees unlike AWS S3. Set `DOCUMENT_STORAGE=local` for dev, `DOCUMENT_STORAGE=s3` for prod with `AWS_*` env vars pointing at R2.

**Ongoing query cost:** RAG search is in-memory — no API call, no cost. LLM completions are already within the existing 50k token/day budget.

**Summary:** ~1.5 days dev, ~$0.10 one-time embedding cost for a full library, ~$0/month to run.

---

### Content to Upload (Priority Order)

| Document | Type | Curriculum | Subject | RAG impact |
|----------|------|-----------|---------|-----------|
| IB Physics HL study guide | textbook | IB | Physics | High — large student base |
| IB Mathematics AA HL textbook | textbook | IB | Mathematics | High |
| IB Chemistry HL textbook | textbook | IB | Chemistry | High |
| IB past papers (last 3 years) | past_paper | IB | Physics/Maths/Chem/Bio | Very high — AI can cite exact questions |
| A-Level Maths past papers | past_paper | A-Level | Mathematics | High |
| A-Level Physics past papers | past_paper | A-Level | Physics | High |
| AP Calculus BC study notes | notes | AP | Mathematics | Medium |
| CS fundamentals notes (algorithms, data structures) | notes | General | Computer Science | Medium |

Upload textbooks before past papers — textbooks provide conceptual grounding; past papers provide targeted retrieval for exam prep queries.

---

### Per-User Documents: Remaining Gap

The pipeline is built but one thing is missing: **the study room PDF upload doesn't persist across sessions in the AI Chat page (`/ai-chat`)**.

Current state: upload in study room → `UserDocuments` row created → chunks embedded → visible in that room's AI sidebar only.

Needed: `GET /ai/documents` already exists. Wire it into `/ai-chat` so users can see and query their uploaded documents outside of a study room. This is a frontend-only change — no new backend work required.

---

## Recruiter-Visible Polish: What to Fix Before Sharing

### What looks good

- **Scope** — WebRTC video, Socket.io real-time, RAG with hybrid FULLTEXT + IVF vector search, JWT + Google OAuth, admin dashboard, trust/shadow-ban moderation, XP/gamification, AI quiz generation, whiteboard, ambient sound. This is not a todo app. The breadth signals real engineering ambition.
- **Backend architecture** — Service layer properly separated (`ragRetriever`, `embeddingService`, `embeddingSync`, `openai.js` provider abstraction). Socket handlers extracted to `handlers.js` for testability. Rate limiting on auth endpoints. Lazy email transporter. `PUBLIC_ATTRIBUTES` allowlist prevents password leaks. Multer file filtering.
- **Test coverage** — 15 route test files, 325 backend tests, 3 Playwright e2e files. Extremely rare in student projects. Will stand out.
- **RAG is genuinely sophisticated** — Custom IVF k-means index, in-memory cache, hybrid FULLTEXT + cosine similarity, RRF merge, scoring bonuses. Most engineers never build this.
- **Sequelize migrations** — Uses proper migration files rather than `sync()`, showing DB lifecycle awareness.
- **Security awareness** — bcrypt, refresh tokens, parameterized queries, CORS configured, trust score system.

---

### What looks bad (recruiter red flags, priority order)

| # | Issue | Why it hurts | Fix |
|---|-------|-------------|-----|
| 1 | **No README** | First thing any recruiter/engineer looks at. Repo homepage is completely blank. | Write one — see below |
| 2 | **Commit messages** | "final", "commit", "bunch of random frontend things", "need debugging" — signals unprofessionalism more than almost anything else | Can't rewrite public history easily; fix going forward |
| 3 | **Not deployed** | No live demo = recruiter can't see it. The project effectively doesn't exist to them. | Railway (backend) + Vercel (frontend) — ~2 hrs |
| 4 | **`Group.js` is 980 lines** | A single React component nearly 1000 lines tells experienced engineers "no refactoring discipline" | Split into hooks + subcomponents |
| 5 | **No TypeScript** | In 2025, a production-quality project is expected to have TypeScript. Pure JS reads as student-level. | Incremental: services → models → routes → frontend |
| 6 | **CRA (deprecated)** | Create React App has been unmaintained since 2023. Vite is the obvious replacement. | `REACT_APP_*` → `VITE_*` migration |
| 7 | **No CI/CD** | No GitHub Actions means tests don't run automatically. Recruiters at serious companies look for this. | 20-line workflow file |
| 8 | **No Docker** | Can't run locally without a MySQL install + manual setup. Friction = fewer people see it working. | `docker-compose.yml` with mysql:8 + server + client |
| 9 | **`isAdmin` from localStorage** | CLAUDE.md itself notes "takes effect after next login" — a reviewer will flag this as a trust boundary issue | Verify `isAdmin` server-side on every protected route (already done in `AdminMiddleware.js`, but should audit all paths) |
| 10 | **`tags` as comma-separated TEXT** | `tags TEXT` on WikiArticles and Questions is a denormalized anti-pattern. Shows DB design immaturity. | Acceptable for MVP — document the trade-off in code |
| 11 | **No server `.env.example`** | Client has `.env.example`. Server doesn't. New contributors can't set it up. | Add `server/.env.example` with all required keys listed |
| 12 | **No React error boundaries** | Unhandled component errors crash the entire app with a blank screen. | Add one top-level `<ErrorBoundary>` in `App.js` |
| 13 | **E2E gaps** | Only 3 e2e files (auth, groups, navigation). The study room — the core feature — has no e2e coverage. | At minimum, add a lobby flow test |
| 14 | **No API documentation** | No Swagger/OpenAPI. Collaborators and potential employers can't understand the API surface without reading 15 route files. | Add a `docs/api.md` or JSDoc comments on route files |

---

### README: minimum viable content (write this first)

```
# StudySphere

> Virtual study rooms + AI-powered learning for students and alumni.

[Live Demo](https://...) · [Backend API](https://...)

## What it does
- Real-time study rooms with WebRTC video, whiteboard, and Pomodoro timer
- AI study assistant with RAG (retrieval over uploaded textbooks and past papers)
- Quiz generation, session recaps, XP/levelling, streak tracking
- Alumni mentorship, Q&A board, wiki, resource marketplace
- Admin dashboard with trust scoring and shadow-ban moderation

## Tech stack
- Frontend: React, Socket.io-client, WebRTC
- Backend: Node.js / Express, Socket.io, Sequelize, MySQL
- AI: OpenAI gpt-4o-mini + text-embedding-3-small (or local Ollama)
- Auth: JWT (15 min access + 30 day refresh) + Google OAuth

## Running locally
1. `cp server/.env.example server/.env` — fill in DB + OpenAI keys
2. `cp client/.env.example client/.env`
3. `docker-compose up` (or start MySQL manually)
4. `cd server && npm install && npm run dev`
5. `cd client && npm install && npm start`

## Tests
cd server && npm test        # 325 backend tests
cd client && npm test        # 140 frontend tests
cd e2e && npx playwright test
```

---

### Deployment Guide (Railway + Vercel)

#### Prerequisites
- Railway account (railway.app) — free tier works
- Vercel account (vercel.com) — free tier works
- GitHub repo pushed and public (or connected)

#### Step 1 — MySQL on Railway (~5 min)
1. New project → Add service → Database → MySQL
2. Click the MySQL service → **Variables** tab → copy `MYSQL_URL` (connection string)
3. Under **Connect** tab, note host, port, user, password, db name for config.json

#### Step 2 — Backend on Railway (~15 min)
1. In same Railway project → Add service → GitHub repo → select `StudySphere`
2. Set **Root Directory** to `server`
3. Set **Start Command** to `node server.js`
4. Add all environment variables under the service's **Variables** tab:
```
NODE_ENV=production
PORT=3001
DB_HOST=<from MySQL service>
DB_PORT=<from MySQL service>
DB_USER=<from MySQL service>
DB_PASSWORD=<from MySQL service>
DB_NAME=railway
JWT_SECRET=<generate: openssl rand -base64 32>
CLIENT_URL=https://<your-vercel-domain>.vercel.app
OPENAI_API_KEY=<your key>
SMTP_HOST=smtp.gmail.com          # optional — email verification
SMTP_PORT=587
SMTP_USER=<your gmail>
SMTP_PASS=<gmail app password>
```
5. Railway auto-deploys on push. Check **Deploy Logs** for errors.
6. Note your Railway backend URL: `https://<project>.railway.app`

> **DB migration**: after first deploy, run migrations manually via Railway's shell:
> `npx sequelize-cli db:migrate`
> Or add `npx sequelize-cli db:migrate && node server.js` as the start command.

#### Step 3 — Frontend on Vercel (~10 min)
1. New project → Import GitHub repo → set **Root Directory** to `client`
2. Framework preset: **Create React App**
3. Add environment variables:
```
REACT_APP_API_URL=https://<project>.railway.app
REACT_APP_GOOGLE_CLIENT_ID=<your Google OAuth client ID>
REACT_APP_TURN_URL=<optional TURN server>
REACT_APP_TURN_USERNAME=<optional>
REACT_APP_TURN_CREDENTIAL=<optional>
```
4. Deploy — Vercel auto-deploys on every push to main.

#### Step 4 — Wire CORS
Update `CLIENT_URL` in Railway env vars to match the Vercel domain exactly (no trailing slash):
```
CLIENT_URL=https://studysphere.vercel.app
```

#### Step 5 — Seed the DB (optional but recommended)
From your local machine with the Railway DB credentials in `.env`:
```bash
node server/seed.js --skip-embeddings   # fast — no OpenAI key needed
# Then hit POST /ai/reindex to build embeddings when ready
```

#### WebRTC in production
Without a TURN server, video calls fail on school/corporate networks (symmetric NAT).
Free option: **Metered.ca** — free tier gives 50 GB/month TURN relay.
1. Create account at metered.ca → get TURN credentials
2. Set `REACT_APP_TURN_URL`, `REACT_APP_TURN_USERNAME`, `REACT_APP_TURN_CREDENTIAL` in Vercel

#### Estimated cost at zero traffic
| Service | Cost |
|---------|------|
| Railway (backend + MySQL) | $5/mo (Hobby plan) or free with sleep |
| Vercel (frontend) | Free |
| OpenAI (AI features) | Pay-per-use, ~$0–2/mo light usage |
| TURN (Metered.ca) | Free up to 50 GB |
| **Total** | **~$5/mo** |

---

### Priority action list (before sending to recruiters)

1. **Deploy** — Railway + Vercel. Link in README and GitHub About section. This alone doubles perceived quality.
2. **Write README** — 20 minutes. Massive ROI.
3. **Add `server/.env.example`** — 5 minutes.
4. **Add top-level React `ErrorBoundary`** — 15 minutes.
5. **GitHub Actions CI** — push a `.github/workflows/test.yml` that runs `npm test` on both packages.
6. **Refactor `Group.js`** — extract WebRTC logic into `useWebRTC` hook, chat into `useChatRoom` hook, timer into `usePomodoro` hook. File should be under 300 lines.
7. **Commit discipline going forward** — conventional commits: `feat:`, `fix:`, `refactor:`, `test:`, `chore:`. One idea per commit.

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
