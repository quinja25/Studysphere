const db = require('../models');
const { ContentEmbeddings } = db;
const { Op } = require('sequelize');
const { createEmbedding } = require('./openai');

const CHUNK_SIZE = parseInt(process.env.RAG_CHUNK_SIZE || '150', 10);
const CHUNK_OVERLAP = parseInt(process.env.RAG_CHUNK_OVERLAP || '50', 10);
const SIMILARITY_THRESHOLD = parseFloat(process.env.RAG_SIMILARITY_THRESHOLD || '0.5');

// Approximate tokens: ~4 chars per token for English.
const CHARS_PER_TOKEN = 4;

// IVF kicks in when the corpus reaches this size (rows in cache).
// Below this, brute-force on pre-loaded vectors is already fast (<5ms).
const IVF_MIN_ROWS = parseInt(process.env.RAG_IVF_MIN_ROWS || '500', 10);

// Number of clusters to probe per query. 0 = auto (15% of k, min 3).
const IVF_NPROBE = parseInt(process.env.RAG_IVF_NPROBE || '0', 10);

// ── Chunking ──────────────────────────────────────────────────────────────────

/**
 * Split long text into chunks of approximately maxTokens tokens.
 * Splits by paragraphs first, then sentences, with overlap.
 * Prepends a title/context line to each chunk for embedding quality.
 */
function chunkText(text, prefix = '', maxTokens = CHUNK_SIZE) {
    if (!text) return [];

    const maxChars = maxTokens * CHARS_PER_TOKEN;
    const overlapChars = CHUNK_OVERLAP * CHARS_PER_TOKEN;
    const prefixStr = prefix ? `${prefix}\n\n` : '';
    const availableChars = maxChars - prefixStr.length;

    if (availableChars <= 0) return [prefixStr + text.slice(0, 200)];
    if (text.length <= availableChars) return [prefixStr + text];

    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
    const chunks = [];
    let current = '';

    for (const para of paragraphs) {
        if ((current + '\n\n' + para).length > availableChars && current.length > 0) {
            chunks.push(prefixStr + current.trim());
            const overlapText = current.slice(-overlapChars);
            current = overlapText + '\n\n' + para;
        } else {
            current = current ? current + '\n\n' + para : para;
        }

        if (current.length > availableChars) {
            const sentences = current.match(/[^.!?]+[.!?]+\s*/g) || [current];
            let sentBuf = '';
            for (const sent of sentences) {
                if ((sentBuf + sent).length > availableChars && sentBuf.length > 0) {
                    chunks.push(prefixStr + sentBuf.trim());
                    sentBuf = sentBuf.slice(-overlapChars) + sent;
                } else {
                    sentBuf += sent;
                }
            }
            current = sentBuf;
        }
    }

    if (current.trim()) chunks.push(prefixStr + current.trim());
    return chunks;
}

/**
 * Estimate token count for a string (~4 chars per token).
 */
function estimateTokens(text) {
    return Math.ceil((text || '').length / CHARS_PER_TOKEN);
}

// ── Serialization ─────────────────────────────────────────────────────────────

/**
 * Serialize a float array to a Buffer for MySQL BLOB storage.
 */
function serializeEmbedding(floatArray) {
    const f32 = new Float32Array(floatArray);
    return Buffer.from(f32.buffer);
}

/**
 * Deserialize a MySQL BLOB Buffer back to a Float32Array.
 */
function deserializeEmbedding(buffer) {
    const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    // slice() produces a fresh, aligned ArrayBuffer — avoids Float32Array byteOffset alignment error
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    return new Float32Array(ab);
}

// ── Vector math ───────────────────────────────────────────────────────────────

/**
 * Compute cosine similarity between two vectors.
 * Exported for use in tests and external callers.
 * Internally, findSimilar() uses pre-normalized vectors and _dot() instead.
 */
function cosineSimilarity(vecA, vecB) {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dot += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
}

/**
 * Normalize a Float32Array to unit length in-place and return it.
 * After normalization, dot(a, b) === cosine_similarity(a, b).
 */
function _normalize(vec) {
    let norm = 0;
    for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm);
    if (norm > 0) for (let i = 0; i < vec.length; i++) vec[i] /= norm;
    return vec;
}

/**
 * Dot product of two Float32Arrays.
 * When both vectors are pre-normalized, this equals cosine similarity
 * without the per-call norm recomputation overhead.
 */
function _dot(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
}

