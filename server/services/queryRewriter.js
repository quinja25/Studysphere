'use strict';

const { chatCompletion } = require('./openai');

const SYSTEM_PROMPT =
    'You rewrite user queries for a search engine. Given conversation history and the latest user message, ' +
    'output a single self-contained search query that captures the user\'s intent. ' +
    'Preserve proper nouns and technical terms. Output ONLY the rewritten query — no preamble, no quotes.';

/**
 * Rewrite the user's latest message as a standalone search query, using recent history for context.
 * Skips the LLM call (returns message unchanged) when history is empty or rewrite is disabled.
 * Never throws — returns the original message on any failure.
 *
 * @param {string} message — latest user message
 * @param {Array<{role, content}>} history — prior turns (optional)
 * @returns {Promise<string>} rewritten standalone query, or the original message
 */
async function rewriteQuery(message, history = []) {
    if (!message?.trim()) return message;
    if (process.env.RAG_QUERY_REWRITE_ENABLED !== 'true') return message;
    if (history.length === 0) return message;

    try {
        const recentHistory = history.slice(-3);
        const messages = [
            { role: 'system', content: SYSTEM_PROMPT },
            ...recentHistory,
            { role: 'user', content: message },
        ];
        const result = await chatCompletion(messages, { temperature: 0.1, max_tokens: 150 });
        const rewritten = result.content?.trim();
        return rewritten || message;
    } catch (err) {
        console.error('[queryRewriter] rewrite failed:', err.message || err);
        return message;
    }
}

module.exports = { rewriteQuery };
