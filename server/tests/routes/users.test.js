'use strict';
// Must set env before any requires
process.env.JWT_SECRET = 'test-secret-key';
process.env.NODE_ENV = 'test';
process.env.DB_HOST = 'localhost';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = 'test';
process.env.DB_NAME = 'test_studysphere';
process.env.CLIENT_URL = 'http://localhost:3002';

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const { generateAccessToken, generateEmailVerifyToken, generateResetToken } = require('../helpers/authHelpers');

const SECRET = 'test-secret-key';

// Mock ALL external deps before importing the router
jest.mock('../../models', () => {
  const mockUser = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    findByPk: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    destroy: jest.fn(),
  };
  const mockStudySession = {
    create: jest.fn().mockResolvedValue({}),
    sum: jest.fn().mockResolvedValue(0),
    count: jest.fn().mockResolvedValue(0),
  };
  return {
    Users: mockUser,
    StudySessions: mockStudySession,
    sequelize: { query: jest.fn(), literal: jest.fn() },
  };
});

jest.mock('nodemailer', () => ({
  createTransport: jest.fn().mockReturnValue({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'test' }),
    verify: jest.fn().mockResolvedValue(true),
  }),
}));

const cookieParser = require('cookie-parser');
const { Users, StudySessions } = require('../../models');
const usersRouter = require('../../routes/Users');

// Build minimal express app
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/users', usersRouter);

