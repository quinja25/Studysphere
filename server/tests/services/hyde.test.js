'use strict';
process.env.NODE_ENV = 'test';

jest.mock('../../services/openai', () => ({
    chatCompletion: jest.fn(),
}));

const { chatCompletion } = require('../../services/openai');

// Re-require after env manipulation so the module picks up the correct env state.
function loadHyde() {
    jest.resetModules();
    // Re-apply mock after resetModules
    jest.mock('../../services/openai', () => ({
        chatCompletion: jest.fn(),
    }));
    return require('../../services/hyde');
}

afterEach(() => {
    delete process.env.RAG_HYDE_ENABLED;
    jest.clearAllMocks();
});

describe('generateHypotheticalAnswer', () => {
    it('is disabled by default — returns null without calling LLM', async () => {
        delete process.env.RAG_HYDE_ENABLED;
        const { generateHypotheticalAnswer } = loadHyde();
        const result = await generateHypotheticalAnswer('What is photosynthesis?');
        expect(result).toBeNull();
        const { chatCompletion: cc } = require('../../services/openai');
        expect(cc).not.toHaveBeenCalled();
    });

    it('enabled + empty query returns null without LLM call', async () => {
        process.env.RAG_HYDE_ENABLED = 'true';
        const { generateHypotheticalAnswer } = loadHyde();
        const { chatCompletion: cc } = require('../../services/openai');
        expect(await generateHypotheticalAnswer('')).toBeNull();
        expect(await generateHypotheticalAnswer('   ')).toBeNull();
        expect(await generateHypotheticalAnswer(null)).toBeNull();
        expect(cc).not.toHaveBeenCalled();
    });

    it('enabled + valid query calls chatCompletion and returns trimmed hypothetical', async () => {
        process.env.RAG_HYDE_ENABLED = 'true';
        const { generateHypotheticalAnswer } = loadHyde();
        const { chatCompletion: cc } = require('../../services/openai');
        cc.mockResolvedValue({ content: '  Photosynthesis is the process by which plants convert light.  ' });

        const result = await generateHypotheticalAnswer('What is photosynthesis?');

        expect(result).toBe('Photosynthesis is the process by which plants convert light.');
        expect(cc).toHaveBeenCalledTimes(1);
        const [messages] = cc.mock.calls[0];
        expect(messages[0].role).toBe('system');
        expect(messages[1].role).toBe('user');
        expect(messages[1].content).toBe('What is photosynthesis?');
    });

    it('enabled + subject option includes subject in system prompt', async () => {
        process.env.RAG_HYDE_ENABLED = 'true';
        const { generateHypotheticalAnswer } = loadHyde();
        const { chatCompletion: cc } = require('../../services/openai');
        cc.mockResolvedValue({ content: 'Mitosis is a form of cell division.' });

        await generateHypotheticalAnswer('Explain mitosis', { subject: 'Biology' });

        const [messages] = cc.mock.calls[0];
        expect(messages[0].content).toContain('The subject context is: Biology.');
    });

    it('enabled + LLM throws returns null without re-throwing', async () => {
        process.env.RAG_HYDE_ENABLED = 'true';
        const { generateHypotheticalAnswer } = loadHyde();
        const { chatCompletion: cc } = require('../../services/openai');
        cc.mockRejectedValue(new Error('API timeout'));

        const result = await generateHypotheticalAnswer('What is gravity?');
        expect(result).toBeNull();
    });

    it('enabled + LLM returns whitespace-only content returns null', async () => {
        process.env.RAG_HYDE_ENABLED = 'true';
        const { generateHypotheticalAnswer } = loadHyde();
        const { chatCompletion: cc } = require('../../services/openai');
        cc.mockResolvedValue({ content: '   \n  ' });

        const result = await generateHypotheticalAnswer('What is entropy?');
        expect(result).toBeNull();
    });

    it('sends correct parameters — temperature 0.3 and max_tokens 200', async () => {
        process.env.RAG_HYDE_ENABLED = 'true';
        const { generateHypotheticalAnswer } = loadHyde();
        const { chatCompletion: cc } = require('../../services/openai');
        cc.mockResolvedValue({ content: 'Some answer.' });

        await generateHypotheticalAnswer('Define entropy');

        const [, options] = cc.mock.calls[0];
        expect(options).toMatchObject({ temperature: 0.3, max_tokens: 200 });
    });
});
