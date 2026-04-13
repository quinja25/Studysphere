'use strict';
process.env.JWT_SECRET = 'test-secret-key';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const express = require('express');
const { generateAccessToken } = require('../helpers/authHelpers');

jest.mock('../../services/openai', () => ({
    chatCompletion: jest.fn().mockResolvedValue({
        content: JSON.stringify({
            summary: 'Covered integration by parts.',
            topicsCovered: ['Integration by Parts', 'Chain Rule'],
            actionItems: ['Review Chapter 5'],
        }),
        tokens: 80,
    }),
}));

jest.mock('../../models', () => {
    const mockRecaps = {
        create: jest.fn(),
        findAndCountAll: jest.fn(),
        findByPk: jest.fn(),
    };
    const mockGroups = { findByPk: jest.fn() };
    const mockChats = { findAll: jest.fn().mockResolvedValue([]) };
    const mockUsers = { findByPk: jest.fn() };
    const { Op } = require('sequelize');
    return {
        SessionRecaps: mockRecaps,
        Groups: mockGroups,
        Chats: mockChats,
        Users: mockUsers,
        Op,
    };
});

const db = require('../../models');
const router = require('../../routes/Recaps');

const app = express();
app.use(express.json());
app.use('/recaps', router);

const mockGroup = { id: 1, groupName: 'Math Room', subject: 'Mathematics', major: 'Science', gradeLevel: 'IB HL' };
const mockRecap = {
    id: 1,
    groupId: 1,
    generatedBy: 42,
    summary: 'Covered integration by parts.',
    topicsCovered: ['Integration by Parts'],
    linksShared: [],
    actionItems: ['Review Chapter 5'],
    participantIds: [42],
    durationMinutes: 60,
};

beforeEach(() => {
    jest.clearAllMocks();
    db.Groups.findByPk.mockResolvedValue(mockGroup);
    db.SessionRecaps.create.mockResolvedValue(mockRecap);
});

// ── POST /recaps/generate ────────────────────────────────────────────────────

describe('POST /recaps/generate', () => {
    it('returns 401 without auth token', async () => {
        const res = await request(app).post('/recaps/generate').send({ groupId: 1 });
        expect(res.status).toBe(401);
    });

    it('returns 400 when groupId is missing', async () => {
        const token = generateAccessToken(42);
        const res = await request(app)
            .post('/recaps/generate')
            .set('Authorization', `Bearer ${token}`)
            .send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/groupId/i);
    });

    it('returns 404 when group not found', async () => {
        const token = generateAccessToken(42);
        db.Groups.findByPk.mockResolvedValue(null);
        const res = await request(app)
            .post('/recaps/generate')
            .set('Authorization', `Bearer ${token}`)
            .send({ groupId: 999 });
        expect(res.status).toBe(404);
        expect(res.body.error).toMatch(/group/i);
    });

    it('generates a recap with AI summary (201)', async () => {
        const token = generateAccessToken(42);
        const res = await request(app)
            .post('/recaps/generate')
            .set('Authorization', `Bearer ${token}`)
            .send({
                groupId: 1,
                durationMinutes: 60,
                participantIds: [42, 43],
                startedAt: new Date(Date.now() - 3600000).toISOString(),
                endedAt: new Date().toISOString(),
            });
        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('recap');
        expect(res.body).toHaveProperty('group');
        expect(db.SessionRecaps.create).toHaveBeenCalled();
    });

    it('extracts unique URLs from chat messages into linksShared', async () => {
        const token = generateAccessToken(42);
        db.Chats.findAll.mockResolvedValue([
            { message: 'Check this out: https://example.com/resource' },
            { message: 'Also see https://example.com/resource and https://docs.google.com' },
        ]);
        await request(app)
            .post('/recaps/generate')
            .set('Authorization', `Bearer ${token}`)
            .send({ groupId: 1, durationMinutes: 30 });

        const createCall = db.SessionRecaps.create.mock.calls[0][0];
        expect(createCall.linksShared).toContain('https://example.com/resource');
        expect(createCall.linksShared).toContain('https://docs.google.com');
        // Duplicates are deduplicated
        expect(createCall.linksShared.filter(l => l === 'https://example.com/resource')).toHaveLength(1);
    });

    it('falls back gracefully when AI returns invalid JSON', async () => {
        const token = generateAccessToken(42);
        const { chatCompletion } = require('../../services/openai');
        chatCompletion.mockResolvedValueOnce({ content: 'not json', tokens: 10 });

        const res = await request(app)
            .post('/recaps/generate')
            .set('Authorization', `Bearer ${token}`)
            .send({ groupId: 1, durationMinutes: 10 });

        expect(res.status).toBe(201);
        // Should still create a recap with a fallback summary
        expect(db.SessionRecaps.create).toHaveBeenCalled();
    });

    it('stores all participant IDs from the request', async () => {
        const token = generateAccessToken(42);
        await request(app)
            .post('/recaps/generate')
            .set('Authorization', `Bearer ${token}`)
            .send({ groupId: 1, durationMinutes: 45, participantIds: [42, 55, 99] });

        const createCall = db.SessionRecaps.create.mock.calls[0][0];
        expect(createCall.participantIds).toEqual(expect.arrayContaining([42, 55, 99]));
    });
});

// ── GET /recaps/byUser/:userId ────────────────────────────────────────────────

describe('GET /recaps/byUser/:userId', () => {
    it('returns 401 without auth token', async () => {
        const res = await request(app).get('/recaps/byUser/42');
        expect(res.status).toBe(401);
    });

    it('returns paginated recaps for a user (200)', async () => {
        const token = generateAccessToken(42);
        db.SessionRecaps.findAndCountAll.mockResolvedValue({
            rows: [mockRecap],
            count: 1,
        });
        const res = await request(app)
            .get('/recaps/byUser/42')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('data');
        expect(res.body).toHaveProperty('total', 1);
        expect(res.body).toHaveProperty('page', 1);
        expect(res.body).toHaveProperty('totalPages', 1);
        expect(res.body).toHaveProperty('hasMore', false);
    });

    it('supports ?page= and ?limit= query params', async () => {
        const token = generateAccessToken(42);
        db.SessionRecaps.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });
        const res = await request(app)
            .get('/recaps/byUser/42?page=2&limit=5')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.page).toBe(2);
        expect(db.SessionRecaps.findAndCountAll).toHaveBeenCalledWith(
            expect.objectContaining({ limit: 5, offset: 5 })
        );
    });

    it('returns empty data array when user has no recaps', async () => {
        const token = generateAccessToken(42);
        db.SessionRecaps.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });
        const res = await request(app)
            .get('/recaps/byUser/42')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual([]);
        expect(res.body.total).toBe(0);
    });
});

// ── GET /recaps/:id ───────────────────────────────────────────────────────────

describe('GET /recaps/:id', () => {
    it('returns 401 without auth token', async () => {
        const res = await request(app).get('/recaps/1');
        expect(res.status).toBe(401);
    });

    it('returns 404 when recap not found', async () => {
        const token = generateAccessToken(42);
        db.SessionRecaps.findByPk.mockResolvedValue(null);
        const res = await request(app)
            .get('/recaps/999')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(404);
        expect(res.body.error).toMatch(/recap/i);
    });

    it('returns a single recap with group and user info (200)', async () => {
        const token = generateAccessToken(42);
        db.SessionRecaps.findByPk.mockResolvedValue({
            ...mockRecap,
            group: mockGroup,
            generatedByUser: { id: 42, name: 'Alice' },
        });
        const res = await request(app)
            .get('/recaps/1')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('summary');
    });
});