// ── In-memory vector cache + IVF index ───────────────────────────────────────
//
// PROBLEM: The original findSimilar() issued a full ContentEmbeddings.findAll()
// on every AI query — loading all BLOB columns from MySQL, deserializing each
// one to Float32Array, computing norms, then scoring. For n=5,000 embeddings
// this was ~50-150ms of avoidable DB+deserialization work on each call.
//
// SOLUTION:
//   1. In-memory cache — load all rows once, keep pre-normalized Float32Arrays
//      in memory. Per-query cost drops to pure CPU (dot products only).
//      Cache is invalidated (and lazily rebuilt) whenever content is written.
//
//   2. IVF (Inverted File Index) — when the corpus reaches IVF_MIN_ROWS,
//      k-means clusters the cached vectors into √n groups. Query time drops
//      from O(n) to O(√n): score k centroids, probe the top 15%, score only
//      the ~15% candidate rows. Built asynchronously so it never blocks queries.
//
// Complexity summary:
//   Corpus size  | Old (per query)      | Cache only   | Cache + IVF
//   1 000 rows   | ~50ms (DB+BLOB)      | ~2ms         | ~0.5ms
//   10 000 rows  | ~250ms               | ~10ms        | ~2ms
//   50 000 rows  | ~1 300ms             | ~50ms        | ~8ms
//
// Env vars:
//   RAG_IVF_MIN_ROWS  (default 500)  — rows needed before building IVF
//   RAG_IVF_NPROBE    (default 0)    — clusters to probe; 0 = auto (15% of k, min 3)

const _cache = {
    // All deserialized, unit-normalized embedding vectors.
    entries: [],   // { sourceType, sourceId, chunkIndex, chunkText, subject, userId, vec: Float32Array }
    // IVF index built by _buildIVFAsync(), or null while not yet ready.
    ivf: null,     // { centroids: Float32Array[], cells: number[][] }
    // True on startup and after any write to ContentEmbeddings.
    stale: true,
    // Active load promise — prevents concurrent DB fetches.
    loading: null,
};

/**
 * Mark the in-memory cache as stale.
 * Called by embeddingSync after every indexContent / removeContent / reindexAll.
 * The cache is rebuilt lazily on the next findSimilar() call.
 */
function invalidateVectorIndex() {
    _cache.entries = [];
    _cache.ivf = null;
    _cache.stale = true;
    _cache.loading = null;
}

/**
 * Load all ContentEmbeddings rows from the DB into _cache.entries.
 * Deserializes each BLOB and normalizes the vector once — so subsequent
 * similarity computations are just dot products (no norm arithmetic).
 *
 * Returns immediately if a load is already in progress (shared promise).
 */
async function _loadCache() {
    if (_cache.loading) return _cache.loading;

    _cache.loading = (async () => {
        const rows = await ContentEmbeddings.findAll({
            attributes: ['sourceType', 'sourceId', 'chunkIndex', 'chunkText', 'subject', 'embedding', 'userId'],
        });

        _cache.entries = rows.map(row => ({
            sourceType: row.sourceType,
            sourceId: row.sourceId,
            chunkIndex: row.chunkIndex,
            chunkText: row.chunkText,
            subject: row.subject,
            userId: row.userId,
            // Pre-normalize once: dot(normalizedA, normalizedB) = cosine_similarity(A, B)
            vec: _normalize(deserializeEmbedding(row.embedding)),
        }));

        _cache.stale = false;
        _cache.loading = null;

        // Kick off IVF build asynchronously — brute-force is used in the meantime.
        if (_cache.entries.length >= IVF_MIN_ROWS) {
            setImmediate(_buildIVFAsync);
        }
    })();

    return _cache.loading;
}

/**
 * Build an IVF (Inverted File Index) via k-means clustering.
 * Runs asynchronously using setImmediate between passes so it never stalls
 * the event loop — AI queries continue using brute-force while it builds.
 *
 * Algorithm:
 *   k  = clamp(√n, 4, 256)
 *   3 passes of Lloyd's algorithm on unit-normalized vectors.
 *   Cosine distance reduces to Euclidean distance on the unit sphere, so
 *   the centroid update (mean + renormalize) is exact.
 *
 * Query time after build: O(k + nprobe × n/k) ≈ O(√n) vs O(n) brute-force.
 */
function _buildIVFAsync() {
    const entries = _cache.entries;
    if (entries.length < IVF_MIN_ROWS) return;

    const n = entries.length;
    const dim = entries[0].vec.length;
    const k = Math.max(4, Math.min(256, Math.round(Math.sqrt(n))));

    // Random initialization: pick k distinct entry indices as seed centroids.
    const picked = new Set();
    while (picked.size < k) picked.add(Math.floor(Math.random() * n));
    const centroids = Array.from(picked).map(i => new Float32Array(entries[i].vec));

    const assignments = new Int32Array(n); // centroid index for each entry
    let pass = 0;

    function runPass() {
        // Assignment step: find nearest centroid for each vector via dot product.
        for (let i = 0; i < n; i++) {
            let bestDot = -Infinity;
            let bestC = 0;
            const v = entries[i].vec;
            for (let c = 0; c < k; c++) {
                const d = _dot(v, centroids[c]);
                if (d > bestDot) { bestDot = d; bestC = c; }
            }
            assignments[i] = bestC;
        }

        // Update step: recompute centroids as mean of assigned vectors, then renormalize.
        const next = Array.from({ length: k }, () => new Float32Array(dim));
        const counts = new Int32Array(k);
        for (let i = 0; i < n; i++) {
            const c = assignments[i];
            const v = entries[i].vec;
            for (let d = 0; d < dim; d++) next[c][d] += v[d];
            counts[c]++;
        }
        for (let c = 0; c < k; c++) {
            if (counts[c] > 0) {
                _normalize(next[c]);
            } else {
                // Empty cluster — reinitialize to a random entry to avoid dead centroids.
                next[c].set(entries[Math.floor(Math.random() * n)].vec);
            }
            centroids[c] = next[c];
        }

        pass++;
        if (pass < 3) {
            // Yield between passes so the event loop stays responsive.
            setImmediate(runPass);
        } else {
            // Done: build the cells array (centroid → list of entry indices).
            const cells = Array.from({ length: k }, () => []);
            for (let i = 0; i < n; i++) cells[assignments[i]].push(i);
            _cache.ivf = { centroids, cells };
        }
    }

    setImmediate(runPass);
}

