const db = require('../models');
const { ContentEmbeddings, WikiArticles, Questions, Answers, Posts, Resources, Users, GlobalDocuments } = db;

const { Op } = require('sequelize');
const { chunkText, estimateTokens, serializeEmbedding, invalidateVectorIndex } = require('./embeddingService');
const { createEmbeddingBatch } = require('./openai');
const { chunkContent } = require('./adaptiveChunker');

// Disable via RAG_ADAPTIVE_CHUNKS=false to fall back to flat sliding-window chunking.
const ADAPTIVE_CHUNKS_ENABLED = process.env.RAG_ADAPTIVE_CHUNKS !== 'false';

/**
 * Index (or re-index) a single piece of content.
 * Generates embeddings for each chunk and upserts into ContentEmbeddings.
 *
 * @param {'wiki'|'question'|'answer'|'resource'|'post'} sourceType
 * @param {number} sourceId
 */
async function indexContent(sourceType, sourceId, skipInvalidate = false) {
    const { text, prefix, subject, record } = await getContentText(sourceType, sourceId);

    // Prefer adaptive per-type chunking when we have a structured record.
    // Falls back to the legacy sliding-window path for any type without one.
    let chunks;
    if (ADAPTIVE_CHUNKS_ENABLED && record) {
        chunks = chunkContent(sourceType, record);
    } else if (text) {
        chunks = chunkText(text, prefix);
    } else {
        return;
    }
    if (chunks.length === 0) return;

    // Delete old embeddings for this source
    await ContentEmbeddings.destroy({
        where: { sourceType, sourceId },
    });

    // Generate embeddings for all chunks in a single batch API call, then bulk insert.
    // This replaces the old sequential loop: N chunks → N API calls → N DB inserts
    // with: N chunks → 1 API call → 1 bulk insert.
    const batchResults = await createEmbeddingBatch(chunks);

    await ContentEmbeddings.bulkCreate(
        chunks.map((chunk, i) => ({
            sourceType,
            sourceId,
            chunkIndex: i,
            chunkText: chunk,
            embedding: serializeEmbedding(batchResults[i].embedding),
            tokenCount: batchResults[i].tokens || estimateTokens(chunk),
            subject: subject || null,
        }))
    );
    if (!skipInvalidate) invalidateVectorIndex();
}

/**
 * Remove all embeddings for a piece of content.
 */
async function removeContent(sourceType, sourceId) {
    await ContentEmbeddings.destroy({
        where: { sourceType, sourceId },
    });
    invalidateVectorIndex();
}

/**
 * Re-index all content across all tables.
 * Processes in batches to avoid rate limits.
 * Returns { indexed, errors } counts.
 */
async function reindexAll(onProgress) {
    let indexed = 0;
    let errors = 0;

    // Clear all existing embeddings
    await ContentEmbeddings.destroy({ where: {} });

    const sources = [
        { type: 'wiki', model: WikiArticles, where: {} },
        { type: 'question', model: Questions, where: {} },
        // Only index answers that are accepted or have at least 1 vote
        { type: 'answer', model: Answers, where: { [Op.or]: [{ isAccepted: true }, { votes: { [Op.gt]: 0 } }] } },
        { type: 'post', model: Posts, where: {} },
        { type: 'resource', model: Resources, where: {} },
    ];

    const BATCH_SIZE = 5;
    const BATCH_DELAY_MS = 100;

    // Re-index global documents separately using stored chunksJson (no file re-read needed)
    if (GlobalDocuments) {
        const globalDocs = await GlobalDocuments.findAll({ attributes: ['id', 'chunksJson', 'subject'] });
        for (let i = 0; i < globalDocs.length; i += BATCH_SIZE) {
            const batch = globalDocs.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(async (doc) => {
                try {
                    if (!doc.chunksJson) return;
                    const chunks = JSON.parse(doc.chunksJson);
                    await indexGlobalDocument(doc.id, chunks, doc.subject, true);
                    indexed++;
                    if (onProgress) onProgress({ type: 'global_document', id: doc.id, indexed, errors });
                } catch (err) {
                    console.error(`Embedding error for global_document/${doc.id}:`, err.message);
                    errors++;
                }
            }));
            if (i + BATCH_SIZE < globalDocs.length) {
                await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
            }
        }
    }

    // Process documents in parallel batches — each doc is already 1 API call (batch embed),
    // so parallelising batches of 5 gives ~5× throughput while still respecting rate limits.

    for (const { type, model, where } of sources) {
        const records = await model.findAll({ attributes: ['id'], where });

        for (let i = 0; i < records.length; i += BATCH_SIZE) {
            const batch = records.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(async (record) => {
                try {
                    await indexContent(type, record.id, true);
                    indexed++;
                    if (onProgress) onProgress({ type, id: record.id, indexed, errors });
                } catch (err) {
                    console.error(`Embedding error for ${type}/${record.id}:`, err.message);
                    errors++;
                }
            }));

            if (i + BATCH_SIZE < records.length) {
                await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
            }
        }
    }

    invalidateVectorIndex();
    return { indexed, errors };
}

