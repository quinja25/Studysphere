# StudySphere RAG System

## Overview

The RAG pipeline has three phases: **ingestion** (content → chunks → embeddings → MySQL), **caching** (in-memory normalized vectors + IVF index), and **retrieval** (hybrid FULLTEXT + vector search → RRF merge → rerank → top 5 chunks injected into LLM prompt).

---

## Phase 1 — Content Ingestion (`embeddingSync.js`)

When content is created or updated (wiki article, Q&A, post, resource, document):

1. **`getContentText(sourceType, sourceId)`** fetches the raw record from the DB and builds `{ text, prefix, subject, record }`. For Q&A, it includes the best accepted/voted answer alongside the question so a student's query matches the question text but retrieves the answer.
2. **Chunking** — if `RAG_ADAPTIVE_CHUNKS=true` (default), `adaptiveChunker.chunkContent()` applies type-aware splitting. Otherwise `chunkText()` does flat sliding-window at ~150 tokens with 50-token overlap. Each chunk gets a prefix like `"Wiki Article: Enzyme Kinetics\nSubject: Biology"`.
3. **`createEmbeddingBatch(chunks)`** sends all chunks in one API call to OpenAI (`text-embedding-3-small`) → returns 1536-dim vectors.
4. **`ContentEmbeddings.bulkCreate()`** stores each chunk text + serialized Float32Array BLOB in MySQL.
5. **`invalidateVectorIndex()`** marks the in-memory cache as stale for lazy rebuild.

**Past papers follow a different path** — `documentProcessor.js` handles chunking *before* `embeddingSync`:
- PDF buffer → `pdf-parse` → raw text + page count
- `chunkPastPaper()` splits by question boundaries using regex detection (`Q1.`, `(a)`, `Part (b)`, etc.)
- Extracts **mark allocation** (`[4 marks]`) and **IB command terms** (31 terms: Analyse, Calculate, Evaluate, etc.)
- Each chunk is prefixed with paper title, subject, question label, marks, and command term
- Short questions (<800 chars) = one chunk; long ones split at 200 tokens
- Pre-computed chunks are passed to `indexDocument()` (user uploads) or `indexGlobalDocument()` (admin library, stores `chunksJson` for reindexing without re-reading the file)

**Textbooks** use `chunkTextbook()` — detects section headers (Chapter/Section/Unit patterns, ALL-CAPS headings), chunks each section independently at 300 tokens (denser than default), prefixes with book title + section header.

---

## Phase 2 — In-Memory Cache + IVF Index (`embeddingService.js`)

On the first query after startup (or after any content write):

1. **`_loadCache()`** loads all `ContentEmbeddings` rows, deserializes BLOBs → Float32Arrays, **normalizes each to unit length** so `dot(a, b) === cosine_similarity(a, b)` with no per-query norm math.
2. If corpus ≥ `RAG_IVF_MIN_ROWS` (500) → **`_buildIVFAsync()`** runs k-means clustering:
   - k = clamp(√n, 4, 256), 3 passes of Lloyd's algorithm
   - Runs via `setImmediate` between passes so the event loop stays responsive
   - Brute-force queries continue while IVF builds
3. After IVF: queries score k centroids, probe top 15% of clusters, score only ~15% of vectors. Performance:

   | Corpus size | No cache (DB) | Cache only | Cache + IVF |
   |-------------|---------------|------------|-------------|
   | 1,000 rows  | ~50ms         | ~2ms       | ~0.5ms      |
   | 10,000 rows | ~250ms        | ~10ms      | ~2ms        |
   | 50,000 rows | ~1,300ms      | ~50ms      | ~8ms        |

---

## Phase 3 — Query-Time Retrieval (`ragRetriever.js` → `retrieveContext()`)

