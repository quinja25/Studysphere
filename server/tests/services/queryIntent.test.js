'use strict';

jest.mock('../../services/openai', () => ({
    chatCompletion: jest.fn(),
}));

const { chatCompletion } = require('../../services/openai');
const { classifyQuery } = require('../../services/queryIntent');

beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.RAG_INTENT_MODE;
});

// ── off mode ─────────────────────────────────────────────────────────────────
describe('off mode', () => {
    it('returns general/empty boosts without calling the LLM', async () => {
        process.env.RAG_INTENT_MODE = 'off';
        const result = await classifyQuery('past paper HL exam');
        expect(result).toEqual({ intent: 'general', boosts: {}, confidence: 0 });
        expect(chatCompletion).not.toHaveBeenCalled();
    });
});

// ── heuristic mode ────────────────────────────────────────────────────────────
describe('heuristic mode', () => {
    beforeEach(() => {
        process.env.RAG_INTENT_MODE = 'heuristic';
    });

    it('detects exam intent from "past paper" signal', async () => {
        const result = await classifyQuery('Can I see a past paper for IB Physics?');
        expect(result.intent).toBe('exam');
        expect(result.boosts).toEqual({ document: 0.25, resource: 0.1, wiki: -0.05 });
        expect(result.confidence).toBeGreaterThan(0);
    });

    it('detects exam intent from "mark scheme" signal', async () => {
        const result = await classifyQuery('Where can I find the mark scheme?');
        expect(result.intent).toBe('exam');
        expect(result.boosts.document).toBe(0.25);
    });

    it('detects code intent from "syntax" signal', async () => {
        const result = await classifyQuery('What is the syntax for Array.map?');
        expect(result.intent).toBe('code');
        expect(result.boosts).toEqual({ answer: 0.2, post: 0.1, wiki: -0.05 });
    });

    it('detects code intent from "debug" signal', async () => {
        const result = await classifyQuery('How do I debug this loop?');
        expect(result.intent).toBe('code');
    });

    it('detects howto intent from "how do" prefix', async () => {
        const result = await classifyQuery('How do I solve quadratic equations?');
        expect(result.intent).toBe('howto');
        expect(result.boosts).toEqual({ answer: 0.15, post: 0.1, wiki: 0.05 });
    });

    it('detects howto intent from "step-by-step" signal', async () => {
        const result = await classifyQuery('Give me a step-by-step guide to integration');
        expect(result.intent).toBe('howto');
        expect(result.boosts.answer).toBe(0.15);
    });

    it('detects concept intent from "explain" signal', async () => {
        const result = await classifyQuery('Can you explain the Pythagorean theorem?');
        expect(result.intent).toBe('concept');
        expect(result.boosts).toEqual({ wiki: 0.2, answer: 0.05, post: -0.05 });
    });

    it('detects concept intent from "what is" signal', async () => {
        const result = await classifyQuery('What is the derivation of the quadratic formula?');
        expect(result.intent).toBe('concept');
    });

    it('returns general intent and empty boosts when no signals match', async () => {
        const result = await classifyQuery('Tell me something interesting');
        expect(result.intent).toBe('general');
        expect(result.boosts).toEqual({});
        expect(result.confidence).toBe(0);
    });

    it('multi-signal query picks highest-scoring intent', async () => {
        // "past paper" triggers exam once; "explain" triggers concept once — exam has same score.
        // When equal, the first in iteration order wins (exam comes before concept).
        // Let's craft a query that clearly favours one intent.
        // "mark scheme" + "syllabus" both exam signals → score 2 vs concept 1 → exam wins.
        const result = await classifyQuery('explain the mark scheme and syllabus for IB');
        expect(result.intent).toBe('exam');
    });

    it('confidence is 0 when there are no matches', async () => {
        const result = await classifyQuery('random unrelated words here');
        expect(result.confidence).toBe(0);
    });

    it('confidence is capped at 1 for 3+ matches', async () => {
        // exam signal + code signal + howto prefix = 3 separate signal slots fire
        const result = await classifyQuery('How do I debug the past paper function?');
        expect(result.confidence).toBe(1);
    });

    it('confidence is fractional for a single match', async () => {
        const result = await classifyQuery('explain the water cycle');
        // 1 match / 3 = 0.333...
        expect(result.confidence).toBeCloseTo(1 / 3, 5);
    });
});

// ── llm mode ──────────────────────────────────────────────────────────────────
describe('llm mode', () => {
    beforeEach(() => {
        process.env.RAG_INTENT_MODE = 'llm';
    });

    it('classifies correctly when LLM returns valid JSON', async () => {
        chatCompletion.mockResolvedValue({ content: '{"intent":"concept","confidence":0.9}', tokens: 10 });
        const result = await classifyQuery('What is Newton\'s second law?');
        expect(result.intent).toBe('concept');
        expect(result.boosts).toEqual({ wiki: 0.2, answer: 0.05, post: -0.05 });
        expect(result.confidence).toBe(0.9);
        expect(chatCompletion).toHaveBeenCalledTimes(1);
    });

    it('falls back to heuristic when LLM throws', async () => {
        chatCompletion.mockRejectedValue(new Error('API timeout'));
        // "past paper" → heuristic exam
        const result = await classifyQuery('past paper for IB Chemistry');
        expect(result.intent).toBe('exam');
        expect(result.boosts.document).toBe(0.25);
    });

    it('falls back to heuristic when LLM returns invalid JSON', async () => {
        chatCompletion.mockResolvedValue({ content: 'not json at all', tokens: 5 });
        const result = await classifyQuery('explain the theorem');
        expect(result.intent).toBe('concept');
        expect(result.boosts.wiki).toBe(0.2);
    });

    it('maps unknown LLM intent to general', async () => {
        chatCompletion.mockResolvedValue({ content: '{"intent":"unknown_type","confidence":0.5}', tokens: 8 });
        const result = await classifyQuery('some query');
        expect(result.intent).toBe('general');
        expect(result.boosts).toEqual({});
    });
});
