const db = require('../models');
const { WikiArticles, Questions, Answers, Posts, Resources, Users } = db;
const { Op } = require('sequelize');
const { embedText, findSimilar, hasEmbeddings } = require('./embeddingService');
const { rerank } = require('./rerank');
const { generateHypotheticalAnswer } = require('./hyde');
const { classifyQuery } = require('./queryIntent');

const MAX_CHUNKS = parseInt(process.env.RAG_MAX_CHUNKS || '5', 10);
const MAX_CHUNK_CHARS = 1200; // ~400 tokens (~3 chars per token)
const RERANK_CANDIDATES = parseInt(process.env.RAG_RERANK_CANDIDATES || '20', 10);

// Query preprocessing: strip stop words, punctuation, and short words to improve search relevance

const STOP_WORDS = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall',
    'should', 'may', 'might', 'must', 'can', 'could', 'i', 'me', 'my',
    'we', 'our', 'you', 'your', 'he', 'she', 'it', 'they', 'them',
    'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those',
    'am', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from',
    'about', 'as', 'into', 'through', 'during', 'before', 'after',
    'and', 'but', 'or', 'not', 'no', 'so', 'if', 'how', 'when',
    'where', 'why', 'all', 'each', 'every', 'both', 'few', 'more',
    'some', 'any', 'most', 'other', 'just', 'than', 'too', 'very',
    'explain', 'tell', 'describe', 'help', 'please', 'know',
]);

/**
 * Extract meaningful keywords from a query string.
 */
function extractKeywords(query) {
    return query
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 2 && !STOP_WORDS.has(w));
}

/**
 * Truncate text to approximately maxChars, breaking at sentence boundaries.
 */
function truncate(text, maxChars = MAX_CHUNK_CHARS) {
    if (!text || text.length <= maxChars) return text;
    const cut = text.slice(0, maxChars);
    const lastPeriod = cut.lastIndexOf('.');
    if (lastPeriod > maxChars * 0.5) return cut.slice(0, lastPeriod + 1);
    return cut + '...';
}

/**
 * Search WikiArticles using FULLTEXT with JOIN for author.
 * Falls back to LIKE if FULLTEXT indexes aren't available.
 */
async function searchWiki(_query, keywords, options = {}) {
    const cleanedQuery = keywords.join(' ');
    if (!cleanedQuery) return [];

    try {
        // FULLTEXT with JOIN — no N+1 queries
        const rows = await db.sequelize.query(`
            SELECT w.id, w.title, w.content, w.subject, w.views, w.createdAt,
                   u.name AS authorName,
                   MATCH(w.title, w.content) AGAINST(:query IN NATURAL LANGUAGE MODE) AS relevance
            FROM WikiArticles w
            LEFT JOIN Users u ON w.authorId = u.id
            WHERE MATCH(w.title, w.content) AGAINST(:query IN NATURAL LANGUAGE MODE)
            ORDER BY relevance DESC
            LIMIT 20
        `, {
            replacements: { query: cleanedQuery },
            type: db.sequelize.QueryTypes.SELECT,
        });

        return rows.map(row => ({
            source: 'wiki',
            sourceId: row.id,
            title: row.title,
            content: truncate(row.content),
            metadata: `By ${row.authorName || 'Unknown'} | ${row.subject || 'General'} | ${row.views} views`,
            score: normalizeScore(row.relevance, row, options),
        }));
    } catch {
        // FULLTEXT not available — fall back to LIKE with Sequelize
        try {
            const results = await WikiArticles.findAll({
                where: {
                    [Op.or]: keywords.map(kw => ({
                        [Op.or]: [
                            { title: { [Op.like]: `%${kw}%` } },
                            { content: { [Op.like]: `%${kw}%` } },
                        ]
                    })),
                },
                include: [{ model: Users, as: 'author', attributes: ['name'] }],
                limit: 20,
            });

            return results.map(article => ({
                source: 'wiki',
                sourceId: article.id,
                title: article.title,
                content: truncate(article.content),
                metadata: `By ${article.author?.name || 'Unknown'} | ${article.subject || 'General'} | ${article.views} views`,
                score: normalizeScore(0.5, article.dataValues, options),
            }));
        } catch {
            return [];
        }
    }
}

/**
 * Search Questions + best Answers using FULLTEXT with JOINs.
 * Single query fetches question + best answer + both authors.
 */
