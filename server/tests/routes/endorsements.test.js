'use strict';
process.env.JWT_SECRET = 'test-secret-key';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const express = require('express');
const { generateAccessToken } = require('../helpers/authHelpers');

jest.mock('../../models', () => ({
  Endorsements: {
    findOrCreate: jest.fn(),
    findAll: jest.fn(),
    count: jest.fn(),
    findOne: jest.fn(),
  },
  Users: {
    findByPk: jest.fn(),
  },
}));

const { Endorsements } = require('../../models');
const router = require('../../routes/Endorsements');

const app = express();
app.use(express.json());
app.use('/endorsements', router);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /endorsements/byAlumni/:id', () => {
  it('returns endorsements for an alumni (200)', async () => {
    Endorsements.findAll.mockResolvedValue([
      { id: 1, alumniId: 10, studentId: 42, message: 'Great mentor!' },
    ]);
    const res = await request(app).get('/endorsements/byAlumni/10');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
  });

  it('returns empty array when alumni has no endorsements (200)', async () => {
    Endorsements.findAll.mockResolvedValue([]);
    const res = await request(app).get('/endorsements/byAlumni/99');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });
});

describe('GET /endorsements/count/:id', () => {
  it('returns endorsement count for an alumni (200)', async () => {
    Endorsements.count.mockResolvedValue(5);
    const res = await request(app).get('/endorsements/count/10');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('count', 5);
  });
});

describe('GET /endorsements/check/:alumniId', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/endorsements/check/10');
    expect(res.status).toBe(401);
  });

  it('returns hasEndorsed: true when already endorsed', async () => {
    const token = generateAccessToken(42);
    Endorsements.findOne.mockResolvedValue({ id: 1, studentId: 42, alumniId: 10 });
    const res = await request(app)
      .get('/endorsements/check/10')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('hasEndorsed', true);
  });

  it('returns hasEndorsed: false when not yet endorsed', async () => {
    const token = generateAccessToken(42);
    Endorsements.findOne.mockResolvedValue(null);
    const res = await request(app)
      .get('/endorsements/check/10')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('hasEndorsed', false);
  });
});

describe('POST /endorsements', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(app).post('/endorsements').send({ alumniId: 10, message: 'Great!' });
    expect(res.status).toBe(401);
  });

  it('creates a new endorsement (201)', async () => {
    const token = generateAccessToken(42);
    const endorsement = { id: 1, studentId: 42, alumniId: 10, message: 'Excellent mentor!' };
    Endorsements.findOrCreate.mockResolvedValue([endorsement, true]);
    const res = await request(app)
      .post('/endorsements')
      .set('Authorization', `Bearer ${token}`)
      .send({ alumniId: 10, message: 'Excellent mentor!' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('created', true);
    expect(res.body.endorsement).toMatchObject({ alumniId: 10 });
  });

  it('returns 200 (not 201) for duplicate endorsement', async () => {
    const token = generateAccessToken(42);
    const endorsement = { id: 1, studentId: 42, alumniId: 10, message: 'Great!' };
    Endorsements.findOrCreate.mockResolvedValue([endorsement, false]);
    const res = await request(app)
      .post('/endorsements')
      .set('Authorization', `Bearer ${token}`)
      .send({ alumniId: 10, message: 'Great!' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('created', false);
  });
});
