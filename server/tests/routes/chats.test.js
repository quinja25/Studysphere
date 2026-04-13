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

const mockChatInstance = {
    isPinned: false,
    save: jest.fn().mockResolvedValue(undefined),
    toJSON: jest.fn().mockReturnValue({ id: 1, message: 'Hello', author: 'Alice', GroupId: 1, isPinned: false }),
};

jest.mock('../../models', () => ({
    Chats: {
        findAll: jest.fn(),
        findByPk: jest.fn(),
        create: jest.fn(),
        destroy: jest.fn(),
    },
}));

// Mock multer to avoid file system dependencies in tests
jest.mock('multer', () => {
    const multerMock = () => ({
        single: () => (req, res, next) => next(),
    });
    multerMock.diskStorage = () => ({});
    return multerMock;
});

const { Chats } = require('../../models');
const router = require('../../routes/Chats');
const app = express();
app.use(express.json());
app.use('/chats', router);

describe('Chats API', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockChatInstance.isPinned = false;
        mockChatInstance.save.mockResolvedValue(undefined);
        mockChatInstance.toJSON.mockReturnValue({ id: 1, message: 'Hello', author: 'Alice', GroupId: 1, isPinned: false });
    });

    describe('GET /chats/:groupId', () => {
        it('returns all messages for a group', async () => {
            const messages = [
                { id: 1, message: 'Hello', author: 'Alice', GroupId: 5 },
                { id: 2, message: 'Hi', author: 'Bob', GroupId: 5 },
            ];
            Chats.findAll.mockResolvedValue(messages);

            const res = await request(app).get('/chats/5');

            expect(res.status).toBe(200);
            expect(res.body).toHaveLength(2);
            expect(Chats.findAll).toHaveBeenCalledWith({ where: { GroupId: '5' } });
        });

        it('returns empty array when group has no messages', async () => {
            Chats.findAll.mockResolvedValue([]);
            const res = await request(app).get('/chats/99');
            expect(res.status).toBe(200);
            expect(res.body).toEqual([]);
        });
    });

    describe('POST /chats/', () => {
        it('returns 401 when no auth token', async () => {
            const res = await request(app).post('/chats/').send({ message: 'Hello', author: 'Alice', GroupId: 1 });
            expect(res.status).toBe(401);
        });

        it('creates chat message and returns 200', async () => {
            const token = generateAccessToken(1);
            const newChat = { id: 1, message: 'Hello', author: 'Alice', GroupId: 1 };
            Chats.create.mockResolvedValue(newChat);

            const res = await request(app)
                .post('/chats/')
                .set('Authorization', `Bearer ${token}`)
                .send({ message: 'Hello', author: 'Alice', GroupId: 1 });

            expect(res.status).toBe(200);
            expect(res.body.message).toBe('Hello');
            expect(Chats.create).toHaveBeenCalledWith({ message: 'Hello', author: 'Alice', GroupId: 1 });
        });

        it('returns 500 on DB error', async () => {
            const token = generateAccessToken(1);
            Chats.create.mockRejectedValue(new Error('DB error'));

            const res = await request(app)
                .post('/chats/')
                .set('Authorization', `Bearer ${token}`)
                .send({ message: 'Hello' });

            expect(res.status).toBe(500);
        });
    });

    describe('PUT /chats/pin/:id', () => {
        it('returns 401 when no auth token', async () => {
            const res = await request(app).put('/chats/pin/1');
            expect(res.status).toBe(401);
        });

        it('returns 404 when chat not found', async () => {
            const token = generateAccessToken(1);
            Chats.findByPk.mockResolvedValue(null);

            const res = await request(app)
                .put('/chats/pin/999')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(404);
        });

        it('toggles isPinned from false to true', async () => {
            const token = generateAccessToken(1);
            mockChatInstance.isPinned = false;
            mockChatInstance.toJSON.mockReturnValue({ id: 1, isPinned: true });
            Chats.findByPk.mockResolvedValue(mockChatInstance);

            const res = await request(app)
                .put('/chats/pin/1')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(mockChatInstance.save).toHaveBeenCalled();
            expect(res.body.isPinned).toBe(true);
        });

        it('toggles isPinned from true to false', async () => {
            const token = generateAccessToken(1);
            mockChatInstance.isPinned = true;
            mockChatInstance.toJSON.mockReturnValue({ id: 1, isPinned: false });
            Chats.findByPk.mockResolvedValue(mockChatInstance);

            const res = await request(app)
                .put('/chats/pin/1')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.isPinned).toBe(false);
        });
    });

    describe('DELETE /chats/:id', () => {
        it('returns 401 when no auth token', async () => {
            const res = await request(app).delete('/chats/1');
            expect(res.status).toBe(401);
        });

        it('deletes chat message and returns success message', async () => {
            const token = generateAccessToken(1);
            Chats.destroy.mockResolvedValue(1);

            const res = await request(app)
                .delete('/chats/1')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.message).toMatch(/deleted/i);
            expect(Chats.destroy).toHaveBeenCalledWith({ where: { id: '1' } });
        });
    });
});
