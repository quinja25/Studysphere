'use strict';
process.env.JWT_SECRET = 'test-secret-key';
process.env.NODE_ENV = 'test';
process.env.DB_HOST = 'localhost';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = 'test';
process.env.DB_NAME = 'test_studysphere';

const request = require('supertest');
const express = require('express');
const { generateAccessToken } = require('../helpers/authHelpers');

jest.mock('../../models', () => ({
    Users: {
        findByPk: jest.fn(),
        findAll: jest.fn(),
        update: jest.fn(),
    },
    StudySessions: {
        findAndCountAll: jest.fn(),
    },
}));

const { Users, StudySessions } = require('../../models');
const router = require('../../routes/Streaks');
const app = express();
app.use(express.json());
app.use('/streaks', router);

describe('Streaks API', () => {
    beforeEach(() => jest.clearAllMocks());

    describe('GET /streaks/me', () => {
        it('returns 401 when no auth token', async () => {
            const res = await request(app).get('/streaks/me');
            expect(res.status).toBe(401);
        });

        it('returns 404 when user not found', async () => {
            const token = generateAccessToken(1);
            Users.findByPk.mockResolvedValue(null);

            const res = await request(app)
                .get('/streaks/me')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(404);
        });

        it('returns streak data for authenticated user', async () => {
            const token = generateAccessToken(42);
            const streakData = {
                id: 42,
                currentStreak: 7,
                longestStreak: 14,
                lastStudyDate: '2026-04-09',
                weeklyGoalMinutes: 120,
                weeklyStudiedMinutes: 60,
                totalStudyMinutes: 1440,
                totalSessions: 20,
            };
            Users.findByPk.mockResolvedValue(streakData);

            const res = await request(app)
                .get('/streaks/me')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.currentStreak).toBe(7);
            expect(res.body.longestStreak).toBe(14);
            expect(Users.findByPk).toHaveBeenCalledWith(42, expect.any(Object));
        });
    });

    describe('GET /streaks/leaderboard', () => {
        it('returns top 20 users sorted by current streak', async () => {
            const leaders = [
                { id: 1, name: 'Alice', currentStreak: 30, level: 5 },
                { id: 2, name: 'Bob', currentStreak: 25, level: 4 },
            ];
            Users.findAll.mockResolvedValue(leaders);

            const res = await request(app).get('/streaks/leaderboard');

            expect(res.status).toBe(200);
            expect(res.body).toHaveLength(2);
            expect(Users.findAll).toHaveBeenCalledWith(expect.objectContaining({
                where: { isPublic: true },
                order: [['currentStreak', 'DESC']],
                limit: 20,
            }));
        });

        it('returns empty array when no public users', async () => {
            Users.findAll.mockResolvedValue([]);
            const res = await request(app).get('/streaks/leaderboard');
            expect(res.status).toBe(200);
            expect(res.body).toEqual([]);
        });
    });

    describe('GET /streaks/:userId', () => {
        it('returns streak data for any user', async () => {
            const streakData = {
                id: 5,
                currentStreak: 3,
                longestStreak: 10,
                lastStudyDate: '2026-04-08',
                weeklyGoalMinutes: 60,
                weeklyStudiedMinutes: 30,
                totalStudyMinutes: 300,
                totalSessions: 5,
            };
            Users.findByPk.mockResolvedValue(streakData);

            const res = await request(app).get('/streaks/5');

            expect(res.status).toBe(200);
            expect(res.body.currentStreak).toBe(3);
        });

        it('returns 404 when user not found', async () => {
            Users.findByPk.mockResolvedValue(null);

            const res = await request(app).get('/streaks/999');

            expect(res.status).toBe(404);
            expect(res.body).toHaveProperty('error');
        });
    });

    describe('PUT /streaks/goal', () => {
        it('returns 401 when no auth token', async () => {
            const res = await request(app).put('/streaks/goal').send({ weeklyGoalMinutes: 120 });
            expect(res.status).toBe(401);
        });

        it('updates weekly goal and returns new value', async () => {
            const token = generateAccessToken(1);
            Users.update.mockResolvedValue([1]);

            const res = await request(app)
                .put('/streaks/goal')
                .set('Authorization', `Bearer ${token}`)
                .send({ weeklyGoalMinutes: 180 });

            expect(res.status).toBe(200);
            expect(res.body.weeklyGoalMinutes).toBe(180);
            expect(Users.update).toHaveBeenCalledWith(
                { weeklyGoalMinutes: 180 },
                { where: { id: 1 } }
            );
        });
    });
});
