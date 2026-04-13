'use strict';
process.env.JWT_SECRET = 'test-secret-key';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const express = require('express');
const { generateAccessToken } = require('../helpers/authHelpers');

jest.mock('../../models', () => ({
    SessionGoals: {
        create: jest.fn(),
        findAll: jest.fn(),
        findByPk: jest.fn(),
    },
}));

const { SessionGoals } = require('../../models');
const router = require('../../routes/SessionGoals');

const app = express();
app.use(express.json());
app.use('/session-goals', router);

const mockGoal = {
    id: 1,
    userId: 42,
    groupId: 1,
    goal: 'Finish Chapter 5 problems',
    isCompleted: false,
    carriedForward: false,
};

beforeEach(() => {
    jest.clearAllMocks();
});

// ── POST /session-goals ───────────────────────────────────────────────────────

describe('POST /session-goals', () => {
    it('returns 401 without auth token', async () => {
        const res = await request(app).post('/session-goals').send({ userId: 42, groupId: 1, goal: 'Study' });
        expect(res.status).toBe(401);
    });

    it('returns 400 when userId is missing', async () => {
        const token = generateAccessToken(42);
        const res = await request(app)
            .post('/session-goals')
            .set('Authorization', `Bearer ${token}`)
            .send({ groupId: 1, goal: 'Study hard' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/userId/i);
    });

    it('returns 400 when groupId is missing', async () => {
        const token = generateAccessToken(42);
        const res = await request(app)
            .post('/session-goals')
            .set('Authorization', `Bearer ${token}`)
            .send({ userId: 42, goal: 'Study hard' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/groupId/i);
    });

    it('returns 400 when goal text is missing', async () => {
        const token = generateAccessToken(42);
        const res = await request(app)
            .post('/session-goals')
            .set('Authorization', `Bearer ${token}`)
            .send({ userId: 42, groupId: 1 });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/goal/i);
    });

    it('creates a goal and returns it (200)', async () => {
        const token = generateAccessToken(42);
        SessionGoals.create.mockResolvedValue(mockGoal);
        const res = await request(app)
            .post('/session-goals')
            .set('Authorization', `Bearer ${token}`)
            .send({ userId: 42, groupId: 1, goal: 'Finish Chapter 5 problems' });
        expect(res.status).toBe(200);
        expect(res.body.goal).toBe('Finish Chapter 5 problems');
        expect(SessionGoals.create).toHaveBeenCalledWith({
            userId: 42,
            groupId: 1,
            goal: 'Finish Chapter 5 problems',
        });
    });
});

// ── GET /session-goals/byGroup/:groupId ──────────────────────────────────────

describe('GET /session-goals/byGroup/:groupId', () => {
    it('returns 401 without auth token', async () => {
        const res = await request(app).get('/session-goals/byGroup/1');
        expect(res.status).toBe(401);
    });

    it('returns goals scoped to current user and group (200)', async () => {
        const token = generateAccessToken(42);
        SessionGoals.findAll.mockResolvedValue([mockGoal]);
        const res = await request(app)
            .get('/session-goals/byGroup/1')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body).toHaveLength(1);
        expect(SessionGoals.findAll).toHaveBeenCalledWith({
            where: { groupId: '1', userId: 42 },
        });
    });

    it('returns empty array when no goals exist for the group', async () => {
        const token = generateAccessToken(42);
        SessionGoals.findAll.mockResolvedValue([]);
        const res = await request(app)
            .get('/session-goals/byGroup/99')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });
});

// ── PUT /session-goals/:id ────────────────────────────────────────────────────

describe('PUT /session-goals/:id', () => {
    it('returns 401 without auth token', async () => {
        const res = await request(app).put('/session-goals/1').send({ isCompleted: true });
        expect(res.status).toBe(401);
    });

    it('returns 404 when goal not found', async () => {
        const token = generateAccessToken(42);
        SessionGoals.findByPk.mockResolvedValue(null);
        const res = await request(app)
            .put('/session-goals/999')
            .set('Authorization', `Bearer ${token}`)
            .send({ isCompleted: true });
        expect(res.status).toBe(404);
        expect(res.body.error).toMatch(/goal/i);
    });

    it('marks goal as completed (200)', async () => {
        const token = generateAccessToken(42);
        const goal = {
            ...mockGoal,
            update: jest.fn().mockImplementation(async (updates) => {
                Object.assign(goal, updates);
                return goal;
            }),
        };
        SessionGoals.findByPk.mockResolvedValue(goal);
        const res = await request(app)
            .put('/session-goals/1')
            .set('Authorization', `Bearer ${token}`)
            .send({ isCompleted: true });
        expect(res.status).toBe(200);
        expect(goal.update).toHaveBeenCalledWith(expect.objectContaining({ isCompleted: true }));
    });

    it('marks goal as carried forward (200)', async () => {
        const token = generateAccessToken(42);
        const goal = {
            ...mockGoal,
            update: jest.fn().mockImplementation(async (updates) => {
                Object.assign(goal, updates);
                return goal;
            }),
        };
        SessionGoals.findByPk.mockResolvedValue(goal);
        const res = await request(app)
            .put('/session-goals/1')
            .set('Authorization', `Bearer ${token}`)
            .send({ carriedForward: true });
        expect(res.status).toBe(200);
        expect(goal.update).toHaveBeenCalledWith(expect.objectContaining({ carriedForward: true }));
    });

    it('updates goal text (200)', async () => {
        const token = generateAccessToken(42);
        const goal = {
            ...mockGoal,
            update: jest.fn().mockImplementation(async (updates) => {
                Object.assign(goal, updates);
                return goal;
            }),
        };
        SessionGoals.findByPk.mockResolvedValue(goal);
        const res = await request(app)
            .put('/session-goals/1')
            .set('Authorization', `Bearer ${token}`)
            .send({ goal: 'Updated goal text' });
        expect(res.status).toBe(200);
        expect(goal.update).toHaveBeenCalledWith(expect.objectContaining({ goal: 'Updated goal text' }));
    });

    it('ignores undefined fields (only updates provided fields)', async () => {
        const token = generateAccessToken(42);
        const goal = {
            ...mockGoal,
            update: jest.fn().mockResolvedValue(mockGoal),
        };
        SessionGoals.findByPk.mockResolvedValue(goal);
        await request(app)
            .put('/session-goals/1')
            .set('Authorization', `Bearer ${token}`)
            .send({ isCompleted: true }); // carriedForward not provided

        const updateArg = goal.update.mock.calls[0][0];
        expect(updateArg).toHaveProperty('isCompleted', true);
        expect(updateArg).not.toHaveProperty('carriedForward');
    });
});