```
                    ┌─── HyDE (optional) ──────────────┐
                    │  Generate hypothetical answer     │
    User query ─────┤  to improve embedding quality     │
                    │                                   │
                    ├─── Intent Classification ─────────┤  All 3 run
                    │  Heuristic or LLM: which source   │  in parallel
                    │  types are most relevant?         │
                    │                                   │
                    ├─── FULLTEXT Search ───────────────┤
                    │  4 parallel SQL queries:          │
                    │  Wiki, Q&A, Posts, Resources      │
                    └───────────────────────────────────┘
                                    │
                                    ▼
                    ┌─── Vector Search ─────────────────┐
                    │  Embed query (or HyDE answer)     │
                    │  → findSimilar() via cache/IVF    │
                    │  Includes user docs + global docs │
                    └───────────────────────────────────┘
                                    │
                                    ▼
                    ┌─── RRF Merge (k=60) ─────────────┐
                    │  Reciprocal Rank Fusion:          │
                    │  score = Σ 1/(60 + rank)          │
                    │  per list a doc appears in        │
                    │  Eliminates score scale mismatch  │
                    └───────────────────────────────────┘
                                    │
                                    ▼
                    ┌─── Post-RRF Boosts ───────────────┐
                    │  + intent boosts (per source type) │
                    │  + 0.025 for user's own documents  │
                    └───────────────────────────────────┘
                                    │
                                    ▼
                    ┌─── Rerank (optional) ─────────────┐
                    │  Cross-encoder (Cohere/Ollama)    │
                    │  on top 20 candidates             │
                    │  Uses ORIGINAL query, not HyDE    │
                    └───────────────────────────────────┘
                                    │
                                    ▼
                          Top 5 chunks → LLM prompt
```

**Step by step:**

1. **Extract keywords** — strip stop words + short words from the query for FULLTEXT search.
2. **Parallel launch** — HyDE (skipped for queries >120 chars — already keyword-rich), intent classification, and 4 FULLTEXT searches (`searchWiki`, `searchQA`, `searchPosts`, `searchResources`) all fire simultaneously via `Promise.all`.
3. **FULLTEXT results** get `normalizeScore()`: raw FULLTEXT relevance (capped to 0–1) + recency bonus (+0.1 if <30 days) + log-scaled views/likes/downloads + accepted answer (+0.3) + alumni author (+0.15) + subject match (+0.3). Capped at 2.0. Each search function does FULLTEXT with JOIN for author, falls back to LIKE if FULLTEXT indexes aren't available.
4. **Vector search** — embeds the HyDE hypothetical answer (or original query if HyDE is off/skipped), calls `findSimilar()` on the in-memory cache. Augments query with room subject/major for better embedding neighborhood. Filters by `userId` (user docs), excludes `global_document` for non-Pro users. User-uploaded docs get +0.3 similarity boost pre-RRF.
5. **Vector deduplication** — multiple chunks from the same source document are concatenated in chunk-index order (not discarded), preserving more context for the LLM.
6. **RRF merge** — both ranked lists are fused by rank position: `score = Σ 1/(60 + rank + 1)` across every list a document appears in. Documents appearing in *both* lists receive contributions from both, naturally boosting results strong in keyword AND semantic matching. This eliminates the score-scale mismatch between FULLTEXT (0–2 range) and vector similarity (0–1 range).
7. **Intent boosts** — classifier output (e.g. "this is a past paper question") applies per-source-type score deltas to RRF results.
8. **Personalization boost** — user-uploaded docs (`sourceType='document'`) get +0.025 post-RRF when `userId` is present.
9. **Rerank** (opt-in via `RAG_RERANK_PROVIDER`) — cross-encoder rescores the top `RAG_RERANK_CANDIDATES` (20) candidates using the **original** user query (not the HyDE hypothetical), then slices to `RAG_MAX_CHUNKS` (5).
10. **Return top 5** chunks to the LLM system prompt.

---

## Key Design Decisions

- **FULLTEXT catches what vectors miss** — exact keyword matches (formula names, IB terminology like "SN2 mechanism") that embedding models sometimes fumble on.
- **Vectors catch what FULLTEXT misses** — semantic paraphrases ("rate of reaction" matches "speed of chemical process").
- **RRF over raw score merging** — FULLTEXT and vector scores have incompatible scales; RRF uses only rank positions, eliminating this mismatch entirely.
- **HyDE skipped for long queries** — queries >120 chars are already keyword-rich; the hypothetical answer adds overhead with little retrieval lift.
- **Global docs are Pro-gated** — `excludeSourceTypes: ['global_document']` in vector search for non-Pro users.
- **Compound Q&A chunks** — questions are indexed with their best answer included so that a student's query (which semantically matches the question) also retrieves the answer content.
- **Resources never expose paid content** — only `title + description` are indexed, never the full `content` field.

---

## Chunking Strategies

### By Source Type (Adaptive Chunker — `adaptiveChunker.js`)

| Source Type | Strategy | Max Size | Prefix Format |
|-------------|----------|----------|---------------|
| `wiki` | Split on markdown headings (`^#+\s`), keep sections | 1500 chars | `<heading> [<title>]` |
| `question` | Compound chunk with accepted/best answer appended | 2000 chars | `[Q] <title>` + `[Accepted Answer]` |
| `answer` | Single chunk with parent question context | 1500 chars | `[Answer to: <questionTitle>]` |
| `post` | 200-token sliding window, 50-token overlap | 200 tokens | Title in first chunk only |
| `resource` | Description + content capped | 1200 chars | Title in first chunk |

