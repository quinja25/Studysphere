'use strict';

const { chatCompletion } = require('./openai');

// ── Regex signals ────────────────────────────────────────────────────────────
const SIGNALS = {
    exam:    /\b(mark scheme|past paper|syllabus|paper \d|HL|SL|IB|AP exam)\b/i,
    code:    /\b(syntax|error|function|method|array|loop|debug|compile|code)\b/i,
    howto:   /^how (do|can|to)\b/i,
    howto2:  /\bstep[- ]by[- ]step\b/i,
    concept: /\b(explain|what is|define|why|theorem|principle|derivation)\b/i,
};

// ── Boost tables ─────────────────────────────────────────────────────────────
const BOOST_TABLE = {
    exam:    { document: 0.25, resource: 0.1, wiki: -0.05 },
    code:    { answer: 0.2, post: 0.1, wiki: -0.05 },
    howto:   { answer: 0.15, post: 0.1, wiki: 0.05 },
    concept: { wiki: 0.2, answer: 0.05, post: -0.05 },
    general: {},
};

// ── Heuristic classifier ─────────────────────────────────────────────────────
function heuristicClassify(query) {
    const scores = { exam: 0, code: 0, howto: 0, concept: 0 };

    if (SIGNALS.exam.test(query))    scores.exam++;
    if (SIGNALS.code.test(query))    scores.code++;
    if (SIGNALS.howto.test(query))   scores.howto++;
    if (SIGNALS.howto2.test(query))  scores.howto++;
    if (SIGNALS.concept.test(query)) scores.concept++;

    const totalMatches = Object.values(scores).reduce((a, b) => a + b, 0);
    const confidence = Math.min(totalMatches / 3, 1);

    if (totalMatches === 0) {
        return { intent: 'general', boosts: {}, confidence: 0 };
    }

    const intent = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
    return { intent, boosts: { ...BOOST_TABLE[intent] }, confidence };
}

// ── LLM classifier ───────────────────────────────────────────────────────────
const LLM_SYSTEM = `You are a query intent classifier for a study platform RAG system.
Given a user query, respond with valid JSON only: {"intent":"<intent>","confidence":<0-1>}
Valid intents: exam, concept, code, howto, general
- exam: past papers, mark schemes, syllabus, exam questions
- concept: explanations, definitions, theory, why/what questions
- code: programming syntax, debugging, methods, arrays, functions
- howto: procedural how-to questions, step-by-step instructions
- general: anything else`;

async function llmClassify(query) {
    const result = await chatCompletion(
        [
            { role: 'system', content: LLM_SYSTEM },
            { role: 'user', content: query },
        ],
        { max_tokens: 64, temperature: 0, response_format: { type: 'json_object' } }
    );
    const parsed = JSON.parse(result.content);
    const intent = BOOST_TABLE[parsed.intent] !== undefined ? parsed.intent : 'general';
    const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.5;
    return { intent, boosts: { ...BOOST_TABLE[intent] }, confidence };
}

// ── Public API ───────────────────────────────────────────────────────────────
/**
 * Classify the user's query intent and return per-source-type boosts.
 * Intents: 'exam' | 'concept' | 'code' | 'howto' | 'general'
 *
 * @param {string} query
 * @param {object} [options] — { subject }
 * @returns {Promise<{ intent: string, boosts: Record<string, number>, confidence: number }>}
 */
async function classifyQuery(query, options = {}) {
    void options; // reserved for future use
    const mode = process.env.RAG_INTENT_MODE || 'heuristic';

    if (mode === 'off') {
        return { intent: 'general', boosts: {}, confidence: 0 };
    }

    if (mode === 'llm') {
        try {
            return await llmClassify(query);
        } catch (_) {
            return heuristicClassify(query);
        }
    }

    return heuristicClassify(query);
}

module.exports = { classifyQuery };
