'use strict';
process.env.JWT_SECRET = 'test-secret-key';
process.env.NODE_ENV = 'test';
process.env.MAX_XP_DEBT = '-100';

const request = require('supertest');
const express = require('express');
const { generateAccessToken } = require('../helpers/authHelpers');

jest.mock('../../services/embeddingSync', () => ({
  indexContent: jest.fn().mockResolvedValue(undefined),
}));

// Mock the transaction object
const mockTransaction = {
  commit: jest.fn().mockResolvedValue(undefined),
  rollback: jest.fn().mockResolvedValue(undefined),
};

jest.mock('../../models', () => ({
  Resources: {
    findAndCountAll: jest.fn(),
    findByPk: jest.fn(),
    create: jest.fn(),
    increment: jest.fn().mockResolvedValue(undefined),
  },
  UserResources: {
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 1 }),
  },
  Users: {
    findByPk: jest.fn(),
    update: jest.fn().mockResolvedValue([1]),
  },
  sequelize: {
    transaction: jest.fn().mockResolvedValue({
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
    }),
  },
}));

const { Resources, UserResources, Users, sequelize } = require('../../models');
const router = require('../../routes/Resources');

const app = express();
app.use(express.json());
app.use('/resources', router);

beforeEach(() => {
  jest.clearAllMocks();
  // Reset transaction mock to fresh fns each test
  sequelize.transaction.mockResolvedValue({
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
  });
});

describe('GET /resources', () => {
  it('returns 401 without auth (route requires auth)', async () => {
    const res = await request(app).get('/resources');
    expect(res.status).toBe(401);
  });

  it('returns paginated resource list with owned flag (200)', async () => {
    const token = generateAccessToken(42);
    Resources.findAndCountAll.mockResolvedValue({
      rows: [{ id: 1, title: 'Resource 1', price: 50, toJSON: () => ({ id: 1, title: 'Resource 1' }) }],
      count: 1,
    });
    UserResources.findAll.mockResolvedValue([{ resourceId: 1 }]);
    const res = await request(app)
      .get('/resources')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body.data[0]).toHaveProperty('owned', true);
  });
});

describe('GET /resources/:id', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/resources/1');
    expect(res.status).toBe(401);
  });

  it('returns 404 when resource not found', async () => {
    const token = generateAccessToken(42);
    Resources.findByPk.mockResolvedValue(null);
    const res = await request(app)
      .get('/resources/999')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('returns resource with content when owned (200)', async () => {
    const token = generateAccessToken(42);
    const resource = {
      id: 1,
      price: 0,
      authorId: 99,
      toJSON: () => ({ id: 1, title: 'Free Resource', content: 'Secret content' }),
    };
    Resources.findByPk.mockResolvedValue(resource);
    UserResources.findOne.mockResolvedValue(null);
    const res = await request(app)
      .get('/resources/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    // Free resource — content should be visible
    expect(res.body).not.toHaveProperty('locked');
  });

  it('returns resource locked when not owned and has price', async () => {
    const token = generateAccessToken(42);
    const resource = {
      id: 2,
      price: 100,
      authorId: 99,
      toJSON: () => ({ id: 2, title: 'Paid Resource', content: 'Locked content' }),
    };
    Resources.findByPk.mockResolvedValue(resource);
    UserResources.findOne.mockResolvedValue(null);
    const res = await request(app)
      .get('/resources/2')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('locked', true);
    expect(res.body).not.toHaveProperty('content');
  });
});

describe('POST /resources', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(app).post('/resources').send({ title: 'T', content: 'C' });
    expect(res.status).toBe(401);
  });

  it('returns 400 if title is missing', async () => {
    const token = generateAccessToken(42);
    const res = await request(app)
      .post('/resources')
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Some content' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/title/i);
  });

  it('returns 400 if content is missing', async () => {
    const token = generateAccessToken(42);
    const res = await request(app)
      .post('/resources')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'My Resource' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/content/i);
  });

  it('returns 400 if price is negative', async () => {
    const token = generateAccessToken(42);
    const res = await request(app)
      .post('/resources')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'My Resource', content: 'Body', price: -5 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/price/i);
  });

  it('creates a resource (201)', async () => {
    const token = generateAccessToken(42);
    Resources.create.mockResolvedValue({ id: 5, title: 'New Resource', price: 0, authorId: 42 });
    const res = await request(app)
      .post('/resources')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'New Resource', content: 'Content body', price: 0 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ title: 'New Resource' });
  });
});