### By Document Type (`documentProcessor.js`)

| Document Type | Strategy | Chunk Size | Key Features |
|---------------|----------|------------|--------------|
| `past_paper` | Question-boundary splitting via regex | 200 tokens | Mark allocation extraction, IB command term detection (31 terms), rich prefix with question/marks/command term |
| `textbook` | Section-header splitting (Chapter/Section/Unit, ALL-CAPS) | 300 tokens | Denser chunks than default, section header in prefix |
| `notes` / `other` | Flat sliding window | 150 tokens | Simple `Document: <title>` prefix |

### Chunk Prefix Formats

| Source | Prefix Format | Subject Included? |
|--------|--------------|-------------------|
| Wiki (embeddingSync) | `Wiki Article: <title>\nSubject: <subject>\nBy: <author>` | Yes |
| Question (embeddingSync) | `Q&A Question (Answered)\nSubject: <subject>` | Yes |
| Answer (embeddingSync) | `Q&A Answer (Accepted)\nSubject: <subject>\nBy: <author> (Alumni)` | Yes |
| Resource (embeddingSync) | `Resource (<type>)\nBy: <author>` | **No** |
| Post (embeddingSync) | `Advice: <title>\nBy: <author>` | **No** |
| Past paper (documentProcessor) | `IB Past Paper: <title>\nSubject: <subject>\nQuestion: ...\n[N marks]\nCommand Term: ...` | Yes |
| Textbook (documentProcessor) | `Textbook: <title>\nSection: <header>\nSubject: <subject>` | Yes |
| Notes (documentProcessor) | `Document: <title>\nSubject: <subject>` | Yes |
| Economics past paper (ingestion script) | `IB Past Paper: <title>\nSubject: Economics\nQuestion: ...\n[N marks]\nCommand Term: ...` | Yes (hardcoded) |

---

## Economics Ingestion Pipeline (`ingest-past-papers.js`)

The Economics past paper pipeline is significantly more sophisticated than the generic `documentProcessor.js` path. 191 IB Economics past papers (2010-2025, May + November) have been ingested via this script, producing 5,623 chunks stored in `chunksJson`.

### Custom Features (Not Available in Generic Pipeline)

1. **PDF text cleaning** — 15 distinct rules removing trilingual IB copyright blocks (EN/FR/ES), exam codes (`M10/3/ECONO/...`), page headers (`-- 2 -- 2224-5101`), "Turn over" footers, `(Question N continued)` artifacts, disclaimer/reference blocks, and PDF word-break artifacts.

2. **Economics-specific question detection** — 6 custom `QUESTION_PATTERNS` recognizing Paper 2 data-response patterns (`"1. Read the extracts"`), sub-questions with roman numerals (`"(a)(i)"`), and mark scheme formats (`"1.(a)"`). vs 4 generic `QUESTION_REGEXES` in `documentProcessor.js`.

3. **Paper type detection** — `detectPaperType()` distinguishes Paper 1 (essay), Paper 2 (data response), Paper 3 (HL quantitative).

4. **Mark scheme chunking** — Dedicated `chunkMarkScheme()` strips repetitive assessment criteria/markband tables while preserving "Answers may include:" sections. Uses distinct `IB Past Paper Mark Scheme:` prefix.

5. **Question-mark scheme pairing** — Combines question paper chunks and mark scheme chunks into a single `GlobalDocuments` record for unified retrieval.

---

## Scoring Summary

| Bonus | Value | Where Applied |
|-------|-------|---------------|
| Recency (<30 days) | +0.1 | `normalizeScore()` pre-RRF |
| Views (log-scaled, cap 1000) | +0.0 to +0.1 | `normalizeScore()` pre-RRF |
| Likes (log-scaled, cap 100) | +0.0 to +0.1 | `normalizeScore()` pre-RRF |
| Downloads (log-scaled, cap 1000) | +0.0 to +0.1 | `normalizeScore()` pre-RRF |
| Accepted answer | +0.3 | `normalizeScore()` pre-RRF |
| Alumni author on answer | +0.15 | `normalizeScore()` pre-RRF |
| Subject match | +0.3 | `normalizeScore()` pre-RRF |
| User-uploaded document | +0.3 | `vectorSearch()` pre-RRF (similarity boost) |
| User-uploaded document | +0.025 | `retrieveContext()` post-RRF |
| Intent classification | variable | `retrieveContext()` post-RRF |
| RRF fusion constant | k=60 | `retrieveContext()` merge step |

