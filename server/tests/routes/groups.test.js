'use strict';
process.env.JWT_SECRET = 'test-secret-key';
process.env.NODE_ENV = 'test';
process.env.DB_HOST = 'localhost';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = 'test';
process.env.DB_NAME = 'test_studysphere';

const request = require('supertest');
const express = require('express');
const bcrypt = require('bcrypt');
const { generateAccessToken } = require('../helpers/authHelpers');

const mockGroupInstance = {
    toJSON: jest.fn(),
    destroy: jest.fn().mockResolvedValue(undefined),
    groupName: 'Test Room',
    leader: 'Alice',
    password: null,
};

jest.mock('../../models', () => ({
    Groups: {
        findAll: jest.fn(),
        findOne: jest.fn(),
        findByPk: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        destroy: jest.fn(),
    },
    Users: {
        findByPk: jest.fn(),
        findAll: jest.fn(),
        update: jest.fn(),
    },
}));

const { Groups, Users } = require('../../models');
const router = require('../../routes/Groups');
const app = express();
app.use(express.json());
app.use('/groups', router);

describe('Groups API', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockGroupInstance.toJSON.mockReturnValue({ id: 1, groupName: 'Test Room', leader: 'Alice', password: null });
        mockGroupInstance.destroy.mockResolvedValue(undefined);
        mockGroupInstance.groupName = 'Test Room';
        mockGroupInstance.leader = 'Alice';
        mockGroupInstance.password = null;
    });

    describe('GET /groups/', () => {
        it('returns list of groups with hasPassword set and password scrubbed', async () => {
            const groupWithPw = {
                toJSON: () => ({ id: 2, groupName: 'Private Room', leader: 'Bob', password: 'hashedpw' }),
            };
            Groups.findAll.mockResolvedValue([mockGroupInstance, groupWithPw]);

            const res = await request(app).get('/groups/');

            expect(res.status).toBe(200);
            expect(res.body).toHaveLength(2);
            expect(res.body[0]).not.toHaveProperty('password');
            expect(res.body[0].hasPassword).toBe(false);
            expect(res.body[1].hasPassword).toBe(true);
            expect(res.body[1]).not.toHaveProperty('password');
        });

        it('returns 500 on DB error', async () => {
            Groups.findAll.mockRejectedValue(new Error('DB error'));
            const res = await request(app).get('/groups/');
            expect(res.status).toBe(500);
        });
    });

    describe('GET /groups/byID/:id', () => {
        it('returns 200 and safe group when found', async () => {
            Groups.findByPk.mockResolvedValue(mockGroupInstance);
            const res = await request(app).get('/groups/byID/1');
            expect(res.status).toBe(200);
            expect(res.body).not.toHaveProperty('password');
            expect(res.body).toHaveProperty('hasPassword');
        });

        it('returns 404 when group not found', async () => {
            Groups.findByPk.mockResolvedValue(null);
            const res = await request(app).get('/groups/byID/999');
            expect(res.status).toBe(404);
            expect(res.body).toHaveProperty('error');
        });
    });

    describe('POST /groups/', () => {
        it('returns 401 when no auth token', async () => {
            const res = await request(app).post('/groups/').send({ groupName: 'New Room' });
            expect(res.status).toBe(401);
        });

        it('creates group without password (201)', async () => {
            const token = generateAccessToken(1);
            Groups.create.mockResolvedValue(mockGroupInstance);

            const res = await request(app)
                .post('/groups/')
                .set('Authorization', `Bearer ${token}`)
                .send({ groupName: 'New Room', leader: 'Alice' });

            expect(res.status).toBe(200);
            expect(Groups.create).toHaveBeenCalled();
            expect(res.body).not.toHaveProperty('password');
        });

        it('hashes the password before saving when password provided', async () => {
            const token = generateAccessToken(1);
            let capturedData;
            Groups.create.mockImplementation((data) => {
                capturedData = data;
                return Promise.resolve({
                    toJSON: () => ({ id: 3, groupName: 'Private', leader: 'Alice', password: data.password }),
                });
            });

            await request(app)
                .post('/groups/')
                .set('Authorization', `Bearer ${token}`)
                .send({ groupName: 'Private', leader: 'Alice', password: 'secret123' });

            expect(capturedData.password).not.toBe('secret123');
            const match = await bcrypt.compare('secret123', capturedData.password);
            expect(match).toBe(true);
        });
    });

    describe('POST /groups/:id/verify-password', () => {
        it('returns 404 when group not found', async () => {
            Groups.findByPk.mockResolvedValue(null);
            const res = await request(app).post('/groups/999/verify-password').send({ password: 'wrong' });
            expect(res.status).toBe(404);
        });

        it('returns ok:true when group has no password', async () => {
            Groups.findByPk.mockResolvedValue({ ...mockGroupInstance, password: null });
            const res = await request(app).post('/groups/1/verify-password').send({});
            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
        });

        it('returns ok:true when password is correct', async () => {
            const hashed = await bcrypt.hash('correct', 10);
            Groups.findByPk.mockResolvedValue({ ...mockGroupInstance, password: hashed });
            const res = await request(app).post('/groups/1/verify-password').send({ password: 'correct' });
            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
        });

        it('returns 401 when password is wrong', async () => {
            const hashed = await bcrypt.hash('correct', 10);
            Groups.findByPk.mockResolvedValue({ ...mockGroupInstance, password: hashed });
            const res = await request(app).post('/groups/1/verify-password').send({ password: 'wrong' });
            expect(res.status).toBe(401);
        });
    });

    describe('DELETE /groups/:id', () => {
        it('returns 401 when no auth token', async () => {
            const res = await request(app).delete('/groups/1');
            expect(res.status).toBe(401);
        });

        it('returns 404 when group not found', async () => {
            const token = generateAccessToken(1);
            Groups.findByPk.mockResolvedValue(null);
            const res = await request(app)
                .delete('/groups/999')
                .set('Authorization', `Bearer ${token}`);
            expect(res.status).toBe(404);
        });

        it('returns 403 when user is not the group leader', async () => {
            const token = generateAccessToken(1);
            Groups.findByPk.mockResolvedValue(mockGroupInstance); // leader: 'Alice'
            Users.findByPk.mockResolvedValue({ name: 'Bob' }); // different user

            const res = await request(app)
                .delete('/groups/1')
                .set('Authorization', `Bearer ${token}`);
            expect(res.status).toBe(403);
        });

        it('returns 200 when user is the group leader', async () => {
            const token = generateAccessToken(1);
            Groups.findByPk.mockResolvedValue(mockGroupInstance); // leader: 'Alice'
            Users.findByPk.mockResolvedValue({ name: 'Alice' });

            const res = await request(app)
                .delete('/groups/1')
                .set('Authorization', `Bearer ${token}`);
            expect(res.status).toBe(200);
            expect(mockGroupInstance.destroy).toHaveBeenCalled();
        });

        it('skips ownership check for DM groups', async () => {
            const token = generateAccessToken(1);
            const dmGroup = {
                ...mockGroupInstance,
                groupName: '__dm_1_2',
                leader: 'Alice',
                destroy: jest.fn().mockResolvedValue(undefined),
                toJSON: jest.fn().mockReturnValue({ id: 5, groupName: '__dm_1_2', leader: 'Alice', password: null }),
            };
            Groups.findByPk.mockResolvedValue(dmGroup);

            const res = await request(app)
                .delete('/groups/5')
                .set('Authorization', `Bearer ${token}`);
            expect(res.status).toBe(200);
            expect(Users.findByPk).not.toHaveBeenCalled();
        });
    });
});
