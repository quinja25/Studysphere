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

const mockQuestion = {
  id: 1,
  title: 'What is a derivative?',
  body: 'Please explain derivatives.',
  authorId: 42,
  questionId: undefined,
  isAnswered: false,
  destroy: jest.fn().mockResolvedValue(undefined),
  update: jest.fn().mockResolvedValue(undefined),
};

const mockAnswer = {
  id: 10,
  content: 'A derivative is...',
  authorId: 42,
  questionId: 1,
  isAccepted: false,
  votes: 0,
  increment: jest.fn().mockResolvedValue(undefined),
  update: jest.fn().mockResolvedValue(undefined),
  destroy: jest.fn().mockResolvedValue(undefined),
};

jest.mock('../../models', () => ({
  Questions: {
    findAndCountAll: jest.fn(),
    findByPk: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  Answers: {
    findByPk: jest.fn(),
    findAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  Users: {
    findByPk: jest.fn(),
  },
}));

const { Questions, Answers } = require('../../models');
const router = require('../../routes/QA');

const app = express();
app.use(express.json());
app.use('/qa', router);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /qa', () => {
  it('returns paginated question list (200)', async () => {
    Questions.findAndCountAll.mockResolvedValue({
      rows: [{ id: 1, title: 'Question 1' }],
      count: 1,
    });
    const res = await request(app).get('/qa');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('total', 1);
  });

  it('supports ?subject= and ?search= filters', async () => {
    Questions.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });
    const res = await request(app).get('/qa?subject=Math&search=derivative');
    expect(res.status).toBe(200);
    expect(Questions.findAndCountAll).toHaveBeenCalled();
  });
});

describe('GET /qa/:id', () => {
  it('returns question with answers (200)', async () => {
    Questions.findByPk.mockResolvedValue({ ...mockQuestion });
    const res = await request(app).get('/qa/1');
    expect(res.status).toBe(200);
  });

  it('returns 404 when question not found', async () => {
    Questions.findByPk.mockResolvedValue(null);
    const res = await request(app).get('/qa/999');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});

describe('POST /qa', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(app).post('/qa').send({ title: 'Q', body: 'Body' });
    expect(res.status).toBe(401);
  });

  it('returns 400 if title is missing', async () => {
    const token = generateAccessToken(42);
    const res = await request(app)
      .post('/qa')
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'A question body' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/title/i);
  });

  it('returns 400 if body is missing', async () => {
    const token = generateAccessToken(42);
    const res = await request(app)
      .post('/qa')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'My question' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/body/i);
  });

  it('creates question (201)', async () => {
    const token = generateAccessToken(42);
    Questions.create.mockResolvedValue({ id: 2, title: 'New Q', body: 'Body', authorId: 42 });
    const res = await request(app)
      .post('/qa')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'New Q', body: 'Body', subject: 'Math' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ title: 'New Q' });
  });
});

describe('DELETE /qa/:id', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(app).delete('/qa/1');
    expect(res.status).toBe(401);
  });

  it('returns 404 when question not found', async () => {
    const token = generateAccessToken(42);
    Questions.findByPk.mockResolvedValue(null);
    const res = await request(app)
      .delete('/qa/999')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('returns 403 when not the author', async () => {
    const token = generateAccessToken(99);
    Questions.findByPk.mockResolvedValue({ ...mockQuestion, authorId: 42 });
    const res = await request(app)
      .delete('/qa/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('deletes question (200)', async () => {
    const token = generateAccessToken(42);
    const q = { ...mockQuestion, authorId: 42, destroy: jest.fn().mockResolvedValue(undefined) };
    Questions.findByPk.mockResolvedValue(q);
    const res = await request(app)
      .delete('/qa/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message', 'Deleted');
    expect(q.destroy).toHaveBeenCalled();
  });
});

describe('POST /qa/:questionId/answers', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(app).post('/qa/1/answers').send({ content: 'Answer' });
    expect(res.status).toBe(401);
  });

  it('returns 404 when question not found', async () => {
    const token = generateAccessToken(42);
    Questions.findByPk.mockResolvedValue(null);
    const res = await request(app)
      .post('/qa/999/answers')
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Answer content' });
    expect(res.status).toBe(404);
  });

  it('returns 400 if content is missing', async () => {
    const token = generateAccessToken(42);
    Questions.findByPk.mockResolvedValue({ ...mockQuestion });
    const res = await request(app)
      .post('/qa/1/answers')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/content/i);
  });

  it('creates answer (201)', async () => {
    const token = generateAccessToken(42);
    Questions.findByPk.mockResolvedValue({ ...mockQuestion });
    const created = { id: 10, content: 'Answer content', authorId: 42, questionId: 1, reload: jest.fn().mockResolvedValue(undefined) };
    Answers.create.mockResolvedValue(created);
    const res = await request(app)
      .post('/qa/1/answers')
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Answer content' });
    expect(res.status).toBe(201);
  });
});

describe('POST /qa/answers/:id/vote', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(app).post('/qa/answers/10/vote');
    expect(res.status).toBe(401);
  });

  it('returns 404 when answer not found', async () => {
    const token = generateAccessToken(42);
    Answers.findByPk.mockResolvedValue(null);
    const res = await request(app)
      .post('/qa/answers/999/vote')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('increments votes (200)', async () => {
    const token = generateAccessToken(42);
    const answer = { ...mockAnswer, increment: jest.fn().mockResolvedValue(undefined) };
    Answers.findByPk.mockResolvedValue(answer);
    const res = await request(app)
      .post('/qa/answers/10/vote')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('votes');
    expect(answer.increment).toHaveBeenCalledWith('votes');
  });
});

describe('POST /qa/answers/:id/accept', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(app).post('/qa/answers/10/accept');
    expect(res.status).toBe(401);
  });

  it('returns 403 when user is not question author', async () => {
    const token = generateAccessToken(99);
    Answers.findByPk.mockResolvedValue({ ...mockAnswer, questionId: 1 });
    Questions.findByPk.mockResolvedValue({ ...mockQuestion, authorId: 42 });
    const res = await request(app)
      .post('/qa/answers/10/accept')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('accepts an answer (200)', async () => {
    const token = generateAccessToken(42);
    const answer = { ...mockAnswer, questionId: 1, update: jest.fn().mockResolvedValue(undefined) };
    const question = { ...mockQuestion, authorId: 42, update: jest.fn().mockResolvedValue(undefined) };
    Answers.findByPk.mockResolvedValue(answer);
    Questions.findByPk.mockResolvedValue(question);
    Answers.update.mockResolvedValue([1]);
    const res = await request(app)
      .post('/qa/answers/10/accept')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accepted', true);
  });
});

describe('DELETE /qa/answers/:id', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(app).delete('/qa/answers/10');
    expect(res.status).toBe(401);
  });

  it('returns 403 when not the answer author', async () => {
    const token = generateAccessToken(99);
    Answers.findByPk.mockResolvedValue({ ...mockAnswer, authorId: 42 });
    const res = await request(app)
      .delete('/qa/answers/10')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('deletes answer (200)', async () => {
    const token = generateAccessToken(42);
    const answer = { ...mockAnswer, authorId: 42, destroy: jest.fn().mockResolvedValue(undefined) };
    Answers.findByPk.mockResolvedValue(answer);
    const res = await request(app)
      .delete('/qa/answers/10')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message', 'Deleted');
    expect(answer.destroy).toHaveBeenCalled();
  });
});