describe('Users API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ------------------------------------------------------------------ GET /
  describe('GET /users', () => {
    it('returns list of users', async () => {
      Users.findAll.mockResolvedValue([{ id: 1, name: 'Alice' }]);
      const res = await request(app).get('/users');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('returns 500 on DB error', async () => {
      Users.findAll.mockRejectedValue(new Error('DB failure'));
      const res = await request(app).get('/users');
      expect(res.status).toBe(500);
    });
  });

  // --------------------------------------------------------------- GET /public
  describe('GET /users/public', () => {
    it('returns only public users', async () => {
      Users.findAll.mockResolvedValue([{ id: 2, isPublic: true }]);
      const res = await request(app).get('/users/public');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // ---------------------------------------------------------- POST /register
  describe('POST /users/register', () => {
    it('registers a new user and returns tokens', async () => {
      Users.findOne.mockResolvedValue(null); // no existing user
      Users.create.mockResolvedValue({
        id: 1,
        dataValues: {
          id: 1, name: 'Test User', email: 'test@example.com',
          username: 'testuser', role: 'student', xp: 0, level: 1,
          isVerified: false,
        },
      });

      const res = await request(app)
        .post('/users/register')
        .send({ name: 'Test User', email: 'test@example.com', username: 'testuser', password: 'Password123!', role: 'student' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body).not.toHaveProperty('refreshToken'); // refresh token is set as httpOnly cookie
    });

    it('returns 400 when email already exists', async () => {
      Users.findOne.mockResolvedValue({ id: 1, email: 'test@example.com' });

      const res = await request(app)
        .post('/users/register')
        .send({ name: 'Test', email: 'test@example.com', username: 'testuser', password: 'Password123!', role: 'student' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
  });

  // ------------------------------------------------------------- POST /login
  describe('POST /users/login', () => {
    it('returns tokens on valid credentials', async () => {
      const bcrypt = require('bcrypt');
      const hash = await bcrypt.hash('Password123!', 10);
      Users.findOne.mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        password: hash,
        dataValues: {
          id: 1, name: 'Test', username: 'test', email: 'test@example.com',
          role: 'student', xp: 0, level: 1, isVerified: true,
        },
      });

      const res = await request(app)
        .post('/users/login')
        .send({ email: 'test@example.com', password: 'Password123!' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body).not.toHaveProperty('refreshToken'); // refresh token is set as httpOnly cookie
    });

    it('returns 400 on wrong password', async () => {
      const bcrypt = require('bcrypt');
      const hash = await bcrypt.hash('RightPassword!', 10);
      Users.findOne.mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        password: hash,
        dataValues: {},
      });

      const res = await request(app)
        .post('/users/login')
        .send({ email: 'test@example.com', password: 'WrongPassword!' });

      expect(res.status).toBe(400);
    });

    it('returns 400 for non-existent user', async () => {
      Users.findOne.mockResolvedValue(null);

      const res = await request(app)
        .post('/users/login')
        .send({ email: 'noone@example.com', password: 'Password123!' });

      expect(res.status).toBe(400);
    });

    it('returns 400 when user has no password (Google-only account)', async () => {
      Users.findOne.mockResolvedValue({
        id: 2, email: 'google@example.com', password: null,
        dataValues: {},
      });

      const res = await request(app)
        .post('/users/login')
        .send({ email: 'google@example.com', password: 'any' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/google/i);
    });
  });

  // ----------------------------------------------------------- POST /refresh
  describe('POST /users/refresh', () => {
    it('returns new access token with valid refresh token', async () => {
      const refreshToken = jwt.sign({ id: 1, type: 'refresh' }, SECRET, { expiresIn: '30d' });

      const res = await request(app)
        .post('/users/refresh')
        .set('Cookie', `refreshToken=${refreshToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
    });

    it('returns 401 with invalid refresh token string', async () => {
      const res = await request(app)
        .post('/users/refresh')
        .set('Cookie', 'refreshToken=totally-invalid-token');

      expect(res.status).toBe(401);
    });

    it('returns 400 with missing refresh token', async () => {
      const res = await request(app)
        .post('/users/refresh');

      expect(res.status).toBe(400);
    });

    it('returns 401 when token type is not refresh', async () => {
      // An access token used as a refresh token should be rejected
      const wrongTypeToken = jwt.sign({ id: 1, type: 'access' }, SECRET, { expiresIn: '15m' });

      const res = await request(app)
        .post('/users/refresh')
        .set('Cookie', `refreshToken=${wrongTypeToken}`);

      expect(res.status).toBe(401);
    });
  });

  // --------------------------------------------------- GET /users/verify-email
  describe('GET /users/verify-email', () => {
    it('verifies email with valid email-verify token', async () => {
      const token = jwt.sign({ id: 1, type: 'email-verify' }, SECRET, { expiresIn: '24h' });
      Users.findByPk.mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        isVerified: false,
        update: jest.fn().mockResolvedValue(true),
      });

      const res = await request(app).get(`/users/verify-email?token=${token}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/verified/i);
    });

    it('returns success message if email already verified', async () => {
      const token = jwt.sign({ id: 1, type: 'email-verify' }, SECRET, { expiresIn: '24h' });
      Users.findByPk.mockResolvedValue({
        id: 1,
        isVerified: true,
        update: jest.fn(),
      });

      const res = await request(app).get(`/users/verify-email?token=${token}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/already verified/i);
    });

    it('returns 400 for missing token', async () => {
      const res = await request(app).get('/users/verify-email');
      expect(res.status).toBe(400);
    });

    it('returns 400 for wrong token type', async () => {
      const token = jwt.sign({ id: 1, type: 'access' }, SECRET, { expiresIn: '15m' });
      const res = await request(app).get(`/users/verify-email?token=${token}`);
      expect(res.status).toBe(400);
    });

    it('returns 404 when user not found', async () => {
      const token = jwt.sign({ id: 9999, type: 'email-verify' }, SECRET, { expiresIn: '24h' });
      Users.findByPk.mockResolvedValue(null);

      const res = await request(app).get(`/users/verify-email?token=${token}`);
      expect(res.status).toBe(404);
    });
  });

  // ------------------------------------------------------------ GET /users/:id
  describe('GET /users/:id', () => {
    it('returns user by id', async () => {
      Users.findByPk.mockResolvedValue({ id: 1, name: 'Test', email: 'test@example.com', username: 'test' });
      const res = await request(app).get('/users/1');
      expect(res.status).toBe(200);
    });

    it('returns 404 for non-existent user', async () => {
      Users.findByPk.mockResolvedValue(null);
      const res = await request(app).get('/users/9999');
      expect(res.status).toBe(404);
    });
  });

  // ------------------------------------------------------------ PUT /users/:id
  describe('PUT /users/:id', () => {
    it('returns 401 without auth token', async () => {
      const res = await request(app).put('/users/1').send({ name: 'New Name' });
      expect(res.status).toBe(401);
    });

    it('updates user with valid auth token', async () => {
      const token = generateAccessToken(1);
      Users.findByPk.mockResolvedValue({
        id: 1,
        name: 'Old Name',
        dataValues: { id: 1, name: 'New Name' },
        update: jest.fn().mockResolvedValue(true),
      });

      const res = await request(app)
        .put('/users/1')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'New Name' });

      expect(res.status).toBe(200);
    });

    it('returns 404 when user does not exist', async () => {
      const token = generateAccessToken(1);
      Users.findByPk.mockResolvedValue(null);

      const res = await request(app)
        .put('/users/9999')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'New Name' });

      expect(res.status).toBe(404);
    });

    it('returns 401 with an expired token', async () => {
      const expiredToken = jwt.sign({ id: 1, type: 'access' }, SECRET, { expiresIn: '-1s' });

      const res = await request(app)
        .put('/users/1')
        .set('Authorization', `Bearer ${expiredToken}`)
        .send({ name: 'Test' });

      expect(res.status).toBe(401);
    });
  });

  // ---------------------------------------------------- POST /forgot-password
  describe('POST /users/forgot-password', () => {
    it('always returns 200 even if email does not exist (no email leaking)', async () => {
      Users.findOne.mockResolvedValue(null);

      const res = await request(app)
        .post('/users/forgot-password')
        .send({ email: 'ghost@example.com' });

      expect(res.status).toBe(200);
      expect(res.body.message).toBeTruthy();
    });

    it('returns 200 for a real email without SMTP configured', async () => {
      const bcrypt = require('bcrypt');
      const hash = await bcrypt.hash('pass', 10);
      Users.findOne.mockResolvedValue({
        id: 1, email: 'real@example.com', password: hash, name: 'Real User',
      });

      const res = await request(app)
        .post('/users/forgot-password')
        .send({ email: 'real@example.com' });

      expect(res.status).toBe(200);
    });
  });

  // ---------------------------------------------------- POST /reset-password
  describe('POST /users/reset-password', () => {
    it('resets password with valid reset token', async () => {
      const token = generateResetToken(1);
      Users.findByPk.mockResolvedValue({
        id: 1,
        update: jest.fn().mockResolvedValue(true),
      });

      const res = await request(app)
        .post('/users/reset-password')
        .send({ token, password: 'NewPassword123!' });

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/updated/i);
    });

    it('returns 400 when token or password is missing', async () => {
      const res = await request(app)
        .post('/users/reset-password')
        .send({ password: 'NewPassword123!' });

      expect(res.status).toBe(400);
    });

    it('returns 400 when password is too short', async () => {
      const token = generateResetToken(1);

      const res = await request(app)
        .post('/users/reset-password')
        .send({ token, password: 'abc' });

      expect(res.status).toBe(400);
    });

    it('returns 400 when reset token type is wrong', async () => {
      const wrongToken = jwt.sign({ id: 1, type: 'access' }, SECRET, { expiresIn: '15m' });

      const res = await request(app)
        .post('/users/reset-password')
        .send({ token: wrongToken, password: 'ValidPass123!' });

      expect(res.status).toBe(400);
    });

    it('returns 400 for expired reset token', async () => {
      const expiredToken = jwt.sign({ id: 1, type: 'reset' }, SECRET, { expiresIn: '-1s' });

      const res = await request(app)
        .post('/users/reset-password')
        .send({ token: expiredToken, password: 'ValidPass123!' });

      expect(res.status).toBe(400);
    });
  });

  // --------------------------------------------- PUT /users/updateXP/:id
  describe('PUT /users/updateXP/:id', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app)
        .put('/users/updateXP/1')
        .send({ xpGained: 50 });

      expect(res.status).toBe(401);
    });

    it('updates XP and returns new stats', async () => {
      const token = generateAccessToken(1);
      Users.findByPk.mockResolvedValue({
        id: 1,
        xp: 50,
        level: 1,
        currentStreak: 0,
        longestStreak: 0,
        lastStudyDate: null,
        weeklyStudiedMinutes: 0,
        weeklyGoalResetAt: null,
        weeklyGoalMinutes: 120,
        totalStudyMinutes: 0,
        totalSessions: 0,
      });
      Users.update.mockResolvedValue([1]);
      StudySessions.create.mockResolvedValue({});

      const res = await request(app)
        .put('/users/updateXP/1')
        .set('Authorization', `Bearer ${token}`)
        .send({ xpGained: 50, groupId: 1, durationMinutes: 5 });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('newXp');
      expect(res.body).toHaveProperty('newLevel');
      expect(res.body).toHaveProperty('leveledUp');
    });

    it('returns 404 when user not found', async () => {
      const token = generateAccessToken(1);
      Users.findByPk.mockResolvedValue(null);

      const res = await request(app)
        .put('/users/updateXP/9999')
        .set('Authorization', `Bearer ${token}`)
        .send({ xpGained: 50 });

      expect(res.status).toBe(404);
    });

    it('level-up occurs when XP crosses threshold', async () => {
      const token = generateAccessToken(1);
      // Level 1 threshold = 100 XP. Starting at 90 + 20 gained = 110 → level up
      Users.findByPk.mockResolvedValue({
        id: 1, xp: 90, level: 1,
        currentStreak: 0, longestStreak: 0, lastStudyDate: null,
        weeklyStudiedMinutes: 0, weeklyGoalResetAt: null,
        weeklyGoalMinutes: 120, totalStudyMinutes: 0, totalSessions: 0,
      });
      Users.update.mockResolvedValue([1]);

      const res = await request(app)
        .put('/users/updateXP/1')
        .set('Authorization', `Bearer ${token}`)
        .send({ xpGained: 20 });

      expect(res.status).toBe(200);
      expect(res.body.leveledUp).toBe(true);
      expect(res.body.newLevel).toBe(2);
    });
  });

  // ---------------------------------------- POST /users/send-verification
  describe('POST /users/send-verification', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).post('/users/send-verification');
      expect(res.status).toBe(401);
    });

    it('returns 400 if already verified', async () => {
      const token = generateAccessToken(1);
      Users.findByPk.mockResolvedValue({
        id: 1, isVerified: true,
      });

      const res = await request(app)
        .post('/users/send-verification')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/already verified/i);
    });

    it('sends verification email for unverified user', async () => {
      const token = generateAccessToken(1);
      Users.findByPk.mockResolvedValue({
        id: 1, email: 'test@example.com', isVerified: false,
      });

      const res = await request(app)
        .post('/users/send-verification')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/sent/i);
    });
  });
});
