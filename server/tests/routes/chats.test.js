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
    author: 'Alice',
    GroupId: 1,
    save: jest.fn().mockResolvedValue(undefined),
    toJSON: jest.fn().mockReturnValue({ id: 1, message: 'Hello', author: 'Alice', GroupId: 1, isPinned: false }),
    destroy: jest.fn().mockResolvedValue(undefined),
};

jest.mock('../../models', () => ({
    Chats: {
        findAll: jest.fn(),
        findByPk: jest.fn(),
        create: jest.fn(),
        destroy: jest.fn(),
    },
    Groups: {
        findByPk: jest.fn(),
    },
    Groups_Users: {
        findOne: jest.fn(),
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
const db = require('../../models');
const router = require('../../routes/Chats');
const app = express();
app.use(express.json());
app.use('/chats', router);

describe('Chats API', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockChatInstance.isPinned = false;
        mockChatInstance.author = 'Alice';
        mockChatInstance.GroupId = 1;
        mockChatInstance.save.mockResolvedValue(undefined);
        mockChatInstance.destroy.mockResolvedValue(undefined);
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
            const res = await request(app).post('/chats/').send({ message: 'Hello', GroupId: 1 });
            expect(res.status).toBe(401);
        });

        it('creates chat message and returns 200', async () => {
            const token = generateAccessToken(1, { name: 'Alice' });
            const newChat = { id: 1, message: 'Hello', author: 'Alice', GroupId: 1 };
            Chats.create.mockResolvedValue(newChat);

            const res = await request(app)
                .post('/chats/')
                .set('Authorization', `Bearer ${token}`)
                .send({ message: 'Hello', GroupId: 1 });

            expect(res.status).toBe(200);
            expect(res.body.message).toBe('Hello');
            expect(Chats.create).toHaveBeenCalledWith({ message: 'Hello', author: 'Alice', GroupId: 1 });
        });

        it('returns 500 on DB error', async () => {
            const token = generateAccessToken(1, { name: 'Alice' });
            Chats.create.mockRejectedValue(new Error('DB error'));

            const res = await request(app)
                .post('/chats/')
                .set('Authorization', `Bearer ${token}`)
                .send({ message: 'Hello', GroupId: 1 });

            expect(res.status).toBe(500);
        });
    });

    describe('PUT /chats/pin/:id', () => {
        it('returns 401 when no auth token', async () => {
            const res = await request(app).put('/chats/pin/1');
            expect(res.status).toBe(401);
        });

        it('returns 404 when chat not found', async () => {
            const token = generateAccessToken(1, { name: 'Alice' });
            Chats.findByPk.mockResolvedValue(null);

            const res = await request(app)
                .put('/chats/pin/999')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(404);
        });

        it('toggles isPinned from false to true', async () => {
            const token = generateAccessToken(1, { name: 'Alice' });
            mockChatInstance.isPinned = false;
            mockChatInstance.toJSON.mockReturnValue({ id: 1, isPinned: true });
            Chats.findByPk.mockResolvedValue(mockChatInstance);
            db.Groups.findByPk.mockResolvedValue({ id: 1, leader: 'SomeOtherUser' });
            db.Groups_Users.findOne.mockResolvedValue({ UserId: 1, GroupId: 1 }); // user is member

            const res = await request(app)
                .put('/chats/pin/1')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(mockChatInstance.save).toHaveBeenCalled();
            expect(res.body.isPinned).toBe(true);
        });

        it('toggles isPinned from true to false', async () => {
            const token = generateAccessToken(1, { name: 'Alice' });
            mockChatInstance.isPinned = true;
            mockChatInstance.toJSON.mockReturnValue({ id: 1, isPinned: false });
            Chats.findByPk.mockResolvedValue(mockChatInstance);
            db.Groups.findByPk.mockResolvedValue({ id: 1, leader: 'SomeOtherUser' });
            db.Groups_Users.findOne.mockResolvedValue({ UserId: 1, GroupId: 1 }); // user is member

            const res = await request(app)
                .put('/chats/pin/1')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.isPinned).toBe(false);
        });

        it('returns 403 when user is not member or leader', async () => {
            const token = generateAccessToken(1, { name: 'Alice' });
            Chats.findByPk.mockResolvedValue(mockChatInstance);
            db.Groups.findByPk.mockResolvedValue({ id: 1, leader: 'SomeOtherUser' });
            db.Groups_Users.findOne.mockResolvedValue(null); // not a member

            const res = await request(app)
                .put('/chats/pin/1')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(403);
        });
    });

    describe('DELETE /chats/:id', () => {
        it('returns 401 when no auth token', async () => {
            const res = await request(app).delete('/chats/1');
            expect(res.status).toBe(401);
        });

        it('deletes chat message and returns success message', async () => {
            const token = generateAccessToken(1, { name: 'Alice' });
            mockChatInstance.author = 'Alice';
            Chats.findByPk.mockResolvedValue(mockChatInstance);

            const res = await request(app)
                .delete('/chats/1')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.message).toMatch(/deleted/i);
            expect(mockChatInstance.destroy).toHaveBeenCalled();
        });

        it('returns 403 when user is not the author', async () => {
            const token = generateAccessToken(1, { name: 'Bob' });
            mockChatInstance.author = 'Alice'; // different author
            Chats.findByPk.mockResolvedValue(mockChatInstance);

            const res = await request(app)
                .delete('/chats/1')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(403);
        });

        it('returns 404 when chat not found', async () => {
            const token = generateAccessToken(1, { name: 'Alice' });
            Chats.findByPk.mockResolvedValue(null);

            const res = await request(app)
                .delete('/chats/999')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(404);
        });
    });
});
