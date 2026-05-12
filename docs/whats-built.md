# What's Built

## Backend

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

## Frontend

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
