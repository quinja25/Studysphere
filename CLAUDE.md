# StudySphere — Project Context for Claude

## What is StudySphere?

An **AI-powered Q&A and study platform** for IB/A-Level students. Core product: RAG-based AI tutor scoped to curriculum content (wiki, Q&A, past papers, uploaded notes) with cited sources. Layered on top: community Q&A, study rooms (video + Pomodoro), gamified XP/streaks, resources marketplace.

**Primary differentiator**: AI is curriculum-scoped, references the user's own documents, and improves via community feedback — something generic ChatGPT cannot replicate.

---

## Tech Stack

- **Frontend**: React (CRA), React Router v6, Socket.io-client, Google OAuth (`@react-oauth/google`)
- **Backend**: Node.js / Express, Socket.io, Sequelize ORM, MySQL
- **Auth**: JWT (15min access + 30d refresh) + Google OAuth (server-side token verify)
- **AI**: OpenAI `gpt-4o-mini` + `text-embedding-3-small`. Set `OLLAMA_BASE_URL` to use local Ollama (`llama3.2` + `nomic-embed-text`)
- **Config**: All secrets via `.env`. `server/config/config.js` reads env vars for Sequelize.

---

## RAG System

> Full pipeline docs: **[rag.md](rag.md)** — phases, chunking, scoring, known issues, past paper ingestion guide.
> UX flows: **[ux-flows.md](ux-flows.md)**

Hybrid FULLTEXT + vector search → RRF merge → optional rerank → top 5 chunks injected into LLM prompt.

**Key files** (all in `server/services/`): `embeddingService.js`, `embeddingSync.js`, `adaptiveChunker.js`, `documentProcessor.js`, `ragRetriever.js`, `rerank.js`, `hyde.js`, `queryRewriter.js`, `queryIntent.js`, `feedbackAggregates.js`. Provider abstracted in `openai.js`.

**Shipped upgrades** (env-flag opt-in): cross-encoder reranker, query rewriter, HyDE, adaptive chunking (on by default), intent classifier, thumbs feedback loop, post-RRF personalization boost.

**191 IB Economics past papers** ingested (5,623 chunks in `GlobalDocuments.chunksJson`). Embeddings not yet generated — run `POST /ai/reindex` to activate.

---

## What to Implement Next

**Gate 0 — Deploy** (blocker): Railway (backend) + Vercel (frontend). `railway.json` and `vercel.json` already exist. ~2 hrs.

**Gate 0b — Waitlist**: Share in `r/IBO`, `r/alevel`, Discord. Add PostHog snippet (`client/public/index.html`) — key events: `waitlist_signup`, `public_ai_try_submit`.

**Gate 1 — Retention**: Onboarding flow + **Spaced Repetition** — exit modal captures topics → `DiaryEntries` table → SM-2 → `/review` deck (+5 XP). Endpoints: `POST /diary`, `GET /diary/due`, `PUT /diary/:id/review`. Pro-gated.

**Gate 2 — Revenue**: Stripe paywall — `<ProGate>` component + `POST /billing/checkout|webhook|portal`. `isPro`/`proExpiresAt`/`stripeCustomerId` already on Users model.

**Backlog:**
- RAG embeddings for Economics past papers — run `POST /ai/reindex`
- RAG eval harness — `server/scripts/rag-eval.js`, run `--rag` after reindex then `--compare`
- Per-user doc persistence — wire `GET /ai/documents` into `/ai-chat` (frontend only)
- Feedback-driven RAG scoring — nightly job wiring `feedbackAggregates` into RRF prior

> ML Roadmap (knowledge gap, adaptive quiz, score predictor): **[docs/ml-roadmap.md](docs/ml-roadmap.md)**
> Monetization details: **[docs/monetization.md](docs/monetization.md)**

---

## Tests

```bash
cd server && npm test          # 462 backend tests, 29 suites
cd client && CI=true npm test  # 26 passing; 7 suites blocked by react-router-dom v7 ESM × CRA Jest 27 incompat
cd e2e && npx playwright test  # 41 E2E tests (requires dev server on :3000)
```

Gaps: E2E study room (WebRTC needs browser media permissions), `/diary` routes (Spaced Repetition not shipped), client Jest config for react-router-dom ESM.

---

## Seed Data

```bash
node server/seed.js                    # seed + generate RAG embeddings (needs API key)
node server/seed.js --skip-embeddings  # seed DB only; run POST /ai/reindex later
node server/seed.js --content-only     # skip users, re-seed content tables only
```

Test users (password: `password123`, admin: `admin123`): `student1-3@test.com`, `alumni1-3@test.com`, `admin@test.com`

---

## Local Dev Setup

Backend needs MySQL at `127.0.0.1:3306`.

```bash
# Docker (recommended)
docker run -d --name studysphere-mysql -p 3306:3306 \
  -e MYSQL_ROOT_PASSWORD=password -e MYSQL_DATABASE=studysphere mysql:8

# Or Homebrew (macOS)
brew install mysql && brew services start mysql
mysql -u root -e "CREATE DATABASE IF NOT EXISTS studysphere; CREATE DATABASE IF NOT EXISTS studysphere_test;"
```

`server/.env` minimum: `DB_USER=root`, `DB_PASSWORD=`, `DB_NAME=studysphere`, `DB_HOST=127.0.0.1`

On first boot: auto-seeds `IbSubjects`, triggers background RAG reindex if `ContentEmbeddings` is empty.

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

## Reference Docs

| Doc | Contents |
|-----|----------|
| [rag.md](rag.md) | RAG pipeline, chunking, scoring, known issues, past paper ingestion |
| [ux-flows.md](ux-flows.md) | All user-facing flows (visitor → student → admin) |
| [docs/whats-built.md](docs/whats-built.md) | Full backend + frontend feature inventory |
| [docs/api.md](docs/api.md) | All API endpoints |
| [docs/models.md](docs/models.md) | All Sequelize data models and key fields |
| [docs/ml-roadmap.md](docs/ml-roadmap.md) | ML roadmap: knowledge gap, adaptive quiz, score predictor |
| [docs/monetization.md](docs/monetization.md) | Pricing tiers, Pro feature list, revenue roadmap |