---

## Key Files

| File | Responsibility |
|------|---------------|
| `server/services/embeddingService.js` | `chunkText()`, `findSimilar()` (in-memory cache + IVF), `embedText()`, BLOB serialization, `invalidateVectorIndex()` |
| `server/services/embeddingSync.js` | `indexContent()`, `removeContent()`, `reindexAll()`, `indexDocument()`, `indexGlobalDocument()`; uses adaptive chunker |
| `server/services/adaptiveChunker.js` | `chunkContent(sourceType, record)` — type-aware chunks for wiki, Q&A, posts, resources |
| `server/services/documentProcessor.js` | `processDocument(buffer, meta)` — PDF extraction + type-specific chunking (textbook headers, past paper questions, generic notes) |
| `server/services/ragRetriever.js` | `retrieveContext()` — parallel HyDE + intent + FULLTEXT + vector, RRF merge, boosts, rerank |
| `server/services/rerank.js` | `rerank(query, chunks)` — Cohere or Ollama cross-encoder, opt-in |
| `server/services/hyde.js` | `generateHypotheticalAnswer()` — opt-in HyDE, skipped for queries >120 chars |
| `server/services/queryRewriter.js` | `rewriteQuery(message, history)` — conversational query rewrite, opt-in |
| `server/services/queryIntent.js` | `classifyQuery()` — heuristic (free) or LLM mode, returns per-source-type boosts |
| `server/services/feedbackAggregates.js` | `sourceTypeStats()`, `sourcePerformance()` — aggregate thumbs feedback for future scoring |
| `server/services/openai.js` | `chatCompletion()`, `createEmbedding()`, `createEmbeddingBatch()` — provider-abstracted (OpenAI or Ollama) |
| `server/models/UserDocuments.js` | Per-user uploaded docs: `docType ENUM('textbook','past_paper','notes','other')` |
| `server/models/GlobalDocuments.js` | Admin-curated library: adds `curriculum`, `fileSize`, `chunksJson` for reindexing without original file |
| `server/routes/Ai.js` | `/ai/chat`, `/ai/ask`, `/ai/quiz`, `/ai/suggest`, `/ai/sources`, `/ai/reindex`, `/ai/upload-document`, `/ai/documents` |
| `server/routes/AiFeedback.js` | `/ai/feedback` POST/my/stats |
| `server/routes/GlobalDocuments.js` | Admin: `GET/POST/DELETE /admin/documents` — upload PDF, list, delete with embedding cleanup |
| `server/scripts/ingest-past-papers.js` | Economics past paper ingestion — custom PDF cleaning, question detection, mark scheme pairing |

---

## Adding a New Content Type

1. Add case to `getContentText()` in `embeddingSync.js` — fetch record, return `{ text, prefix, subject, record }`.
2. Add to `reindexAll()` sources array.
3. Add to `sourceType` ENUM in `ContentEmbeddings` model + create migration.
4. Add FULLTEXT search function in `ragRetriever.js` (follow `searchWiki` pattern).
5. Add to `retrieveContext()` `Promise.all` alongside existing searches.
6. Hook CRUD routes with `indexContent(type, id)` / `removeContent(type, id)`.

---

## RAG Upgrade Paths

### Shipped (all behind env flags; default flags keep cost at zero)

| # | Upgrade | Files | Flag | Status |
|---|---------|-------|------|--------|
| 1 | Cross-encoder reranker | `rerank.js` | `RAG_RERANK_PROVIDER` | Live, off by default |
| 2 | Conversational query rewriter | `queryRewriter.js` | `RAG_QUERY_REWRITE_ENABLED` | Live, off by default |
| 3 | HyDE | `hyde.js` | `RAG_HYDE_ENABLED` | Live, off by default, skipped for queries > 120 chars |
| 5 | Adaptive per-type chunking | `adaptiveChunker.js` | `RAG_ADAPTIVE_CHUNKS` | Live, **on** by default |
| 7 | Query intent classifier + boosts | `queryIntent.js` | `RAG_INTENT_MODE` | Live, heuristic default (free) |
| 8 | Thumbs feedback loop | `AiFeedback` + `feedbackAggregates.js` | — | Live |
| 9 | Post-RRF personalization boost | `ragRetriever.js` | always-on when `userId` present | Live |

### Not Yet Shipped