describe('POST /resources/:id/unlock', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(app).post('/resources/1/unlock');
    expect(res.status).toBe(401);
  });

  it('returns 409 when already unlocked', async () => {
    const token = generateAccessToken(42);
    const t = { commit: jest.fn(), rollback: jest.fn() };
    sequelize.transaction.mockResolvedValue(t);
    Resources.findByPk.mockResolvedValue({ id: 1, price: 50, authorId: 99 });
    Users.findByPk.mockResolvedValue({ id: 42, xp: 200 });
    UserResources.findOne.mockResolvedValue({ id: 1 }); // already owned
    const res = await request(app)
      .post('/resources/1/unlock')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already/i);
    expect(t.rollback).toHaveBeenCalled();
  });

  it('returns 404 when resource not found', async () => {
    const token = generateAccessToken(42);
    const t = { commit: jest.fn(), rollback: jest.fn() };
    sequelize.transaction.mockResolvedValue(t);
    Resources.findByPk.mockResolvedValue(null);
    Users.findByPk.mockResolvedValue({ id: 42, xp: 200 });
    const res = await request(app)
      .post('/resources/999/unlock')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(t.rollback).toHaveBeenCalled();
  });

  it('grants free resource without XP deduction (200)', async () => {
    const token = generateAccessToken(42);
    const t = { commit: jest.fn().mockResolvedValue(undefined), rollback: jest.fn() };
    sequelize.transaction.mockResolvedValue(t);
    const resource = { id: 1, price: 0, authorId: 99 };
    Resources.findByPk.mockResolvedValue(resource);
    Users.findByPk.mockResolvedValue({ id: 42, xp: 200 });
    UserResources.findOne.mockResolvedValue(null);
    UserResources.create.mockResolvedValue({ id: 1 });
    Resources.increment.mockResolvedValue(undefined);
    const res = await request(app)
      .post('/resources/1/unlock')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('newXp');
    expect(t.commit).toHaveBeenCalled();
  });

  it('deducts XP when unlocking a paid resource (200)', async () => {
    const token = generateAccessToken(42);
    const t = { commit: jest.fn().mockResolvedValue(undefined), rollback: jest.fn() };
    sequelize.transaction.mockResolvedValue(t);
    const resource = { id: 2, price: 50, authorId: 99 };
    Resources.findByPk.mockResolvedValue(resource);
    Users.findByPk.mockResolvedValue({ id: 42, xp: 200 });
    UserResources.findOne.mockResolvedValue(null);
    UserResources.create.mockResolvedValue({ id: 2 });
    Users.update.mockResolvedValue([1]);
    Resources.increment.mockResolvedValue(undefined);
    const res = await request(app)
      .post('/resources/2/unlock')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('newXp', 150);
    expect(t.commit).toHaveBeenCalled();
  });

  it('returns 400 when XP debt limit would be exceeded', async () => {
    const token = generateAccessToken(42);
    const t = { commit: jest.fn(), rollback: jest.fn().mockResolvedValue(undefined) };
    sequelize.transaction.mockResolvedValue(t);
    const resource = { id: 3, price: 200, authorId: 99 };
    Resources.findByPk.mockResolvedValue(resource);
    Users.findByPk.mockResolvedValue({ id: 42, xp: -90 }); // already near debt floor
    UserResources.findOne.mockResolvedValue(null);
    const res = await request(app)
      .post('/resources/3/unlock')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('canBorrow', false);
    expect(t.rollback).toHaveBeenCalled();
  });
});
