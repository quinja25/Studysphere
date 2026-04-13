'use strict';
process.env.JWT_SECRET = 'test-secret-key';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const express = require('express');
const { generateAccessToken } = require('../helpers/authHelpers');

jest.mock('../../models', () => ({
  Reports: {
    create: jest.fn(),
  },
  Users: {
    findByPk: jest.fn(),
  },
}));

const { Reports } = require('../../models');
const router = require('../../routes/ReportsRoute');

const app = express();
app.use(express.json());
app.use('/reports', router);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /reports', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(app).post('/reports').send({
      reportedUserId: 99,
      type: 'spam',
      description: 'Spamming',
    });
    expect(res.status).toBe(401);
  });

  it('returns 400 if reportedUserId is missing', async () => {
    const token = generateAccessToken(42);
    const res = await request(app)
      .post('/reports')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'spam' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 if type is missing', async () => {
    const token = generateAccessToken(42);
    const res = await request(app)
      .post('/reports')
      .set('Authorization', `Bearer ${token}`)
      .send({ reportedUserId: 99 });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when user reports themselves', async () => {
    const token = generateAccessToken(42);
    const res = await request(app)
      .post('/reports')
      .set('Authorization', `Bearer ${token}`)
      .send({ reportedUserId: 42, type: 'spam', description: 'Self report' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/yourself/i);
  });

  it('creates a report (200)', async () => {
    const token = generateAccessToken(42);
    const report = {
      id: 1,
      reporterId: 42,
      reportedUserId: 99,
      type: 'harassment',
      description: 'Rude comments',
      status: 'pending',
    };
    Reports.create.mockResolvedValue(report);
    const res = await request(app)
      .post('/reports')
      .set('Authorization', `Bearer ${token}`)
      .send({ reportedUserId: 99, type: 'harassment', description: 'Rude comments' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ reportedUserId: 99, type: 'harassment' });
    expect(Reports.create).toHaveBeenCalledWith(
      expect.objectContaining({ reporterId: 42, reportedUserId: 99, type: 'harassment' })
    );
  });

  it('creates a report without optional description (200)', async () => {
    const token = generateAccessToken(42);
    Reports.create.mockResolvedValue({ id: 2, reporterId: 42, reportedUserId: 55, type: 'spam' });
    const res = await request(app)
      .post('/reports')
      .set('Authorization', `Bearer ${token}`)
      .send({ reportedUserId: 55, type: 'spam' });
    expect(res.status).toBe(200);
    expect(Reports.create).toHaveBeenCalled();
  });
});