/**
 * Fetch the raw text and metadata for a given content source.
 */
async function getContentText(sourceType, sourceId) {
    switch (sourceType) {
        case 'wiki': {
            const article = await WikiArticles.findByPk(sourceId, {
                include: [{ model: Users, as: 'author', attributes: ['name'] }],
            });
            if (!article) return {};
            return {
                text: article.content,
                prefix: `Wiki Article: ${article.title}\nSubject: ${article.subject || 'General'}\nBy: ${article.author?.name || 'Unknown'}`,
                subject: article.subject,
                record: { title: article.title, content: article.content },
            };
        }
        case 'question': {
            const q = await Questions.findByPk(sourceId);
            if (!q) return {};

            // Fetch the best accepted/voted answer to create a compound chunk.
            // A student's query semantically matches the *question* text, but the useful
            // information lives in the *answer*. Including the answer here ensures it is
            // retrievable when the question embedding is the match during vector search.
            const bestAnswer = await Answers.findOne({
                where: { questionId: sourceId },
                order: [['isAccepted', 'DESC'], ['votes', 'DESC']],
                include: [{ model: Users, as: 'author', attributes: ['name', 'role'] }],
            });

            let text = `${q.title}\n\n${q.body}`;
            if (bestAnswer && (bestAnswer.isAccepted || (bestAnswer.votes || 0) > 0)) {
                const authorLabel = bestAnswer.author?.role === 'alumni' ? ' (Alumni)' : '';
                text += `\n\nAnswer by ${bestAnswer.author?.name || 'Unknown'}${authorLabel}:\n${bestAnswer.content}`;
            }

            return {
                text,
                prefix: `Q&A Question${bestAnswer?.isAccepted ? ' (Answered)' : ''}\nSubject: ${q.subject || 'General'}`,
                subject: q.subject,
                record: {
                    title: q.title,
                    body: q.body,
                    acceptedAnswer: bestAnswer?.isAccepted ? bestAnswer.content : null,
                },
            };
        }
        case 'answer': {
            const a = await Answers.findByPk(sourceId, {
                include: [
                    { model: Users, as: 'author', attributes: ['name', 'role'] },
                    { model: Questions },
                ],
            });
            if (!a) return {};
            // Skip low-quality answers — they add noise to retrieval
            if (!a.isAccepted && (a.votes || 0) === 0) return {};
            const q = a.Question;
            // Compound chunk: full question context + answer so a student's query
            // (which semantically matches the question text) retrieves the answer.
            const questionContext = [q?.title, q?.body].filter(Boolean).join('\n\n');
            return {
                text: `${questionContext}\n\nAnswer: ${a.content}`,
                prefix: `Q&A Answer${a.isAccepted ? ' (Accepted)' : ''}\nSubject: ${q?.subject || 'General'}\nBy: ${a.author?.name || 'Unknown'}${a.author?.role === 'alumni' ? ' (Alumni)' : ''}`,
                subject: q?.subject,
                record: { content: a.content, questionTitle: q?.title || '' },
            };
        }
        case 'resource': {
            const r = await Resources.findByPk(sourceId, {
                include: [{ model: Users, as: 'author', attributes: ['name'] }],
            });
            if (!r) return {};
            // Only index title + description, never paid content
            return {
                text: `${r.title}\n\n${r.description || ''}`,
                prefix: `Resource (${r.type})\nBy: ${r.author?.name || 'Unknown'}`,
                subject: null,
                record: { title: r.title, description: r.description || '', content: '' },
            };
        }
        case 'post': {
            const p = await Posts.findByPk(sourceId, {
                include: [{ model: Users, as: 'author', attributes: ['name'] }],
            });
            if (!p) return {};
            return {
                text: p.content,
                prefix: `${p.type === 'advice' ? 'Advice' : 'Blog'}: ${p.title}\nBy: ${p.author?.name || 'Unknown'}`,
                subject: null,
                record: { title: p.title, content: p.content },
            };
        }
        default:
            return {};
    }
}

