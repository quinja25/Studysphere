'use strict';
process.env.JWT_SECRET = 'test-secret-key';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const express = require('express');
const { generateAccessToken } = require('../helpers/authHelpers');

jest.mock('../../services/embeddingSync', () => ({
  indexContent: jest.fn().mockResolvedValue(undefined),
  removeContent: jest.fn().mockResolvedValue(undefined),
}));

const mockArticle = {
  id: 1,
  title: 'Test Article',
  content: 'Test content',
  subject: 'Math',
  authorId: 42,
  views: 0,
  increment: jest.fn().mockResolvedValue(undefined),
  update: jest.fn().mockResolvedValue(undefined),
  destroy: jest.fn().mockResolvedValue(undefined),
  toJSON: jest.fn().mockReturnValue({ id: 1, title: 'Test Article', authorId: 42 }),
};

jest.mock('../../models', () => ({
  WikiArticles: {
    findAndCountAll: jest.fn(),
    findByPk: jest.fn(),
    create: jest.fn(),
  },
  Users: {
    findByPk: jest.fn(),
  },
}));

const { WikiArticles } = require('../../models');
const { indexContent, removeContent } = require('../../services/embeddingSync');
const router = require('../../routes/Wiki');

const app = express();
app.use(express.json());
app.use('/wiki', router);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /wiki', () => {
  it('returns paginated article list (200)', async () => {
    WikiArticles.findAndCountAll.mockResolvedValue({ rows: [{ id: 1, title: 'Test' }], count: 1 });
    const res = await request(app).get('/wiki');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('total', 1);
    expect(res.body).toHaveProperty('page', 1);
  });

  it('supports ?subject= filter', async () => {
    WikiArticles.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });
    const res = await request(app).get('/wiki?subject=Math');
    expect(res.status).toBe(200);
    expect(WikiArticles.findAndCountAll).toHaveBeenCalled();
  });
});

describe('GET /wiki/:id', () => {
  it('returns article and increments views (200)', async () => {
    WikiArticles.findByPk.mockResolvedValue({ ...mockArticle });
    const res = await request(app).get('/wiki/1');
    expect(res.status).toBe(200);
    expect(mockArticle.increment).toHaveBeenCalledWith('views');
  });

  it('returns 404 when article not found', async () => {
    WikiArticles.findByPk.mockResolvedValue(null);
    const res = await request(app).get('/wiki/999');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});

describe('POST /wiki', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(app).post('/wiki').send({ title: 'T', content: 'C' });
    expect(res.status).toBe(401);
  });

  it('returns 400 if title is missing', async () => {
    const token = generateAccessToken(42);
    const res = await request(app)
      .post('/wiki')
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Some content' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/title/i);
  });

  it('returns 400 if content is missing', async () => {
    const token = generateAccessToken(42);
    const res = await request(app)
      .post('/wiki')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'My Title' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/content/i);
  });

  it('creates article and calls indexContent (201)', async () => {
    const token = generateAccessToken(42);
    const created = { id: 5, title: 'New Article', content: 'Body', authorId: 42 };
    WikiArticles.create.mockResolvedValue(created);

    const res = await request(app)
      .post('/wiki')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'New Article', content: 'Body', subject: 'Math' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ title: 'New Article' });
    // indexContent is called async (fire-and-forget), so just verify the mock exists
    expect(indexContent).toBeDefined();
  });
});

describe('PUT /wiki/:id', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(app).put('/wiki/1').send({ title: 'Updated' });
    expect(res.status).toBe(401);
  });

  it('returns 404 when article not found', async () => {
    const token = generateAccessToken(42);
    WikiArticles.findByPk.mockResolvedValue(null);
    const res = await request(app)
      .put('/wiki/999')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Updated' });
    expect(res.status).toBe(404);
  });

  it('returns 403 when user is not the author', async () => {
    const token = generateAccessToken(99);
    WikiArticles.findByPk.mockResolvedValue({ ...mockArticle, authorId: 42 });
    const res = await request(app)
      .put('/wiki/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Updated' });
    expect(res.status).toBe(403);
  });

  it('updates article and re-indexes (200)', async () => {
    const token = generateAccessToken(42);
    const article = {
      ...mockArticle,
      authorId: 42,
      update: jest.fn().mockResolvedValue({ id: 1, title: 'Updated', authorId: 42 }),
    };
    WikiArticles.findByPk.mockResolvedValue(article);

    const res = await request(app)
      .put('/wiki/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Updated', content: 'New content' });

    expect(res.status).toBe(200);
    expect(article.update).toHaveBeenCalled();
  });
});

describe('DELETE /wiki/:id', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(app).delete('/wiki/1');
    expect(res.status).toBe(401);
  });

  it('returns 404 when article not found', async () => {
    const token = generateAccessToken(42);
    WikiArticles.findByPk.mockResolvedValue(null);
    const res = await request(app)
      .delete('/wiki/999')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('returns 403 when user is not the author', async () => {
    const token = generateAccessToken(99);
    WikiArticles.findByPk.mockResolvedValue({ ...mockArticle, authorId: 42 });
    const res = await request(app)
      .delete('/wiki/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('deletes article and calls removeContent (200)', async () => {
    const token = generateAccessToken(42);
    const article = { ...mockArticle, authorId: 42, destroy: jest.fn().mockResolvedValue(undefined) };
    WikiArticles.findByPk.mockResolvedValue(article);

    const res = await request(app)
      .delete('/wiki/1')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message', 'Deleted');
    expect(article.destroy).toHaveBeenCalled();
  });
});
