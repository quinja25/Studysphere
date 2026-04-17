'use strict';

jest.mock('../../services/openai', () => ({
    chatCompletion: jest.fn(),
}));

const { chatCompletion } = require('../../services/openai');
const { rewriteQuery } = require('../../services/queryRewriter');

const HISTORY = [
    { role: 'user', content: 'Tell me about IB Physics.' },
    { role: 'assistant', content: 'IB Physics covers mechanics, waves, and more.' },
];

beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.RAG_QUERY_REWRITE_ENABLED;
});

describe('rewriteQuery', () => {
    describe('disabled by default', () => {
        it('returns input verbatim without calling chatCompletion', async () => {
            const result = await rewriteQuery('what about HL?', HISTORY);
            expect(result).toBe('what about HL?');
            expect(chatCompletion).not.toHaveBeenCalled();
        });
    });

    describe('enabled (RAG_QUERY_REWRITE_ENABLED=true)', () => {
        beforeEach(() => {
            process.env.RAG_QUERY_REWRITE_ENABLED = 'true';
        });

        it('returns input unchanged and skips LLM when history is empty', async () => {
            const result = await rewriteQuery('what about HL?', []);
            expect(result).toBe('what about HL?');
            expect(chatCompletion).not.toHaveBeenCalled();
        });

        it('returns input unchanged and skips LLM when history is omitted', async () => {
            const result = await rewriteQuery('what about HL?');
            expect(result).toBe('what about HL?');
            expect(chatCompletion).not.toHaveBeenCalled();
        });

        it('calls chatCompletion with correct system prompt, last 3 history turns, and user message', async () => {
            const longHistory = [
                { role: 'user', content: 'msg1' },
                { role: 'assistant', content: 'ans1' },
                { role: 'user', content: 'msg2' },
                { role: 'assistant', content: 'ans2' },
                { role: 'user', content: 'msg3' },
            ];
            chatCompletion.mockResolvedValue({ content: 'IB Physics HL topics', tokens: 10 });

            await rewriteQuery('what about HL?', longHistory);

            expect(chatCompletion).toHaveBeenCalledTimes(1);
            const [messages, options] = chatCompletion.mock.calls[0];

            // system prompt is first
            expect(messages[0].role).toBe('system');
            expect(messages[0].content).toMatch(/self-contained search query/);

            // only last 3 history turns included (indices 2-4 of longHistory)
            const historyInCall = messages.slice(1, -1);
            expect(historyInCall).toHaveLength(3);
            expect(historyInCall[0].content).toBe('msg2');

            // user message is last
            expect(messages[messages.length - 1]).toEqual({ role: 'user', content: 'what about HL?' });

            expect(options).toEqual({ temperature: 0.1, max_tokens: 150 });
        });

        it('returns trimmed rewrite from LLM', async () => {
            chatCompletion.mockResolvedValue({ content: '  IB Physics HL syllabus topics  ', tokens: 8 });
            const result = await rewriteQuery('what about HL?', HISTORY);
            expect(result).toBe('IB Physics HL syllabus topics');
        });

        it('returns original message when LLM throws', async () => {
            chatCompletion.mockRejectedValue(new Error('API 401 Unauthorized'));
            const result = await rewriteQuery('what about HL?', HISTORY);
            expect(result).toBe('what about HL?');
        });

        it('returns original message when LLM returns whitespace', async () => {
            chatCompletion.mockResolvedValue({ content: '   ', tokens: 2 });
            const result = await rewriteQuery('what about HL?', HISTORY);
            expect(result).toBe('what about HL?');
        });

        it('returns message unchanged when message is empty/whitespace', async () => {
            const result = await rewriteQuery('   ', HISTORY);
            expect(result).toBe('   ');
            expect(chatCompletion).not.toHaveBeenCalled();
        });
    });
});