- **pgvector migration** — swap MySQL BLOB → Postgres `vector(1536)` + HNSW index. Defer until corpus > 50k chunks.
- **Embedding model upgrade** — `text-embedding-3-small` → `text-embedding-3-large`. Defer until reranker + rewrite + HyDE are all enabled and still saturating (~6.5x cost).
- **Feedback-driven scoring** — wire `feedbackAggregates.sourcePerformance()` into RRF as a nightly prior.
- **RAG eval harness** — `server/scripts/rag-eval.js`, 20 golden-pair queries, measures recall@5 + MRR.

---

## Known Issues & Format Gaps

Issues identified via code review of the RAG pipeline (May 2025).

### 1. No Subject-Specific Chunking

The chunking pipeline is entirely subject-agnostic. No file branches on subject for chunking, splitting, or prefix construction. This means:
- A Chemistry past paper with reaction equations gets the same regex-based question detection as an English Literature essay paper.
- A Mathematics textbook with proofs gets the same section-header detection as a History narrative.
- A Physics paper with data tables gets the same 800-char "short question" threshold as an Economics essay question.

The only subject-specific code exists in the one-off `ingest-past-papers.js` script for Economics.

### 2. Question Detection Regexes Biased Toward Humanities

The 4 generic `QUESTION_REGEXES` in `documentProcessor.js` are designed for text-heavy papers:
```
/^Q\.?\s*\d{1,2}[\.\)]/i         Q1. / Q.1)
/^\d{1,2}\s*[\.\)]\s+[A-Z]/      1. Explain...
/^\([a-z]{1,2}\)\s+\S/            (a) Outline...
/^Part\s+\([a-z]\)/i              Part (a)
```

These fail or produce poor results for:
- **Multiple-choice** (IB Chemistry/Biology/Physics Paper 1): `A ... B ... C ... D ...` options get split from their question.
- **Data-based questions** (IB Chemistry/Biology Paper 2): embedded tables and graphs are arbitrarily split.
- **Mathematics notation**: questions starting with formulas instead of uppercase text are missed.

### 3. No PDF Text Cleaning in Generic Pipeline

Generic document uploads via `documentProcessor.js` receive zero PDF text cleaning. Raw artifacts (copyright blocks, page numbers, headers, footers, "Turn over" markers) are embedded directly into chunks. The Economics script applies `cleanPDFText()` with 15 cleaning rules that would apply to all IB subjects.

Estimated impact: ~200-500 chars of noise per page, or 20-50 wasted tokens per chunk.

### 4. No Mark Scheme Awareness in Generic Pipeline

When non-Economics users upload a mark scheme PDF via `/ai/upload-document`, it goes through generic `chunkPastPaper()` which:
- Fails to strip repetitive markband tables
- Uses inappropriate question-start patterns
- Produces an `IB Past Paper:` prefix instead of `Mark Scheme:` prefix
- Causes retrieval confusion between question papers and mark schemes

### 5. `global_document` Missing from Intent Boost Table

`queryIntent.js` defines 4 intent categories (exam, concept, code, howto) with fixed boost tables. The `exam` intent boosts `document: +0.25` and `resource: +0.1` but does **not** boost `global_document`, which is where the 191 ingested Economics past papers live. This means past papers get no intent-based retrieval boost even for clearly exam-related queries.

### 6. `CHARS_PER_TOKEN` Inconsistency

`embeddingService.js` uses `CHARS_PER_TOKEN = 4` while `adaptiveChunker.js` uses `CHARS_PER_TOKEN = 3`. This causes:
- `chunkText()` in embeddingService: chunks of `150 * 4 = 600` chars
- `slidingWindow()` in adaptiveChunker: chunks of `150 * 3 = 450` chars

A 25% size difference between the two chunkers for the same configured token limit.

### 7. Resources and Posts Missing Subject in Prefix

Resources and Posts do not include subject metadata in their chunk prefixes. Vector search cannot leverage subject-matching for these content types, degrading retrieval precision.

### 8. Intent Classifier Ignores Subject Context

`queryIntent.js` accepts an `options.subject` parameter but ignores it (`void options;`). No subject-aware boosts are applied, and the intent classifier treats all subjects identically.

---

## Recommended Fixes

### High Priority (Low Effort)

| # | Fix | Effort | Impact |
|---|-----|--------|--------|
| R1 | Add `global_document: 0.25` to `exam` intent boost in `queryIntent.js` | 1 line | Past papers retrieved for exam queries |
| R2 | Extract `cleanPDFText()` from Economics script into `documentProcessor.js` | ~30 lines | Remove noise from all PDF uploads |
| R3 | Standardize `CHARS_PER_TOKEN` across `embeddingService.js` and `adaptiveChunker.js` | 1 constant | Consistent chunk sizing |

