'use strict';
process.env.JWT_SECRET = 'test-secret-key';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const express = require('express');

jest.mock('../../services/openai', () => ({
    chatCompletion: jest.fn(),
}));

jest.mock('../../services/ragRetriever', () => ({
    retrieveContext: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../models', () => {
    const mockQuestions = {
        count: jest.fn().mockResolvedValue(0),
        findAll: jest.fn().mockResolvedValue([]),
    };
    const mockAnswers = { findOne: jest.fn().mockResolvedValue(null) };
    return { Questions: mockQuestions, Answers: mockAnswers };
});

const db = require('../../models');
const { chatCompletion } = require('../../services/openai');
const { retrieveContext } = require('../../services/ragRetriever');
const publicRouter = require('../../routes/Public');

/**
 * Build a test app for the public router. Trust proxy is enabled so
 * X-Forwarded-For drives req.ip — this lets each test simulate a fresh
 * IP and avoids rate-limit state bleeding across tests.
 */
const buildApp = (roomUsers = null) => {
    const app = express();
    app.set('trust proxy', true);
    app.use(express.json());
    if (roomUsers) app.set('roomUsers', roomUsers);
    app.use('/public', publicRouter);
    return app;
};

let ipCounter = 0;
const nextIp = () => `10.0.${Math.floor(ipCounter / 256) % 256}.${ipCounter++ % 256}`;

describe('Public routes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        db.Questions.count.mockResolvedValue(0);
        db.Questions.findAll.mockResolvedValue([]);
        db.Answers.findOne.mockResolvedValue(null);
        chatCompletion.mockResolvedValue({ content: 'mock answer', tokens: 50 });
        retrieveContext.mockResolvedValue([]);
    });

    // ── GET /public/stats ─────────────────────────────────────────────────────

    describe('GET /public/stats', () => {
        it('returns zeros when no rooms or activity', async () => {
            const res = await request(buildApp()).get('/public/stats');
            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                studentsOnline: 0,
                activeRooms: 0,
                questionsLast24h: 0,
                unansweredQuestions: 0,
                lastAnswerMinutesAgo: null,
            });
        });

        it('counts active rooms and online students from roomUsers map', async () => {
            const roomUsers = new Map([
                ['r1', new Map([['s1', {}], ['s2', {}]])],
                ['r2', new Map([['s3', {}]])],
                ['r3', new Map()], // empty rooms are ignored
            ]);
            const res = await request(buildApp(roomUsers)).get('/public/stats');
            expect(res.body.activeRooms).toBe(2);
            expect(res.body.studentsOnline).toBe(3);
        });

        it('returns questions count and last-answer freshness', async () => {
            db.Questions.count.mockResolvedValue(12);
            const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
            db.Answers.findOne.mockResolvedValue({ createdAt: fiveMinAgo });
            const res = await request(buildApp()).get('/public/stats');
            expect(res.body.questionsLast24h).toBe(12);
            expect(res.body.lastAnswerMinutesAgo).toBeGreaterThanOrEqual(4);
            expect(res.body.lastAnswerMinutesAgo).toBeLessThanOrEqual(6);
        });

        it('returns an unansweredQuestions count', async () => {
            db.Questions.count
                .mockResolvedValueOnce(8)   // questionsLast24h
                .mockResolvedValueOnce(15); // unansweredQuestions
            const res = await request(buildApp()).get('/public/stats');
            expect(res.body.questionsLast24h).toBe(8);
            expect(res.body.unansweredQuestions).toBe(15);
        });

        it('does not require authentication', async () => {
            const res = await request(buildApp()).get('/public/stats');
            expect(res.status).toBe(200);
        });

        it('returns safe zeros when DB calls fail', async () => {
            db.Questions.count.mockRejectedValue(new Error('db down'));
            db.Answers.findOne.mockRejectedValue(new Error('db down'));
            const res = await request(buildApp()).get('/public/stats');
            expect(res.status).toBe(200);
            expect(res.body.questionsLast24h).toBe(0);
            expect(res.body.lastAnswerMinutesAgo).toBeNull();
        });
    });

    // ── POST /public/ai-try ───────────────────────────────────────────────────

    describe('POST /public/ai-try', () => {
        it('rejects empty message with 400', async () => {
            const res = await request(buildApp())
                .post('/public/ai-try')
                .set('X-Forwarded-For', nextIp())
                .send({ message: '' });
            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/required/i);
        });

        it('rejects messages over 200 chars with 400', async () => {
            const res = await request(buildApp())
                .post('/public/ai-try')
                .set('X-Forwarded-For', nextIp())
                .send({ message: 'x'.repeat(201) });
            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/200 characters/i);
        });

        it('returns an answer and sources for a valid prompt', async () => {
            retrieveContext.mockResolvedValue([
                { source: 'wiki', title: 'Chain Rule', content: 'If h(x) = f(g(x))...' },
            ]);
            chatCompletion.mockResolvedValue({ content: 'Here is an IB answer.', tokens: 30 });

            const res = await request(buildApp())
                .post('/public/ai-try')
                .set('X-Forwarded-For', nextIp())
                .send({ message: 'Explain the chain rule in IB Maths AA' });

            expect(res.status).toBe(200);
            expect(res.body.answer).toBe('Here is an IB answer.');
            expect(res.body.sources).toHaveLength(1);
            expect(res.body.sources[0].source).toBe('wiki');
            expect(typeof res.body.remainingToday).toBe('number');
        });

        it('injects IB prompt guidance into the system message', async () => {
            await request(buildApp())
                .post('/public/ai-try')
                .set('X-Forwarded-For', nextIp())
                .send({ message: 'What is SN2?' });
            const callArgs = chatCompletion.mock.calls[0][0];
            const systemContent = callArgs.find(m => m.role === 'system').content;
            expect(systemContent).toMatch(/IB/i);
            expect(systemContent).toMatch(/command term/i);
        });

        it('rate-limits to 3 requests per window from the same IP', async () => {
            const ip = nextIp();
            const app = buildApp();
            const ok1 = await request(app).post('/public/ai-try').set('X-Forwarded-For', ip).send({ message: 'q1' });
            const ok2 = await request(app).post('/public/ai-try').set('X-Forwarded-For', ip).send({ message: 'q2' });
            const ok3 = await request(app).post('/public/ai-try').set('X-Forwarded-For', ip).send({ message: 'q3' });
            const blocked = await request(app).post('/public/ai-try').set('X-Forwarded-For', ip).send({ message: 'q4' });

            expect(ok1.status).toBe(200);
            expect(ok2.status).toBe(200);
            expect(ok3.status).toBe(200);
            expect(blocked.status).toBe(429);
            expect(blocked.body.rateLimited).toBe(true);
        });

        it('returns 503 when AI provider is not configured', async () => {
            const err = Object.assign(new Error('invalid key'), { status: 401, code: 'invalid_api_key' });
            chatCompletion.mockRejectedValue(err);

            const res = await request(buildApp())
                .post('/public/ai-try')
                .set('X-Forwarded-For', nextIp())
                .send({ message: 'valid question' });
            expect(res.status).toBe(503);
            expect(res.body.error).toMatch(/unavailable/i);
        });

        it('does not require authentication', async () => {
            const res = await request(buildApp())
                .post('/public/ai-try')
                .set('X-Forwarded-For', nextIp())
                .send({ message: 'no auth' });
            expect(res.status).toBe(200);
        });
    });

    // ── GET /public/open-questions ────────────────────────────────────────────

    describe('GET /public/open-questions', () => {
        it('returns the shape {questions: []} with title, subject, createdAt', async () => {
            const now = new Date();
            db.Questions.findAll.mockResolvedValue([
                { id: 1, title: 'Chain rule?', subject: 'IB Maths AA HL', createdAt: now },
                { id: 2, title: 'ETC steps', subject: 'IB Bio HL', createdAt: now },
            ]);
            const res = await request(buildApp()).get('/public/open-questions');
            expect(res.status).toBe(200);
            expect(Array.isArray(res.body.questions)).toBe(true);
            expect(res.body.questions).toHaveLength(2);
            expect(res.body.questions[0]).toMatchObject({
                id: 1,
                title: 'Chain rule?',
                subject: 'IB Maths AA HL',
            });
            expect(res.body.questions[0].createdAt).toBeDefined();
        });

        it('filters to isAnswered=false', async () => {
            db.Questions.findAll.mockResolvedValue([]);
            await request(buildApp()).get('/public/open-questions');
            const call = db.Questions.findAll.mock.calls[0][0];
            expect(call.where).toEqual({ isAnswered: false });
        });

        it('caps limit at 6 and defaults to 3', async () => {
            db.Questions.findAll.mockResolvedValue([]);
            await request(buildApp()).get('/public/open-questions');
            expect(db.Questions.findAll.mock.calls[0][0].limit).toBe(3);

            db.Questions.findAll.mockClear();
            await request(buildApp()).get('/public/open-questions?limit=100');
            expect(db.Questions.findAll.mock.calls[0][0].limit).toBe(6);
        });

        it('returns empty array on DB failure (200)', async () => {
            db.Questions.findAll.mockRejectedValue(new Error('db down'));
            const res = await request(buildApp()).get('/public/open-questions');
            expect(res.status).toBe(200);
            expect(res.body.questions).toEqual([]);
        });

        it('does not require authentication', async () => {
            const res = await request(buildApp()).get('/public/open-questions');
            expect(res.status).toBe(200);
        });
    });
});