async function searchQA(_query, keywords, options = {}) {
    const cleanedQuery = keywords.join(' ');
    if (!cleanedQuery) return [];

    try {
        // FULLTEXT with JOINs — fetches question, best answer, and both authors in one query
        const rows = await db.sequelize.query(`
            SELECT q.id, q.title, q.body, q.subject, q.isAnswered, q.createdAt,
                   a.content AS answerContent, a.isAccepted, a.votes AS answerVotes,
                   au.name AS answerAuthorName, au.role AS answerAuthorRole,
                   MATCH(q.title, q.body) AGAINST(:query IN NATURAL LANGUAGE MODE) AS relevance
            FROM Questions q
            LEFT JOIN (
                SELECT a1.* FROM Answers a1
                INNER JOIN (
                    SELECT questionId, MAX(CASE WHEN isAccepted = 1 THEN 1000000 ELSE 0 END + votes) AS bestScore
                    FROM Answers GROUP BY questionId
                ) a2 ON a1.questionId = a2.questionId
                    AND (CASE WHEN a1.isAccepted = 1 THEN 1000000 ELSE 0 END + a1.votes) = a2.bestScore
            ) a ON a.questionId = q.id
            LEFT JOIN Users au ON a.authorId = au.id
            WHERE MATCH(q.title, q.body) AGAINST(:query IN NATURAL LANGUAGE MODE)
            ORDER BY relevance DESC
            LIMIT 20
        `, {
            replacements: { query: cleanedQuery },
            type: db.sequelize.QueryTypes.SELECT,
        });

        return rows.map(row => {
            let content = truncate(row.body);
            let metadata = row.subject || 'General';

            if (row.answerContent) {
                content += `\n\nBest Answer: ${truncate(row.answerContent, 600)}`;
                const isAlumni = row.answerAuthorRole === 'alumni';
                metadata += ` | Answer by ${row.answerAuthorName || 'Unknown'}${isAlumni ? ' (Alumni)' : ''}`;
                if (row.isAccepted) metadata += ' | Accepted';
                metadata += ` | ${row.answerVotes} votes`;
            }

            return {
                source: 'qa',
                sourceId: row.id,
                title: row.title,
                content,
                metadata,
                score: normalizeScore(row.relevance, {
                    ...row,
                    bestAnswer: row.answerContent ? {
                        isAccepted: row.isAccepted,
                        author: { role: row.answerAuthorRole },
                    } : null,
                }, options),
            };
        });
    } catch {
        try {
            const results = await Questions.findAll({
                where: {
                    [Op.or]: keywords.map(kw => ({
                        [Op.or]: [
                            { title: { [Op.like]: `%${kw}%` } },
                            { body: { [Op.like]: `%${kw}%` } },
                        ]
                    })),
                },
                include: [{ model: Users, as: 'author', attributes: ['name'] }],
                limit: 20,
            });

            // Batch fetch all answers in one query, then group by questionId in memory
            const questionIds = results.map(q => q.id);
            const allAnswers = await Answers.findAll({
                where: { questionId: { [Op.in]: questionIds } },
                order: [['isAccepted', 'DESC'], ['votes', 'DESC']],
                include: [{ model: Users, as: 'author', attributes: ['name', 'role'] }],
            });
            const bestAnswerMap = {};
            for (const a of allAnswers) {
                if (!bestAnswerMap[a.questionId]) bestAnswerMap[a.questionId] = a;
            }
            const withAnswers = results.map(q => ({ question: q, bestAnswer: bestAnswerMap[q.id] || null }));

            return withAnswers.map(({ question: q, bestAnswer: best }) => {
                let content = truncate(q.body);
                let metadata = q.subject || 'General';
                if (best) {
                    content += `\n\nBest Answer: ${truncate(best.content, 600)}`;
                    metadata += ` | Answer by ${best.author?.name || 'Unknown'} | ${best.votes} votes`;
                }
                return {
                    source: 'qa',
                    sourceId: q.id,
                    title: q.title,
                    content,
                    metadata,
                    score: normalizeScore(0.5, q.dataValues, options),
                };
            });
        } catch {
            return [];
        }
    }
}

/**
 * Search Posts (blog/advice) using FULLTEXT with JOIN for author.
 */
