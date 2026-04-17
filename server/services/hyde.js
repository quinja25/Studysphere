'use strict';

const { chatCompletion } = require('./openai');

const SYSTEM_BASE =
    'Write a concise, confident paragraph (2–4 sentences) that would ideally answer the ' +
    "user's question, as if you were a knowledgeable tutor. Use domain-appropriate vocabulary. " +
    'If the answer is uncertain, still write a plausible textbook-style response — the text ' +
    'will be used to improve search retrieval, not shown to the user.';

/**
 * Generate a hypothetical answer for a query, for use as an embedding search input.
 * Never throws — returns null on any failure. Callers can fall back to the original query.
 *
 * @param {string} query
 * @param {object} [options] — { subject } optional subject context
 * @returns {Promise<string|null>} hypothetical paragraph or null
 */
async function generateHypotheticalAnswer(query, options = {}) {
    if (process.env.RAG_HYDE_ENABLED !== 'true') return null;
    if (!query?.trim()) return null;

    const systemPrompt = options.subject
        ? `${SYSTEM_BASE} The subject context is: ${options.subject}.`
        : SYSTEM_BASE;

    try {
        const result = await chatCompletion(
            [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: query },
            ],
            { temperature: 0.3, max_tokens: 200 }
        );
        const text = result.content?.trim();
        return text || null;
    } catch (err) {
        console.error('[HyDE] generateHypotheticalAnswer error:', err.message);
        return null;
    }
}

module.exports = { generateHypotheticalAnswer };
