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
    Groups_Users: {
        create: jest.fn(),
        destroy: jest.fn(),
        findAll: jest.fn(),
    },
    Groups: {
        findAll: jest.fn(),
    },
    Users: {
        findAll: jest.fn(),
    },
}));

const db = require('../../models');
const router = require('../../routes/GroupsUsers');
const app = express();
app.use(express.json());
app.use('/groupsUsers', router);

describe('GroupsUsers API', () => {
    beforeEach(() => jest.clearAllMocks());

    describe('POST /groupsUsers/user/:userId/group/:groupId', () => {
        it('returns 401 when no auth token', async () => {
            const res = await request(app).post('/groupsUsers/user/1/group/2');
            expect(res.status).toBe(401);
        });

        it('adds user to group and returns 201', async () => {
            const token = generateAccessToken(1);
            db.Groups_Users.create.mockResolvedValue({ UserId: 1, GroupId: 2 });

            const res = await request(app)
                .post('/groupsUsers/user/1/group/2')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(201);
            expect(res.body.message).toMatch(/added/i);
            expect(db.Groups_Users.create).toHaveBeenCalledWith({ UserId: '1', GroupId: '2' });
        });

        it('returns 500 on DB error', async () => {
            const token = generateAccessToken(1);
            db.Groups_Users.create.mockRejectedValue(new Error('DB error'));

            const res = await request(app)
                .post('/groupsUsers/user/1/group/2')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(500);
        });
    });

    describe('DELETE /groupsUsers/user/:userId/group/:groupId', () => {
        it('returns 401 when no auth token', async () => {
            const res = await request(app).delete('/groupsUsers/user/1/group/2');
            expect(res.status).toBe(401);
        });

        it('removes user from group and returns 200', async () => {
            const token = generateAccessToken(1);
            db.Groups_Users.destroy.mockResolvedValue(1);

            const res = await request(app)
                .delete('/groupsUsers/user/1/group/2')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.message).toMatch(/removed/i);
            expect(db.Groups_Users.destroy).toHaveBeenCalledWith({ where: { UserId: '1', GroupId: '2' } });
        });
    });

    describe('GET /groupsUsers/byUser/:userId', () => {
        it('returns empty array when user has no groups', async () => {
            db.Groups_Users.findAll.mockResolvedValue([]);

            const res = await request(app).get('/groupsUsers/byUser/1');

            expect(res.status).toBe(200);
            expect(res.body).toEqual([]);
        });

        it('returns list of groups for user', async () => {
            db.Groups_Users.findAll.mockResolvedValue([{ GroupId: 2 }, { GroupId: 3 }]);
            db.Groups.findAll.mockResolvedValue([
                { id: 2, groupName: 'Math Study' },
                { id: 3, groupName: 'Physics Room' },
            ]);

            const res = await request(app).get('/groupsUsers/byUser/1');

            expect(res.status).toBe(200);
            expect(res.body).toHaveLength(2);
            expect(db.Groups.findAll).toHaveBeenCalledWith({ where: { id: [2, 3] } });
        });
    });

    describe('GET /groupsUsers/byGroup/:groupId', () => {
        it('returns empty array when group has no members', async () => {
            db.Groups_Users.findAll.mockResolvedValue([]);

            const res = await request(app).get('/groupsUsers/byGroup/1');

            expect(res.status).toBe(200);
            expect(res.body).toEqual([]);
        });

        it('returns list of users in group', async () => {
            db.Groups_Users.findAll.mockResolvedValue([{ UserId: 10 }, { UserId: 20 }]);
            db.Users.findAll.mockResolvedValue([
                { id: 10, name: 'Alice' },
                { id: 20, name: 'Bob' },
            ]);

            const res = await request(app).get('/groupsUsers/byGroup/1');

            expect(res.status).toBe(200);
            expect(res.body).toHaveLength(2);
            expect(db.Users.findAll).toHaveBeenCalledWith({ where: { id: [10, 20] } });
        });
    });
});