/**
 * Index a user-uploaded document (sourceType = 'document').
 * Chunks are pre-computed by documentProcessor before calling this.
 *
 * @param {number} userId
 * @param {number} documentId - UserDocuments.id
 * @param {string[]} chunks - pre-computed text chunks
 * @param {string|null} subject
 */
async function indexDocument(userId, documentId, chunks, subject = null) {
    if (chunks.length === 0) return;

    await ContentEmbeddings.destroy({
        where: { sourceType: 'document', sourceId: documentId },
    });

    const batchResults = await createEmbeddingBatch(chunks);

    await ContentEmbeddings.bulkCreate(
        chunks.map((chunk, i) => ({
            sourceType: 'document',
            sourceId: documentId,
            userId,
            chunkIndex: i,
            chunkText: chunk,
            embedding: serializeEmbedding(batchResults[i].embedding),
            tokenCount: batchResults[i].tokens || estimateTokens(chunk),
            subject: subject || null,
        }))
    );
    invalidateVectorIndex();
}

/**
 * Remove all embeddings for a user-uploaded document.
 */
async function removeDocument(documentId) {
    await ContentEmbeddings.destroy({
        where: { sourceType: 'document', sourceId: documentId },
    });
    invalidateVectorIndex();
}

/**
 * Index a global admin-uploaded document (sourceType = 'global_document').
 * Chunks are pre-computed by documentProcessor. userId is always null (not user-scoped).
 * Also updates the chunkCount on the GlobalDocuments record.
 *
 * @param {number} docId - GlobalDocuments.id
 * @param {string[]} chunks - pre-computed text chunks
 * @param {string|null} subject
 */
async function indexGlobalDocument(docId, chunks, subject = null, skipInvalidate = false) {
    if (chunks.length === 0) return;

    await ContentEmbeddings.destroy({
        where: { sourceType: 'global_document', sourceId: docId },
    });

    const batchResults = await createEmbeddingBatch(chunks);

    await ContentEmbeddings.bulkCreate(
        chunks.map((chunk, i) => ({
            sourceType: 'global_document',
            sourceId: docId,
            userId: null,
            chunkIndex: i,
            chunkText: chunk,
            embedding: serializeEmbedding(batchResults[i].embedding),
            tokenCount: batchResults[i].tokens || estimateTokens(chunk),
            subject: subject || null,
        }))
    );

    // Update chunkCount on the record so admin UI shows indexing is done
    if (GlobalDocuments) {
        await GlobalDocuments.update({ chunkCount: chunks.length }, { where: { id: docId } });
    }

    if (!skipInvalidate) invalidateVectorIndex();
}

/**
 * Remove all embeddings for a global document.
 */
async function removeGlobalDocument(docId) {
    await ContentEmbeddings.destroy({
        where: { sourceType: 'global_document', sourceId: docId },
    });
    invalidateVectorIndex();
}

module.exports = { indexContent, removeContent, reindexAll, indexDocument, removeDocument, indexGlobalDocument, removeGlobalDocument };