### Medium Priority (Moderate Effort)

| # | Fix | Effort | Impact |
|---|-----|--------|--------|
| R4 | Add mark scheme detection to `documentProcessor.js` | ~50 lines | Proper mark scheme chunking for all subjects |
| R5 | Add subject metadata to Resource and Post prefixes in `embeddingSync.js` | ~10 lines | Better subject-filtered retrieval |
| R6 | Add STEM-specific question detection (multiple-choice format) | ~30 lines | Proper chunking for Science Paper 1s |

### Lower Priority (Higher Effort)

| # | Fix | Effort | Impact |
|---|-----|--------|--------|
| R7 | Parameterize `ingest-past-papers.js` to support multiple subjects | ~2 hours | High-quality ingestion for all subjects |
| R8 | Use `options.subject` in intent classifier for subject-aware boosts | ~50 lines | Better retrieval per subject context |

---

## RAG Env Vars

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | — | OpenAI API key (required unless using Ollama) |
| `OLLAMA_BASE_URL` | — | Local Ollama URL; set to use `llama3.2` + `nomic-embed-text` |
| `OLLAMA_MODEL` | `llama3.2` | Ollama chat model |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` | Ollama embedding model |
| `AI_DAILY_TOKEN_LIMIT` | `50000` | Per-user daily token budget |
| `RAG_MAX_CHUNKS` | `5` | Max chunks returned to LLM prompt |
| `RAG_CHUNK_SIZE` | `150` | Default chunk size in tokens |
| `RAG_CHUNK_OVERLAP` | `50` | Overlap between chunks in tokens |
| `RAG_SIMILARITY_THRESHOLD` | `0.5` | Min cosine similarity for vector results |
| `RAG_IVF_MIN_ROWS` | `500` | Corpus size to trigger IVF index build |
| `RAG_IVF_NPROBE` | `0` (auto) | Clusters to probe; 0 = 15% of k, min 3 |
| `RAG_ADAPTIVE_CHUNKS` | `true` | Use type-aware chunking vs flat sliding window |
| `RAG_RERANK_PROVIDER` | `off` | `cohere`, `ollama`, or `off` |
| `RAG_RERANK_CANDIDATES` | `20` | Candidates passed to reranker before slicing |
| `COHERE_API_KEY` | — | Required when `RAG_RERANK_PROVIDER=cohere` |
| `RAG_QUERY_REWRITE_ENABLED` | `false` | Conversational query rewriting |
| `RAG_HYDE_ENABLED` | `false` | Hypothetical Document Embeddings |
| `RAG_INTENT_MODE` | `heuristic` | `heuristic` (free), `llm`, or `off` |

---

## Past Paper Ingestion Guide

### Architecture

Past paper ingestion uses a shared common module (`ingest-common.js`) and per-subject ingest files that provide subject-specific configuration: question patterns, chunking strategy, cleaning rules, and filename parsing.

```
server/scripts/
  ingest-common.js          # Shared: PDF cleaning, chunkers, DB ingest loop, filename parser
  ingest-past-papers.js     # Economics (original, standalone — predates common module)
  ingest-chemistry.js       # Chemistry — MCQ Paper 1 + structured Paper 2/3
  ingest-physics.js         # Physics — MCQ Paper 1 + structured Paper 2/3
  ingest-biology.js         # Biology — MCQ Paper 1 + structured Paper 2/3
  ingest-mathematics.js     # Mathematics — all structured (no MCQ), AA/AI variants
```

### Running an Ingest

```bash
# Preview: parse and show chunks without writing to DB
node server/scripts/ingest-chemistry.js --preview

# Dry run: list all detected papers without processing
node server/scripts/ingest-chemistry.js --dry-run

# Full ingest with embeddings
node server/scripts/ingest-chemistry.js

# Ingest without generating embeddings (generate later via POST /ai/reindex)
node server/scripts/ingest-chemistry.js --skip-embeddings

# Only process a specific year
node server/scripts/ingest-chemistry.js --year 2024
```

Use `INGEST_DIR` env var to override the default input directory:
```bash
INGEST_DIR=~/Desktop/Chemistry_Papers node server/scripts/ingest-chemistry.js
```

### Directory Structure

All ingest scripts expect the same folder layout:

```
<INPUT_DIR>/
  2024/
    May 2024/
      <Subject>_paper_1_TZ1_HL.pdf
      <Subject>_paper_1_TZ1_HL_markscheme.pdf
      <Subject>_paper_2_TZ1_SL.pdf
      <Subject>_paper_2_TZ1_SL_markscheme.pdf
      ...
    November 2024/
      ...
  2023/
    ...