async function searchPosts(_query, keywords, options = {}) {
    const cleanedQuery = keywords.join(' ');
    if (!cleanedQuery) return [];

    try {
        const rows = await db.sequelize.query(`
            SELECT p.id, p.title, p.content, p.type, p.likes, p.createdAt,
                   u.name AS authorName,
                   MATCH(p.title, p.content) AGAINST(:query IN NATURAL LANGUAGE MODE) AS relevance
            FROM Posts p
            LEFT JOIN Users u ON p.authorId = u.id
            WHERE MATCH(p.title, p.content) AGAINST(:query IN NATURAL LANGUAGE MODE)
            ORDER BY relevance DESC
            LIMIT 20
        `, {
            replacements: { query: cleanedQuery },
            type: db.sequelize.QueryTypes.SELECT,
        });

        return rows.map(row => ({
            source: 'post',
            sourceId: row.id,
            title: row.title,
            content: truncate(row.content),
            metadata: `${row.type} by ${row.authorName || 'Unknown'} | ${row.likes} likes`,
            score: normalizeScore(row.relevance, row, options),
        }));
    } catch {
        try {
            const results = await Posts.findAll({
                where: {
                    [Op.or]: keywords.map(kw => ({
                        [Op.or]: [
                            { title: { [Op.like]: `%${kw}%` } },
                            { content: { [Op.like]: `%${kw}%` } },
                        ]
                    })),
                },
                include: [{ model: Users, as: 'author', attributes: ['name'] }],
                limit: 20,
            });

            return results.map(post => ({
                source: 'post',
                sourceId: post.id,
                title: post.title,
                content: truncate(post.content),
                metadata: `${post.type} by ${post.author?.name || 'Unknown'} | ${post.likes} likes`,
                score: normalizeScore(0.5, post.dataValues, options),
            }));
        } catch {
            return [];
        }
    }
}

/**
 * Search Resources (title + description only — never expose paid content).
 */
async function searchResources(_query, keywords, options = {}) {
    const cleanedQuery = keywords.join(' ');
    if (!cleanedQuery) return [];

    try {
        const rows = await db.sequelize.query(`
            SELECT r.id, r.title, r.description, r.type, r.downloads, r.price, r.createdAt,
                   u.name AS authorName,
                   MATCH(r.title, r.description) AGAINST(:query IN NATURAL LANGUAGE MODE) AS relevance
            FROM Resources r
            LEFT JOIN Users u ON r.authorId = u.id
            WHERE MATCH(r.title, r.description) AGAINST(:query IN NATURAL LANGUAGE MODE)
            ORDER BY relevance DESC
            LIMIT 20
        `, {
            replacements: { query: cleanedQuery },
            type: db.sequelize.QueryTypes.SELECT,
        });

        return rows.map(row => ({
            source: 'resource',
            sourceId: row.id,
            title: row.title,
            content: truncate(row.description || 'No description'),
            metadata: `${row.type} by ${row.authorName || 'Unknown'} | ${row.downloads} downloads | ${row.price} XP`,
            score: normalizeScore(row.relevance, row, options),
        }));
    } catch {
        try {
            const results = await Resources.findAll({
                where: {
                    [Op.or]: keywords.map(kw => ({
                        [Op.or]: [
                            { title: { [Op.like]: `%${kw}%` } },
                            { description: { [Op.like]: `%${kw}%` } },
                        ]
                    })),
                },
                include: [{ model: Users, as: 'author', attributes: ['name'] }],
                limit: 20,
            });

            return results.map(r => ({
                source: 'resource',
                sourceId: r.id,
                title: r.title,
                content: truncate(r.description || 'No description'),
                metadata: `${r.type} by ${r.author?.name || 'Unknown'} | ${r.downloads} downloads | ${r.price} XP`,
                score: normalizeScore(0.5, r.dataValues, options),
            }));
        } catch {
            return [];
        }
    }
}

/**
 * Compute a composite relevance score for ranking.
 */
function normalizeScore(rawRelevance, row, options = {}) {
    // Normalize FULLTEXT relevance to 0-1 (cap at 10 as practical max)
    let score = Math.min(rawRelevance / 10, 1);

    // Recency bonus: +0.1 if created within last 30 days
    if (row.createdAt) {
        const age = Date.now() - new Date(row.createdAt).getTime();
        if (age < 30 * 24 * 60 * 60 * 1000) score += 0.1;
    }

    // Quality bonuses — logarithmic scaling so 10,000 views isn't treated the same as 11.
    // log10(x+1)/log10(max+1) maps 0 → 0 and max → 0.1 continuously.
    score += 0.1 * Math.log10((row.views || 0) + 1) / Math.log10(1001);
    score += 0.1 * Math.log10((row.likes || 0) + 1) / Math.log10(101);
    score += 0.1 * Math.log10((row.downloads || 0) + 1) / Math.log10(1001);
    if (row.bestAnswer?.isAccepted) score += 0.3;
    if (row.bestAnswer?.author?.role === 'alumni') score += 0.15;

    // Subject match bonus
    if (options.subject && row.subject &&
        row.subject.toLowerCase().includes(options.subject.toLowerCase())) {
        score += 0.3;
    }

    return Math.min(score, 2.0); // cap
}