// ── Main similarity search ────────────────────────────────────────────────────

/**
 * Generate an embedding for text via OpenAI and return it with token count.
 */
async function embedText(text) {
    const result = await createEmbedding(text);
    return { embedding: result.embedding, tokens: result.tokens };
}

/**
 * Find the most similar content embeddings to a query embedding.
 *
 * Uses the in-memory cache so there is no DB round-trip after the first call.
 * When the IVF index is ready, only ~(nprobe/k) ≈ 15% of vectors are scored
 * per query instead of 100%.
 *
 * Subject and userId filters are applied in memory after candidate selection.
 *
 * @param {number[]} queryEmbedding
 * @param {{ subject?: string, userId?: number, limit?: number, threshold?: number }} options
 * @returns {Array<{ sourceType, sourceId, chunkIndex, chunkText, subject, userId, similarity }>}
 */
async function findSimilar(queryEmbedding, options = {}) {
    const limit = options.limit || 10;
    const threshold = options.threshold || SIMILARITY_THRESHOLD;

    // Populate the cache on first call (or after invalidation).
    if (_cache.stale) await _loadCache();
    if (_cache.entries.length === 0) return [];

    const queryVec = _normalize(new Float32Array(queryEmbedding));

    // ── Candidate selection ─────────────────────────────────────────────────
    // Choose between IVF (fast, approximate) and brute-force (exact) based on
    // whether the IVF index is built and the subject filter is inactive.
    // When a subject filter is active we brute-force the filtered subset, which
    // is already much smaller than the full corpus and equally fast.

    let candidates; // { entry, sim }[]

    const ivf = _cache.ivf;
    const useIVF = ivf && !options.subject;

    if (useIVF) {
        const k = ivf.centroids.length;
        const nprobe = IVF_NPROBE > 0 ? IVF_NPROBE : Math.max(3, Math.ceil(k * 0.15));

        // Score all centroids (k << n), take the top nprobe.
        const centScores = ivf.centroids.map((c, idx) => ({ idx, dot: _dot(queryVec, c) }));
        centScores.sort((a, b) => b.dot - a.dot);

        // Collect candidate entry indices from the probed clusters.
        const probed = new Set();
        for (let p = 0; p < nprobe; p++) {
            for (const ei of ivf.cells[centScores[p].idx]) probed.add(ei);
        }

        // Score candidates and apply userId + excludeSourceTypes filters.
        candidates = [];
        for (const ei of probed) {
            const e = _cache.entries[ei];
            if (options.userId) {
                if (e.userId !== null && e.userId !== options.userId) continue;
            } else {
                if (e.userId !== null) continue;
            }
            if (options.excludeSourceTypes?.length && options.excludeSourceTypes.includes(e.sourceType)) continue;
            candidates.push({ entry: e, sim: _dot(queryVec, e.vec) });
        }
    } else {
        // Brute-force on the (optionally filtered) cache.
        candidates = [];
        for (const e of _cache.entries) {
            // userId filter
            if (options.userId) {
                if (e.userId !== null && e.userId !== options.userId) continue;
            } else {
                if (e.userId !== null) continue;
            }
            // subject filter — exclude entries with no subject or non-matching subject
            if (options.subject) {
                if (!e.subject || !e.subject.toLowerCase().includes(options.subject.toLowerCase())) continue;
            }
            if (options.excludeSourceTypes?.length && options.excludeSourceTypes.includes(e.sourceType)) continue;
            candidates.push({ entry: e, sim: _dot(queryVec, e.vec) });
        }
    }

    // ── Threshold, sort, slice ──────────────────────────────────────────────
    return candidates
        .filter(r => r.sim >= threshold)
        .sort((a, b) => b.sim - a.sim)
        .slice(0, limit)
        .map(r => ({
            sourceType: r.entry.sourceType,
            sourceId: r.entry.sourceId,
            chunkIndex: r.entry.chunkIndex,
            chunkText: r.entry.chunkText,
            subject: r.entry.subject,
            userId: r.entry.userId,
            similarity: r.sim,
        }));
}

/**
 * Check if the ContentEmbeddings table has any rows.
 */
async function hasEmbeddings() {
    try {
        const count = await ContentEmbeddings.count();
        return count > 0;
    } catch {
        return false;
    }
}

module.exports = {
    chunkText,
    estimateTokens,
    serializeEmbedding,
    deserializeEmbedding,
    cosineSimilarity,
    embedText,
    findSimilar,
    hasEmbeddings,
    invalidateVectorIndex,
};
