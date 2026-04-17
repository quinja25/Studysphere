'use strict';
process.env.JWT_SECRET = 'test-secret-key';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const express = require('express');
const { generateAccessToken } = require('../helpers/authHelpers');

jest.mock('../../models', () => ({
    Notifications: {
        findAndCountAll: jest.fn(),
        findOne: jest.fn(),
        findByPk: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
    },
}));

const { Notifications } = require('../../models');
const router = require('../../routes/Notifications');

const app = express();
app.use(express.json());
app.use('/notifications', router);

const sampleNotif = (overrides = {}) => ({
    id: 1,
    userId: 42,
    type: 'answer',
    relatedType: 'question',
    relatedId: 7,
    content: 'Someone answered your question',
    link: '/qa?question=7',
    isRead: false,
    update: jest.fn().mockResolvedValue(undefined),
    destroy: jest.fn().mockResolvedValue(undefined),
    ...overrides,
});

beforeEach(() => {
    jest.clearAllMocks();
});

// ── GET /notifications ────────────────────────────────────────────────────────

describe('GET /notifications', () => {
    it('returns 401 without auth token', async () => {
        const res = await request(app).get('/notifications');
        expect(res.status).toBe(401);
    });

    it('returns scoped list + unread count for the authenticated user', async () => {
        const token = generateAccessToken(42);
        Notifications.findAndCountAll.mockResolvedValue({
            rows: [sampleNotif(), sampleNotif({ id: 2, isRead: true })],
            count: 2,
        });
        Notifications.count.mockResolvedValue(1);

        const res = await request(app)
            .get('/notifications')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.notifications).toHaveLength(2);
        expect(res.body.total).toBe(2);
        expect(res.body.unreadCount).toBe(1);
        expect(Notifications.findAndCountAll.mock.calls[0][0].where).toEqual({ userId: 42 });
    });

    it('applies pagination query params', async () => {
        const token = generateAccessToken(42);
        Notifications.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });
        Notifications.count.mockResolvedValue(0);

        await request(app)
            .get('/notifications?page=3&limit=10')
            .set('Authorization', `Bearer ${token}`);

        const opts = Notifications.findAndCountAll.mock.calls[0][0];
        expect(opts.limit).toBe(10);
        expect(opts.offset).toBe(20);
    });

    it('caps limit at 50', async () => {
        const token = generateAccessToken(42);
        Notifications.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });
        Notifications.count.mockResolvedValue(0);

        await request(app)
            .get('/notifications?limit=9999')
            .set('Authorization', `Bearer ${token}`);

        expect(Notifications.findAndCountAll.mock.calls[0][0].limit).toBe(50);
    });
});

// ── GET /notifications/unread-count ───────────────────────────────────────────

describe('GET /notifications/unread-count', () => {
    it('returns 401 without auth token', async () => {
        const res = await request(app).get('/notifications/unread-count');
        expect(res.status).toBe(401);
    });

    it('returns the unread count for the current user', async () => {
        const token = generateAccessToken(42);
        Notifications.count.mockResolvedValue(7);
        const res = await request(app)
            .get('/notifications/unread-count')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.unreadCount).toBe(7);
        expect(Notifications.count.mock.calls[0][0].where).toEqual({ userId: 42, isRead: false });
    });
});

// ── PUT /notifications/:id/read ───────────────────────────────────────────────

describe('PUT /notifications/:id/read', () => {
    it('returns 401 without auth token', async () => {
        const res = await request(app).put('/notifications/1/read');
        expect(res.status).toBe(401);
    });

    it('returns 404 when the notification does not belong to the user', async () => {
        const token = generateAccessToken(42);
        Notifications.findOne.mockResolvedValue(null);
        const res = await request(app)
            .put('/notifications/1/read')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(404);
    });

    it('marks the notification as read', async () => {
        const token = generateAccessToken(42);
        const notif = sampleNotif();
        Notifications.findOne.mockResolvedValue(notif);
        const res = await request(app)
            .put('/notifications/1/read')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(notif.update).toHaveBeenCalledWith({ isRead: true });
    });

    it('does not re-update an already-read notification', async () => {
        const token = generateAccessToken(42);
        const notif = sampleNotif({ isRead: true });
        Notifications.findOne.mockResolvedValue(notif);
        await request(app)
            .put('/notifications/1/read')
            .set('Authorization', `Bearer ${token}`);
        expect(notif.update).not.toHaveBeenCalled();
    });
});

// ── PUT /notifications/read-all ───────────────────────────────────────────────

describe('PUT /notifications/read-all', () => {
    it('returns 401 without auth token', async () => {
        const res = await request(app).put('/notifications/read-all');
        expect(res.status).toBe(401);
    });

    it('bulk-marks all unread notifications as read', async () => {
        const token = generateAccessToken(42);
        Notifications.update.mockResolvedValue([4]);
        const res = await request(app)
            .put('/notifications/read-all')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.updated).toBe(4);
        expect(Notifications.update).toHaveBeenCalledWith(
            { isRead: true },
            { where: { userId: 42, isRead: false } },
        );
    });
});

// ── DELETE /notifications/:id ─────────────────────────────────────────────────

describe('DELETE /notifications/:id', () => {
    it('returns 401 without auth token', async () => {
        const res = await request(app).delete('/notifications/1');
        expect(res.status).toBe(401);
    });

    it('returns 404 when the notification is not found or owned by someone else', async () => {
        const token = generateAccessToken(42);
        Notifications.findOne.mockResolvedValue(null);
        const res = await request(app)
            .delete('/notifications/1')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(404);
    });

    it('removes a notification the user owns', async () => {
        const token = generateAccessToken(42);
        const notif = sampleNotif();
        Notifications.findOne.mockResolvedValue(notif);
        const res = await request(app)
            .delete('/notifications/1')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(notif.destroy).toHaveBeenCalled();
    });
});