/**
 * Vector search — embed the query and find similar content via cosine similarity.
 * Augments the query with room subject/major so the query embedding lands in the same
 * semantic neighbourhood as stored chunks (which have these prefixes in their text).
 * Returns results in the same format as FULLTEXT search functions.
 */
async function vectorSearch(query, options = {}) {
    try {
        const vectorsExist = await hasEmbeddings();
        if (!vectorsExist) return [];

        const contextPrefix = [options.subject, options.major].filter(Boolean).join(' - ');
        const augmentedQuery = contextPrefix ? `${contextPrefix}: ${query}` : query;
        const { embedding } = await embedText(augmentedQuery);
        const similar = await findSimilar(embedding, {
            subject: options.subject || null,
            userId: options.userId || null,
            // Exclude global_document chunks for non-Pro users — Pro gate
            excludeSourceTypes: options.isPro ? [] : ['global_document'],
            limit: 15,
        });

        return similar.map(row => {
            // Boost user-uploaded documents — the user explicitly uploaded this material
            // for study, so it should rank above generic platform content for their queries.
            const isUserDoc = row.sourceType === 'document' && row.userId === options.userId;
            return {
                source: row.sourceType,
                sourceId: row.sourceId,
                chunkIndex: row.chunkIndex, // preserved for multi-chunk concatenation in retrieveContext
                title: '', // filled from chunkText prefix line
                content: row.chunkText,
                metadata: isUserDoc
                    ? `Your document — ${(row.similarity * 100).toFixed(0)}% match`
                    : `Vector similarity: ${(row.similarity * 100).toFixed(0)}%`,
                score: isUserDoc ? Math.min(row.similarity + 0.3, 1.0) : row.similarity,
            };
        });
    } catch (err) {
        console.error('Vector search error:', err.message);
        return [];
    }
}

/**
 * Main retrieval function — hybrid search combining FULLTEXT and vector results.
 * Runs both in parallel, merges, deduplicates by source+sourceId, returns top N.
 *
 * @param {string} query - The user's question
 * @param {object} options - { subject, major, gradeLevel, maxChunks }
 * @returns {Array<{ source, sourceId, title, content, metadata, score }>}
 */
