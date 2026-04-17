'use strict';
process.env.JWT_SECRET = 'test-secret-key';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const express = require('express');
const { generateAccessToken } = require('../helpers/authHelpers');

jest.mock('../../models', () => ({
    AiFeedback: {
        create: jest.fn(),
        findAll: jest.fn(),
        findAndCountAll: jest.fn(),
        count: jest.fn(),
    },
}));

const { AiFeedback } = require('../../models');
const router = require('../../routes/AiFeedback');

const app = express();
app.use(express.json());
app.use('/ai-feedback', router);

beforeEach(() => { jest.clearAllMocks(); });

// ── POST /ai-feedback ─────────────────────────────────────────────────────────

describe('POST /ai-feedback', () => {
    it('returns 401 without auth token', async () => {
        const res = await request(app).post('/ai-feedback').send({ queryText: 'hi', rating: 'up' });
        expect(res.status).toBe(401);
    });

    it('returns 400 when rating is missing', async () => {
        const token = generateAccessToken(1);
        const res = await request(app)
            .post('/ai-feedback')
            .set('Authorization', `Bearer ${token}`)
            .send({ queryText: 'hello' });
        expect(res.status).toBe(400);
    });

    it('returns 400 when rating is not up or down', async () => {
        const token = generateAccessToken(1);
        const res = await request(app)
            .post('/ai-feedback')
            .set('Authorization', `Bearer ${token}`)
            .send({ queryText: 'hello', rating: 'meh' });
        expect(res.status).toBe(400);
    });

    it('returns 400 when queryText is missing', async () => {
        const token = generateAccessToken(1);
        const res = await request(app)
            .post('/ai-feedback')
            .set('Authorization', `Bearer ${token}`)
            .send({ rating: 'up' });
        expect(res.status).toBe(400);
    });

    it('creates feedback and returns 201 with correct shape', async () => {
        const token = generateAccessToken(42);
        const sources = [{ source: 'wiki', sourceId: 3 }];
        const created = {
            id: 1, userId: 42, messageId: 7, queryText: 'test query',
            rating: 'up', comment: 'great', clickedSources: JSON.stringify(sources),
        };
        AiFeedback.create.mockResolvedValue(created);

        const res = await request(app)
            .post('/ai-feedback')
            .set('Authorization', `Bearer ${token}`)
            .send({ messageId: 7, queryText: 'test query', rating: 'up', comment: 'great', clickedSources: sources });

        expect(res.status).toBe(201);
        expect(AiFeedback.create).toHaveBeenCalledWith({
            userId: 42,
            messageId: 7,
            queryText: 'test query',
            rating: 'up',
            comment: 'great',
            clickedSources: JSON.stringify(sources),
        });
        expect(res.body.rating).toBe('up');
    });

    it('stores null clickedSources when not provided', async () => {
        const token = generateAccessToken(5);
        AiFeedback.create.mockResolvedValue({ id: 2, userId: 5 });
        await request(app)
            .post('/ai-feedback')
            .set('Authorization', `Bearer ${token}`)
            .send({ queryText: 'q', rating: 'down' });
        expect(AiFeedback.create.mock.calls[0][0].clickedSources).toBeNull();
    });
});

// ── GET /ai-feedback/my ───────────────────────────────────────────────────────

describe('GET /ai-feedback/my', () => {
    it('returns 401 without auth token', async () => {
        const res = await request(app).get('/ai-feedback/my');
        expect(res.status).toBe(401);
    });

    it('returns scoped rows ordered DESC capped at 50', async () => {
        const token = generateAccessToken(42);
        const rows = [{ id: 10, userId: 42, rating: 'up' }, { id: 9, userId: 42, rating: 'down' }];
        AiFeedback.findAll.mockResolvedValue(rows);

        const res = await request(app)
            .get('/ai-feedback/my')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(2);
        const opts = AiFeedback.findAll.mock.calls[0][0];
        expect(opts.where).toEqual({ userId: 42 });
        expect(opts.order).toEqual([['createdAt', 'DESC']]);
        expect(opts.limit).toBe(50);
    });
});

// ── GET /ai-feedback/stats/mine ───────────────────────────────────────────────

describe('GET /ai-feedback/stats/mine', () => {
    it('returns 401 without auth token', async () => {
        const res = await request(app).get('/ai-feedback/stats/mine');
        expect(res.status).toBe(401);
    });

    it('calculates upRate correctly: 3 up + 1 down = 0.75', async () => {
        const token = generateAccessToken(42);
        AiFeedback.findAll.mockResolvedValue([
            { rating: 'up' }, { rating: 'up' }, { rating: 'up' }, { rating: 'down' },
        ]);
        const res = await request(app)
            .get('/ai-feedback/stats/mine')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.total).toBe(4);
        expect(res.body.upCount).toBe(3);
        expect(res.body.downCount).toBe(1);
        expect(res.body.upRate).toBe(0.75);
    });

    it('returns upRate 0 when there are no rows', async () => {
        const token = generateAccessToken(42);
        AiFeedback.findAll.mockResolvedValue([]);
        const res = await request(app)
            .get('/ai-feedback/stats/mine')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.upRate).toBe(0);
        expect(res.body.total).toBe(0);
    });
});
