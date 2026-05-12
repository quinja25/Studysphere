# ML Roadmap — Personalized Learning Intelligence

The platform already collects rich signals (query embeddings, feedback ratings, quiz results, study sessions, streaks, document uploads). The ML roadmap turns these signals into a personalized learning engine that no ChatGPT wrapper can replicate. Every tier builds on existing infrastructure; no new ML framework is required until Tier 3.

## Competitive Moat

ChatGPT wrappers are stateless, generic, and solo. StudySphere's ML layer creates three compounding advantages:
1. **Curriculum-scoped knowledge base** — RAG trained on IB/A-Level past papers, mark schemes, wiki articles, community Q&A with accepted answers. Answers cite specific sources (e.g. "Paper 1 Q3b, May 2024").
2. **Community knowledge flywheel** — every Q&A answer, wiki edit, resource upload, and thumbs feedback makes the AI smarter. Feedback-driven scoring tunes retrieval quality over time.
3. **Integrated study context** — the AI lives inside study rooms, knows the student's subject/curriculum/grade, references their uploaded notes, and schedules future review via spaced repetition.

---

## Tier 1 — Build on Existing Infrastructure (1–3 weeks each)

### 1A. Knowledge Gap Detection

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

### 1B. Adaptive Quiz Generation

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

### 1C. Smart Retrieval Personalization

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

**No new env vars** — piggybacks on existing feedback infrastructure. Active when `userId` is present.

---

## Tier 2 — New ML Features (1–2 months each)

### 2A. Predicted IB Score

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

### 2B. Study Plan Optimizer

**Goal:** Generate a personalized daily/weekly study plan that allocates time across subjects and topics based on gaps, exam proximity, and available hours.

**How it works:**
1. **Inputs:** knowledge gap map (per topic coverage + mastery), exam dates, `weeklyGoalMinutes` (already on Users model), historical study patterns from `StudySessions`.
2. **Constraint optimization:** Allocate minutes per topic per day. Priorities: (a) blind spots in high-weight exam topics first, (b) weak topics where mastery is below threshold, (c) maintenance review for strong topics. Weight by IB syllabus topic exam weight (stored in `SyllabusTopics.examWeight` — new column, 0–1).
3. **Implementation:** Start rule-based (greedy allocation by priority score). Can later swap in a proper optimizer (linear programming via `javascript-lp-solver` or call out to a Python microservice).
4. **Delivery:** `GET /ml/study-plan?days=7` returns a JSON schedule. Frontend renders as a weekly calendar on `/dashboard`. Daily push notification via existing `Notifications` system.

**Key files to create/modify:**
| File | Change |
|------|--------|
| `server/services/studyPlanner.js` | New service: `generatePlan(userId, days)`, `prioritizeTopics(userId, subject)` |
| `server/routes/Ml.js` | Add `GET /ml/study-plan`, `PUT /ml/study-plan/preferences` |
| `client/src/components/StudyPlan.js` | Weekly calendar view with topic blocks |
| `server/models/SyllabusTopics.js` | Add `examWeight FLOAT` column |

### 2C. Content Quality Scoring

**Goal:** Automatically score community content quality to improve RAG retrieval and surface the best answers.

**How it works:**
1. **Feature vector per content item:** vote count (normalized by age), `isAccepted`, author trust score + alumni status, `AiFeedback` aggregate thumbs-up rate when cited by RAG, view-to-engagement ratio, text quality signals.
2. **Model:** Logistic regression trained on `isAccepted` as ground truth for answers; thumbs-up rate as proxy label for other content types.
3. **Integration:** Content quality score becomes a new RAG scoring bonus (post-RRF, +0 to +0.15 based on quality percentile). Replaces the current static +0.3 `isAccepted` bonus with a learned score.
4. **Moderation assist:** Flag low-quality content for admin review. Auto-suppress content below quality threshold from RAG retrieval.

**Key files to modify:**
| File | Change |
|------|--------|
| `server/services/contentScorer.js` | New service: `scoreContent(sourceType, sourceId)`, `batchScore()`, `trainModel()` |
| `server/services/ragRetriever.js` | Replace static bonuses with learned quality score |
| `server/routes/Admin.js` | Add `GET /admin/low-quality-content` — flagged items below threshold |

---

## Tier 3 — Advanced ML (3–6 months, requires data accumulation)

### 3A. Learning Trajectory Modeling

**Goal:** Predict future struggles and intervene before the student hits a wall, based on sequence patterns across all users.

**How it works:**
1. **Sequence representation:** For each student, build a time-ordered sequence of events: `[query(topic, timestamp), quiz(topic, score, timestamp), session(duration, timestamp), feedback(rating, timestamp)]`. Encode each event as a feature vector.
2. **Model:** Train a lightweight sequence model (LSTM or Transformer) on historical user trajectories. Input: last N events. Output: predicted next-topic struggle probability, predicted engagement drop-off, recommended intervention type.
3. **Training data:** Requires 6+ months of user data with 500+ active users to train meaningfully. Use transfer learning from general education research datasets to bootstrap.
4. **Interventions:** "Students with your study pattern typically struggle with Paper 2 Section B — here's a targeted review." Push via notifications.

**Prerequisites:** Tier 1 fully deployed, 500+ MAU, 6 months of data. Consider a Python microservice (`Flask`/`FastAPI`) for model training and inference, called from Node.js via HTTP.

### 3B. Exam Question Predictor

**Goal:** Predict which topics and question types are most likely to appear on the next IB exam session, based on historical patterns.

**How it works:**
1. **Data collection:** Parse past 10 years of IB past papers (per subject). Tag each question with: topic, subtopic, question type, marks, cognitive level (AO1/AO2/AO3). Store in `PastPaperQuestions` table.
2. **Pattern analysis:** Topic frequency cycling (topics not tested recently have higher probability), examiner report signals, syllabus change detection.
3. **Output:** Per subject, ranked list of topics with probability estimates: "Magnetic Fields: 78% likely on Paper 1, May 2027".
4. **Validation:** Backtest against held-out years to measure prediction accuracy before shipping.

**Key files to create:**
| File | Change |
|------|--------|
| `server/models/PastPaperQuestions.js` | New model: `subject`, `year`, `session`, `paper`, `questionNumber`, `topic`, `subtopic`, `questionType`, `marks`, `cognitiveLevel` |
| `server/services/examPredictor.js` | New service: `predictTopics(subject, session)`, `getTopicFrequency(subject)`, `backtest(subject, heldOutYear)` |
| `server/scripts/parse-past-papers.js` | Script to parse and tag past paper PDFs (LLM-assisted) |

---

## ML Integration with RAG Pipeline

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

## ML Data Models (New Tables)

**SyllabusTopics**: id, subject, topicPath, level (1=unit, 2=topic, 3=subtopic), examWeight FLOAT, embedding BLOB
**QueryTopicMap**: userId FK, messageId FK, topicId FK, similarity FLOAT, createdAt
**QuizAttempts**: userId FK, topicId FK, question TEXT, correctAnswer, userAnswer, isCorrect, difficulty (1–5), responseTimeMs, createdAt
**ExamResults**: userId FK, subject, level ENUM('HL','SL'), predictedScore, actualScore (nullable), examSession STRING
**PastPaperQuestions**: subject, year, session ENUM('May','November'), paper, questionNumber, topic, subtopic, questionType, marks, cognitiveLevel ENUM('AO1','AO2','AO3')

## ML Env Vars

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

## ML Implementation Order

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