async function retrieveContext(query, options = {}) {
    if (!query || query.trim().length < 3) return [];

    const keywords = extractKeywords(query);
    if (keywords.length === 0) return [];

    const maxChunks = options.maxChunks || MAX_CHUNKS;
    const RRF_K = 60; // standard RRF constant — empirically robust across domains

    // Kick off HyDE + intent classification in parallel with FULLTEXT search.
    // HyDE is skipped for long queries (already keyword-rich → low upside).
    // FULLTEXT doesn't depend on HyDE so we never block it on an LLM call.
    const HYDE_MAX_QUERY_LEN = 120;
    const hydePromise = query.length <= HYDE_MAX_QUERY_LEN
        ? generateHypotheticalAnswer(query, { subject: options.subject })
        : Promise.resolve(null);
    const intentPromise = classifyQuery(query, { subject: options.subject });

    const fulltextPromise = Promise.all([
        searchWiki(query, keywords, options).catch(() => []),
        searchQA(query, keywords, options).catch(() => []),
        searchPosts(query, keywords, options).catch(() => []),
        searchResources(query, keywords, options).catch(() => []),
    ]);

    // Wait for HyDE (but let fulltext + intent keep running), then start vector search.
    // userId is passed to vectorSearch so user-uploaded documents are included and boosted.
    const hypothetical = await hydePromise;
    const vectorQuery = hypothetical || query;
    const vectorPromise = vectorSearch(vectorQuery, options).catch(() => []);

    const [[wikiResults, qaResults, postResults, resourceResults], vectorResults] =
        await Promise.all([fulltextPromise, vectorPromise]);

    // Merge all FULLTEXT results into one ranked list.
    // When a subject is specified, wiki/qa/post/resource seed content is not subject-tagged
    // and is almost always irrelevant — exclude it to prevent noise from dominating RRF.
    const fulltextAll = options.subject
        ? []
        : [...wikiResults, ...qaResults, ...postResults, ...resourceResults];
    fulltextAll.sort((a, b) => b.score - a.score);

    // Consolidate vector results by document.
    // Vector search returns individual chunks (different chunkIndex values) for the same
    // source document. Rather than discarding the lower-scored chunks, concatenate them
    // in index order to preserve more context for the LLM.
    const vectorByDoc = new Map();
    for (const result of vectorResults) {
        const key = `${result.source}:${result.sourceId}`;
        const existing = vectorByDoc.get(key);
        if (!existing) {
            vectorByDoc.set(key, {
                ...result,
                _chunks: [{ index: result.chunkIndex ?? 0, content: result.content }],
            });
        } else {
            existing._chunks.push({ index: result.chunkIndex ?? 0, content: result.content });
            if (result.score > existing.score) existing.score = result.score;
        }
    }
    const vectorDeduplicated = Array.from(vectorByDoc.values()).map(result => {
        if (result._chunks.length > 1) {
            result._chunks.sort((a, b) => a.index - b.index);
            result.content = result._chunks.map(c => c.content).join('\n...\n');
        }
        delete result._chunks;
        return result;
    });
    vectorDeduplicated.sort((a, b) => b.score - a.score);

    // Apply Reciprocal Rank Fusion (RRF) to merge the two ranked lists.
    // RRF score = Σ 1/(k + rank) across every list a document appears in.
    // Because only rank positions matter (not raw score magnitudes), FULLTEXT relevance
    // values (0–2 range) and vector similarity values (0–1 range) can no longer
    // distort each other — this was the core bug in the previous merge strategy.
    // Documents appearing in both lists receive contributions from both, naturally
    // boosting results that are strong in keyword AND semantic matching.
    const rrfScores = new Map(); // key → { result, rrfScore }

    fulltextAll.forEach((result, rank) => {
        const key = `${result.source}:${result.sourceId}`;
        const increment = 1 / (RRF_K + rank + 1);
        if (rrfScores.has(key)) {
            rrfScores.get(key).rrfScore += increment;
        } else {
            rrfScores.set(key, { ...result, rrfScore: increment });
        }
    });

    vectorDeduplicated.forEach((result, rank) => {
        const key = `${result.source}:${result.sourceId}`;
        const increment = 1 / (RRF_K + rank + 1);
        if (rrfScores.has(key)) {
            rrfScores.get(key).rrfScore += increment;
        } else {
            rrfScores.set(key, { ...result, rrfScore: increment });
        }
    });

    const results = Array.from(rrfScores.values());

    // Intent-based per-source-type boosts (heuristic is free; LLM is opt-in via RAG_INTENT_MODE).
    // Kicked off in parallel with retrieval above — by here it's almost always already resolved.
    const { boosts } = await intentPromise;
    if (boosts && Object.keys(boosts).length) {
        for (const r of results) {
            const delta = boosts[r.source];
            if (delta) r.rrfScore += delta;
        }
    }

    // Post-RRF personalization boost: user-uploaded documents should rank above platform
    // content of equal relevance. The vector search already boosts similarity pre-RRF;
    // this additional post-RRF nudge ensures they win ties after rank fusion.
    // 'document' sourceType = user's personal doc (global_document = separate sourceType).
    if (options.userId) {
        for (const r of results) {
            if (r.source === 'document') r.rrfScore += 0.025;
        }
    }

    // When a subject is scoped, boost global_document (past papers + textbooks) so they
    // rank above any remaining generic content. Without this, vector-path wiki results
    // can outscore curriculum content by 13x due to generic academic phrasing similarity.
    if (options.subject) {
        for (const r of results) {
            if (r.source === 'global_document') r.rrfScore += 0.05;
        }
    }

    results.sort((a, b) => b.rrfScore - a.rrfScore);

    // Rerank (opt-in via RAG_RERANK_PROVIDER): hand the top N candidates to a
    // cross-encoder / LLM reranker for higher precision, then slice to maxChunks.
    // Uses the ORIGINAL user query (not the HyDE hypothetical) — reranker judges
    // relevance to what the user actually asked.
    const candidatePool = Math.max(RERANK_CANDIDATES, maxChunks);
    const candidates = results.slice(0, candidatePool);
    const reranked = await rerank(query, candidates, { topN: maxChunks });
    return reranked.slice(0, maxChunks);
}

module.exports = { retrieveContext, extractKeywords };