```

### Filename Format

Default pattern (auto-generated by `createFilenameParser(subject)`):

```
<Subject>_paper_<N>_<TZ>_<Level>[_markscheme].pdf
```

| Part | Values | Examples |
|------|--------|----------|
| Subject | Match the script's subject name | `Chemistry`, `Physics`, `Biology`, `Mathematics` |
| N | Paper number | `1`, `2`, `3` |
| TZ | Timezone (optional) | `TZ0`, `TZ1`, `TZ2` |
| Level | Exam level | `HL`, `SL`, `HLSL` |
| `_markscheme` | Suffix for mark scheme files | Present or absent |

Mathematics also accepts `Mathematics_AA_paper_...` and `Mathematics_AI_paper_...` for the two IB Math courses.

The script pairs question papers with their mark schemes automatically by matching paper number + timezone + level within each session folder.

### How Each Subject Chunks Differently

| Subject | Paper 1 | Paper 2/3 | Mark Scheme |
|---------|---------|-----------|-------------|
| **Chemistry** | MCQ batched in groups of 5 | Structured question-boundary splitting | Paper 1 MS = single answer key chunk; Paper 2/3 MS = per-question chunks with assessment criteria stripped |
| **Physics** | MCQ batched in groups of 5 | Structured question-boundary splitting | Same as Chemistry |
| **Biology** | MCQ batched in groups of 5 | Structured question-boundary splitting | Same as Chemistry |
| **Mathematics** | N/A (no MCQ) | Structured splitting, larger chunks (2500 chars max, 1000 char splits) | Per-question chunks |
| **Economics** | Essay question-boundary splitting | Data-response splitting (handles long text extracts) | Per-question with markband stripping |

### What `pdf-parse` Cannot Capture

`pdf-parse` extracts text only. The following are silently lost:

- Diagrams, graphs, data tables rendered as images
- Molecular structures (Chemistry)
- Circuit diagrams (Physics)
- Supply/demand curves (Economics)
- Mathematical graphs and geometric figures
- Any content embedded as images rather than text

When a question says "Refer to the graph below" or "Using the diagram...", the chunk will contain the question text but not the visual. The AI will still attempt to answer based on the text context, but quality degrades for image-dependent questions.

**Future improvement:** Use a vision model (GPT-4o / Claude) to describe images per page, then merge image descriptions with extracted text before chunking. See "Known Issues" section.

### Creating a New Subject Ingest File

To add a new subject (e.g., History, English, Business Management):

**Step 1: Create the file**

Create `server/scripts/ingest-<subject>.js`. Use any existing subject file as a template. The minimal structure:

```javascript
const {
    createIngester,
    chunkByQuestions,
    chunkMCQ,          // only if the subject has MCQ papers
    chunkMarkScheme,
} = require('./ingest-common');

const SUBJECT = 'History';  // must match subject names used in the platform
const INPUT_DIR = process.env.INGEST_DIR || './past-papers/History';

// Subject-specific cleaning rules (applied after IB-universal cleaning)
const CLEANING_RULES = [
    // Example: remove source booklet references
    { pattern: /Refer to the source booklet\.?\s*/gi, replacement: '' },
];

// Question-start patterns for this subject's papers
const QUESTION_PATTERNS = [
    /^(\d{1,2})\.\s+[A-Z]/,        // "1. Evaluate..."
    /^\([a-z]{1,3}\)\s+/i,         // "(a) Explain..."
    // Add patterns specific to how this subject's papers are formatted
];

function chunkPaper(cleanedText, title, paperNum) {
    return chunkByQuestions(cleanedText, title, SUBJECT, {
        questionPatterns: QUESTION_PATTERNS,
        maxChunkChars: 2000,    // adjust based on typical question length
        splitChars: 800,        // where to split oversized questions
    });
}

function chunkMS(cleanedText, title) {
    return chunkMarkScheme(cleanedText, title, SUBJECT, {
        questionPatterns: [
            /^(\d{1,2})\.\s*\([a-z]\)/i,
            /^\([a-z]{1,3}\)\s/i,
        ],
    });
}

