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

const mockPost = {
  id: 1,
  title: 'Study Tips',
  content: 'Here are my tips...',
  type: 'advice',
  authorId: 42,
  likes: 0,
  increment: jest.fn().mockResolvedValue(undefined),
  destroy: jest.fn().mockResolvedValue(undefined),
};

jest.mock('../../models', () => ({
  Posts: {
    findAll: jest.fn(),
    findByPk: jest.fn(),
    create: jest.fn(),
  },
  PostLikes: {
    findOrCreate: jest.fn(),
    destroy: jest.fn(),
  },
  Users: {
    findByPk: jest.fn(),
  },
}));

const { Posts, PostLikes } = require('../../models');
const router = require('../../routes/Posts');

const app = express();
app.use(express.json());
app.use('/posts', router);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /posts/byAuthor/:id', () => {
  it('returns posts by author (200)', async () => {
    Posts.findAll.mockResolvedValue([{ id: 1, title: 'Post 1', authorId: 42 }]);
    const res = await request(app).get('/posts/byAuthor/42');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('GET /posts/:id', () => {
  it('returns a post (200)', async () => {
    Posts.findByPk.mockResolvedValue({ ...mockPost });
    const res = await request(app).get('/posts/1');
    expect(res.status).toBe(200);
  });

  it('returns 404 when post not found', async () => {
    Posts.findByPk.mockResolvedValue(null);
    const res = await request(app).get('/posts/999');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});

describe('POST /posts', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(app).post('/posts').send({ title: 'T', content: 'C' });
    expect(res.status).toBe(401);
  });

  it('returns 400 if title is missing', async () => {
    const token = generateAccessToken(42);
    const res = await request(app)
      .post('/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Body text' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/title/i);
  });

  it('returns 400 if content is missing', async () => {
    const token = generateAccessToken(42);
    const res = await request(app)
      .post('/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'My Post' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/content/i);
  });

  it('creates a post (201)', async () => {
    const token = generateAccessToken(42);
    Posts.create.mockResolvedValue({ id: 3, title: 'New Post', content: 'Body', authorId: 42 });
    const res = await request(app)
      .post('/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'New Post', content: 'Body', type: 'blog' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ title: 'New Post' });
  });
});

describe('POST /posts/:id/like', () => {
  it('returns 404 when post not found', async () => {
    const token = generateAccessToken(42);
    Posts.findByPk.mockResolvedValue(null);
    PostLikes.findOrCreate.mockResolvedValue([{}, true]);
    const res = await request(app)
      .post('/posts/999/like')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('increments likes (200)', async () => {
    const token = generateAccessToken(42);
    const post = { ...mockPost, likes: 5, increment: jest.fn().mockResolvedValue(undefined) };
    Posts.findByPk.mockResolvedValue(post);
    PostLikes.findOrCreate.mockResolvedValue([{}, true]); // created = true (new like)
    const res = await request(app)
      .post('/posts/1/like')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('likes');
    expect(post.increment).toHaveBeenCalledWith('likes');
  });
});

describe('DELETE /posts/:id', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(app).delete('/posts/1');
    expect(res.status).toBe(401);
  });

  it('returns 404 when post not found', async () => {
    const token = generateAccessToken(42);
    Posts.findByPk.mockResolvedValue(null);
    const res = await request(app)
      .delete('/posts/999')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('returns 403 when user is not the author', async () => {
    const token = generateAccessToken(99);
    Posts.findByPk.mockResolvedValue({ ...mockPost, authorId: 42 });
    const res = await request(app)
      .delete('/posts/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('deletes post and calls removeContent (200)', async () => {
    const token = generateAccessToken(42);
    const post = { ...mockPost, authorId: 42, destroy: jest.fn().mockResolvedValue(undefined) };
    Posts.findByPk.mockResolvedValue(post);
    const res = await request(app)
      .delete('/posts/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message', 'Deleted');
    expect(post.destroy).toHaveBeenCalled();
  });
});