createIngester({
    subject: SUBJECT,
    inputDir: INPUT_DIR,
    chunkPaper,
    chunkMS,
    cleaningRules: CLEANING_RULES,
}).run();
```

**Step 2: Determine question patterns**

Open 2-3 sample PDFs from the subject and note how questions are numbered. Look for:
- Top-level question starts: `1.`, `Q1.`, `Question 1`
- Sub-question patterns: `(a)`, `(i)`, `Part (a)`
- Whether Paper 1 is MCQ (sciences) or structured (humanities/math)
- Any subject-specific markers (source references, case study labels)

Test with `--preview` to verify chunks look correct before running a full ingest.

**Step 3: Add cleaning rules**

Run `--preview` and look for repeated boilerplate in the chunks:
- Subject-specific booklet references ("Refer to the data booklet")
- Repeated headers/footers not caught by the universal cleaner
- Subject-specific formatting artifacts

Add regex rules to `CLEANING_RULES` to strip these.

**Step 4: Handle custom filename formats**

If the PDF filenames don't match the default pattern (`<Subject>_paper_N_TZ_Level.pdf`), provide a custom `parseFilename` function:

```javascript
function parseFilename(filename) {
    const isMarkScheme = /_markscheme\.pdf$/i.test(filename);
    // Your custom regex here
    const match = filename.match(/your-pattern/i);
    if (!match) return null;
    return {
        paper: match[1],
        tz: match[2] || null,
        level: match[3],
        isMarkScheme,
    };
}

createIngester({
    subject: SUBJECT,
    inputDir: INPUT_DIR,
    parseFilename,    // pass custom parser
    chunkPaper,
    chunkMS,
}).run();
```

**Step 5: Test and ingest**

```bash
# 1. Preview chunks for a single year
INGEST_DIR=~/papers/History node server/scripts/ingest-history.js --preview --year 2024

# 2. Dry run to verify all files are detected and paired
INGEST_DIR=~/papers/History node server/scripts/ingest-history.js --dry-run

# 3. Ingest without embeddings first (fast, verify DB records)
INGEST_DIR=~/papers/History node server/scripts/ingest-history.js --skip-embeddings

# 4. Generate embeddings
curl -X POST http://localhost:3001/ai/reindex -H "Authorization: Bearer <admin-token>"

# Or re-run with embeddings (slower, calls OpenAI per batch)
INGEST_DIR=~/papers/History node server/scripts/ingest-history.js
```

### Common Module API (`ingest-common.js`)

| Export | Description |
|--------|-------------|
| `createIngester(config)` | Factory that returns `{ run() }`. Handles CLI flags, directory scanning, file pairing, DB writes, and embedding generation. |
| `cleanPDFText(raw, extraRules?)` | Removes IB-universal boilerplate (copyright, page numbers, exam codes, footers). Accepts optional subject-specific rules. |
| `chunkByQuestions(text, title, subject, config)` | Splits text at question boundaries using configurable regex patterns. Extracts marks and command terms per chunk. |
| `chunkMCQ(text, title, subject)` | Groups multiple-choice questions in batches of 5. Use for Science Paper 1s. |
| `chunkMarkScheme(text, title, subject, config)` | Chunks mark schemes by question. Optionally strips repetitive assessment criteria tables. |
| `splitLongText(text, maxChars)` | Splits long text at paragraph boundaries, respecting a max character limit. |
| `extractMarks(text)` | Extracts `[N marks]` or `(N marks)` from question text. Returns integer or null. |
| `extractCommandTerm(text)` | Finds the first IB command term in the first 200 chars. Returns capitalized term or null. |
| `createFilenameParser(subject)` | Generates a filename parser for the default `<Subject>_paper_N_TZ_Level.pdf` pattern. |
| `IB_COMMAND_TERMS` | Array of 33 IB command terms used across all subjects. |

### `createIngester` Config

```javascript
createIngester({
    subject: 'Chemistry',            // Required. Used in DB records and chunk prefixes.
    inputDir: './past-papers/Chem',   // Required. Root directory with year/session subfolders.
    curriculum: 'IB',                 // Optional. Default: 'IB'.
    parseFilename: fn,                // Optional. Custom filename parser. Default: auto from subject.
    chunkPaper: (text, title, paperNum) => [],   // Required. Returns string[] of chunks for question papers.
    chunkMS: (text, title) => [],                // Required. Returns string[] of chunks for mark schemes.
    cleaningRules: [],                // Optional. Extra {pattern, replacement} rules for cleanPDFText.
    batchDelayMs: 500,                // Optional. Delay between embedding API calls. Default: 500.
})
```
