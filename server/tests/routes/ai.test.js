'use strict';
process.env.JWT_SECRET = 'test-secret-key';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const express = require('express');
const { generateAccessToken } = require('../helpers/authHelpers');

// ── Mock all heavy services before requiring the router ──────────────────────

jest.mock('../../services/openai', () => ({
    chatCompletion: jest.fn(),
    getProviderLabel: jest.fn().mockReturnValue('OpenAI'),
}));

jest.mock('../../services/ragRetriever', () => ({
    retrieveContext: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../services/embeddingSync', () => ({
    reindexAll: jest.fn().mockResolvedValue({ indexed: 0, errors: 0 }),
    indexDocument: jest.fn().mockResolvedValue(undefined),
    removeDocument: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/embeddingService', () => ({
    estimateTokens: jest.fn().mockReturnValue(10),
}));

jest.mock('../../services/documentProcessor', () => ({
    processDocument: jest.fn().mockResolvedValue({ chunks: ['chunk1'], pages: 5 }),
}));

jest.mock('multer', () => {
    const multerMock = () => ({
        single: () => (req, _res, next) => {
            // Simulate a PDF file upload for tests that need it
            if (req.headers['x-test-file']) {
                req.file = { mimetype: 'application/pdf', buffer: Buffer.from('pdf'), originalname: 'test.pdf' };
            }
            next();
        },
    });
    multerMock.memoryStorage = jest.fn().mockReturnValue({});
    return multerMock;
});

jest.mock('../../models', () => {
    const mockAiMessages = {
        findAll: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 1, role: 'user', content: 'hi', tokens: 5 }),
        destroy: jest.fn().mockResolvedValue(1),
    };
    const mockGroups = {
        findByPk: jest.fn(),
    };
    const mockUsers = {
        findByPk: jest.fn(),
        update: jest.fn().mockResolvedValue([1]),
        increment: jest.fn().mockResolvedValue([1]),
    };
    const mockChats = {
        findAll: jest.fn().mockResolvedValue([]),
    };
    const mockUserDocuments = {
        findAll: jest.fn().mockResolvedValue([]),
        findOne: jest.fn(),
        create: jest.fn(),
        destroy: jest.fn(),
    };
    const mockGroups_Users = {
        findOne: jest.fn(),
    };
    return {
        AiMessages: mockAiMessages,
        Groups: mockGroups,
        Users: mockUsers,
        Chats: mockChats,
        UserDocuments: mockUserDocuments,
        Groups_Users: mockGroups_Users,
        ContentEmbeddings: { findAll: jest.fn().mockResolvedValue([]) },
        sequelize: { literal: jest.fn(v => v) },
    };
});

const { chatCompletion } = require('../../services/openai');
const db = require('../../models');
const router = require('../../routes/Ai');

const app = express();
app.use(express.json());
app.use('/ai', router);

// Reusable user fixture — credits not exhausted, reset today
const freshUser = {
    id: 1,
    aiCreditsUsed: 0,
    aiCreditsResetAt: new Date(),
    save: jest.fn().mockResolvedValue(undefined),
};

const freshGroup = {
    id: 1,
    groupName: 'Math Study',
    subject: 'Mathematics',
    major: 'Science',
    gradeLevel: 'IB HL',
};

beforeEach(() => {
    jest.clearAllMocks();
    db.Groups_Users.findOne.mockResolvedValue({ UserId: 1, GroupId: 1 }); // member
    db.Users.findByPk.mockResolvedValue({ ...freshUser, save: jest.fn() });
    db.Groups.findByPk.mockResolvedValue(freshGroup);
    chatCompletion.mockResolvedValue({ content: 'Test AI response', tokens: 100 });
    db.AiMessages.create.mockResolvedValue({ id: 1, role: 'assistant', content: 'Test AI response', tokens: 100 });
});

// ── GET /ai/credits ──────────────────────────────────────────────────────────

describe('GET /ai/credits', () => {
    it('returns 401 without auth token', async () => {
        const res = await request(app).get('/ai/credits');
        expect(res.status).toBe(401);
    });

    it('returns credit status for authenticated user', async () => {
        const token = generateAccessToken(1);
        const res = await request(app)
            .get('/ai/credits')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('creditsUsed');
        expect(res.body).toHaveProperty('creditsLimit');
        expect(res.body).toHaveProperty('creditsRemaining');
        expect(res.body).toHaveProperty('provider');
    });

    it('returns 404 when user does not exist', async () => {
        const token = generateAccessToken(999);
        db.Users.findByPk.mockResolvedValue(null);
        const res = await request(app)
            .get('/ai/credits')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(404);
    });
});

// ── POST /ai/chat ────────────────────────────────────────────────────────────

describe('POST /ai/chat', () => {
    it('returns 401 without auth token', async () => {
        const res = await request(app).post('/ai/chat').send({ groupId: 1, message: 'Hello' });
        expect(res.status).toBe(401);
    });

    it('returns 400 when groupId is missing', async () => {
        const token = generateAccessToken(1);
        const res = await request(app)
            .post('/ai/chat')
            .set('Authorization', `Bearer ${token}`)
            .send({ message: 'Hello' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/groupId/i);
    });

    it('returns 400 when message is missing', async () => {
        const token = generateAccessToken(1);
        const res = await request(app)
            .post('/ai/chat')
            .set('Authorization', `Bearer ${token}`)
            .send({ groupId: 1 });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/message/i);
    });

    it('returns 403 when user is not a group member', async () => {
        const token = generateAccessToken(1);
        db.Groups_Users.findOne.mockResolvedValue(null); // not a member
        const res = await request(app)
            .post('/ai/chat')
            .set('Authorization', `Bearer ${token}`)
            .send({ groupId: 1, message: 'Hello' });
        expect(res.status).toBe(403);
    });

    it('returns 404 when user not found', async () => {
        const token = generateAccessToken(1);
        db.Users.findByPk.mockResolvedValue(null);
        const res = await request(app)
            .post('/ai/chat')
            .set('Authorization', `Bearer ${token}`)
            .send({ groupId: 1, message: 'Hello' });
        expect(res.status).toBe(404);
    });

    it('returns 429 when daily token limit is reached', async () => {
        const token = generateAccessToken(1);
        db.Users.findByPk.mockResolvedValue({
            id: 1,
            aiCreditsUsed: 999999,
            aiCreditsResetAt: new Date(),
            save: jest.fn(),
        });
        const res = await request(app)
            .post('/ai/chat')
            .set('Authorization', `Bearer ${token}`)
            .send({ groupId: 1, message: 'Hello' });
        expect(res.status).toBe(429);
        expect(res.body.error).toMatch(/limit/i);
    });

    it('returns 404 when group not found', async () => {
        const token = generateAccessToken(1);
        db.Groups.findByPk.mockResolvedValue(null);
        const res = await request(app)
            .post('/ai/chat')
            .set('Authorization', `Bearer ${token}`)
            .send({ groupId: 1, message: 'Hello' });
        expect(res.status).toBe(404);
        expect(res.body.error).toMatch(/group/i);
    });

    it('returns AI response with sources and credit info (200)', async () => {
        const token = generateAccessToken(1);
        const res = await request(app)
            .post('/ai/chat')
            .set('Authorization', `Bearer ${token}`)
            .send({ groupId: 1, message: 'What is integration?' });
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('userMessage');
        expect(res.body).toHaveProperty('assistantMessage');
        expect(res.body).toHaveProperty('creditsUsed');
        expect(res.body).toHaveProperty('sources');
        expect(chatCompletion).toHaveBeenCalled();
    });

    it('returns 503 when OpenAI API key is invalid', async () => {
        const token = generateAccessToken(1);
        const err = new Error('invalid api key'); err.code = 'invalid_api_key';
        chatCompletion.mockRejectedValueOnce(err);
        const res = await request(app)
            .post('/ai/chat')
            .set('Authorization', `Bearer ${token}`)
            .send({ groupId: 1, message: 'Hello' });
        expect(res.status).toBe(503);
    });
});

// ── POST /ai/quiz ────────────────────────────────────────────────────────────

describe('POST /ai/quiz', () => {
    it('returns 401 without auth token', async () => {
        const res = await request(app).post('/ai/quiz').send({ groupId: 1 });
        expect(res.status).toBe(401);
    });

    it('generates a quiz without groupId using user profile subject', async () => {
        const token = generateAccessToken(1);
        db.Users.findByPk.mockResolvedValue({ ...freshUser, subject: 'Biology', save: jest.fn() });
        const quizJson = JSON.stringify({
            questions: [
                { question: 'What is mitosis?', options: ['A) Cell division', 'B) Photosynthesis', 'C) Respiration', 'D) Osmosis'], correctIndex: 0, explanation: 'Mitosis is cell division' },
            ],
        });
        chatCompletion.mockResolvedValueOnce({ content: quizJson, tokens: 50 });
        const res = await request(app)
            .post('/ai/quiz')
            .set('Authorization', `Bearer ${token}`)
            .send({ topic: 'Mitosis', numQuestions: 1, difficulty: 'easy' });
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('quiz');
        expect(Array.isArray(res.body.quiz)).toBe(true);
    });

    it('returns 403 when not a group member', async () => {
        const token = generateAccessToken(1);
        db.Groups_Users.findOne.mockResolvedValue(null);
        const res = await request(app)
            .post('/ai/quiz')
            .set('Authorization', `Bearer ${token}`)
            .send({ groupId: 1 });
        expect(res.status).toBe(403);
    });

    it('generates a quiz and returns questions (200)', async () => {
        const token = generateAccessToken(1);
        const quizJson = JSON.stringify({
            questions: [
                { question: 'What is 2+2?', options: ['A) 3', 'B) 4', 'C) 5', 'D) 6'], correctIndex: 1, explanation: 'Basic arithmetic' },
            ],
        });
        chatCompletion.mockResolvedValueOnce({ content: quizJson, tokens: 50 });

        const res = await request(app)
            .post('/ai/quiz')
            .set('Authorization', `Bearer ${token}`)
            .send({ groupId: 1, topic: 'Arithmetic', numQuestions: 1, difficulty: 'easy' });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('quiz');
        expect(Array.isArray(res.body.quiz)).toBe(true);
        expect(res.body.quiz[0]).toHaveProperty('question');
    });

    it('returns 500 when AI returns invalid JSON', async () => {
        const token = generateAccessToken(1);
        chatCompletion.mockResolvedValueOnce({ content: 'not valid json }{', tokens: 10 });
        const res = await request(app)
            .post('/ai/quiz')
            .set('Authorization', `Bearer ${token}`)
            .send({ groupId: 1 });
        expect(res.status).toBe(500);
        expect(res.body.error).toMatch(/parse/i);
    });
});

// ── POST /ai/ask ─────────────────────────────────────────────────────────────

describe('POST /ai/ask', () => {
    it('returns 401 without auth token', async () => {
        const res = await request(app).post('/ai/ask').send({ message: 'Hello' });
        expect(res.status).toBe(401);
    });

    it('returns 400 when message is empty', async () => {
        const token = generateAccessToken(1);
        const res = await request(app)
            .post('/ai/ask')
            .set('Authorization', `Bearer ${token}`)
            .send({ message: '   ' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/message/i);
    });

    it('returns answer with sources (200)', async () => {
        const token = generateAccessToken(1);
        const res = await request(app)
            .post('/ai/ask')
            .set('Authorization', `Bearer ${token}`)
            .send({ message: 'Explain photosynthesis', history: [] });
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('answer');
        expect(res.body).toHaveProperty('sources');
        expect(res.body).toHaveProperty('creditsUsed');
    });

    it('returns 429 when daily token limit is reached', async () => {
        const token = generateAccessToken(1);
        db.Users.findByPk.mockResolvedValue({
            id: 1, aiCreditsUsed: 999999, aiCreditsResetAt: new Date(), save: jest.fn(),
        });
        const res = await request(app)
            .post('/ai/ask')
            .set('Authorization', `Bearer ${token}`)
            .send({ message: 'Hello' });
        expect(res.status).toBe(429);
    });

    it('passes conversation history to the LLM', async () => {
        const token = generateAccessToken(1);
        const history = [
            { role: 'user', content: 'Previous question' },
            { role: 'assistant', content: 'Previous answer' },
        ];
        await request(app)
            .post('/ai/ask')
            .set('Authorization', `Bearer ${token}`)
            .send({ message: 'Follow-up question', history });

        const callArgs = chatCompletion.mock.calls[0][0];
        const hasHistory = callArgs.some(m => m.content === 'Previous question');
        expect(hasHistory).toBe(true);
    });

    it('passes userId to retrieveContext so user documents are included', async () => {
        const token = generateAccessToken(42);
        db.Users.findByPk.mockResolvedValue({
            ...freshUser, id: 42, subject: 'Biology', save: jest.fn(),
        });
        const { retrieveContext } = require('../../services/ragRetriever');
        await request(app)
            .post('/ai/ask')
            .set('Authorization', `Bearer ${token}`)
            .send({ message: 'Explain photosynthesis' });
        expect(retrieveContext).toHaveBeenCalled();
        const opts = retrieveContext.mock.calls[0][1];
        expect(opts.userId).toBe(42);
    });

    it('returns sourceId on each source so UI can identify cited documents', async () => {
        const token = generateAccessToken(1);
        const { retrieveContext } = require('../../services/ragRetriever');
        retrieveContext.mockResolvedValueOnce([
            { source: 'document', sourceId: 7, title: 'Biology HL', content: 'Chapter 2 — cells...', metadata: 'p.23', score: 0.9 },
            { source: 'wiki', sourceId: 3, title: 'Mitosis', content: 'Cell division process', metadata: '', score: 0.7 },
        ]);
        const res = await request(app)
            .post('/ai/ask')
            .set('Authorization', `Bearer ${token}`)
            .send({ message: 'What is mitosis?' });
        expect(res.status).toBe(200);
        expect(res.body.sources).toHaveLength(2);
        expect(res.body.sources[0]).toMatchObject({ source: 'document', sourceId: 7, title: 'Biology HL' });
        expect(res.body.sources[1]).toMatchObject({ source: 'wiki', sourceId: 3, title: 'Mitosis' });
    });
});

// ── POST /ai/upload-document ──────────────────────────────────────────────────

describe('POST /ai/upload-document', () => {
    it('returns 401 without auth token', async () => {
        const res = await request(app).post('/ai/upload-document');
        expect(res.status).toBe(401);
    });

    it('returns 400 when no file is supplied', async () => {
        const token = generateAccessToken(1);
        const res = await request(app)
            .post('/ai/upload-document')
            .set('Authorization', `Bearer ${token}`)
            .send({ title: 'My Doc' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/file/i);
    });

    it('returns 400 when title is missing', async () => {
        const token = generateAccessToken(1);
        const res = await request(app)
            .post('/ai/upload-document')
            .set('Authorization', `Bearer ${token}`)
            .set('x-test-file', '1')
            .send({ subject: 'Biology', docType: 'textbook' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/title/i);
    });

    it('returns 422 when PDF yields no extractable text', async () => {
        const token = generateAccessToken(1);
        const { processDocument } = require('../../services/documentProcessor');
        processDocument.mockResolvedValueOnce({ chunks: [], pages: 0 });
        const res = await request(app)
            .post('/ai/upload-document')
            .set('Authorization', `Bearer ${token}`)
            .set('x-test-file', '1')
            .send({ title: 'Scanned PDF', docType: 'other' });
        expect(res.status).toBe(422);
        expect(res.body.error).toMatch(/extract/i);
    });

    it('creates a document, triggers indexing, and returns metadata (200)', async () => {
        const token = generateAccessToken(1);
        const { processDocument } = require('../../services/documentProcessor');
        const { indexDocument } = require('../../services/embeddingSync');
        processDocument.mockResolvedValueOnce({
            chunks: [{ text: 'chunk 1', metadata: {} }, { text: 'chunk 2', metadata: {} }],
            pages: 12,
        });
        db.UserDocuments.create.mockResolvedValue({
            id: 99, title: 'Biology HL', subject: 'Biology',
            docType: 'textbook', pageCount: 12, chunkCount: 2,
        });
        const res = await request(app)
            .post('/ai/upload-document')
            .set('Authorization', `Bearer ${token}`)
            .set('x-test-file', '1')
            .send({ title: 'Biology HL', subject: 'Biology', docType: 'textbook' });
        expect(res.status).toBe(200);
        expect(res.body.document).toMatchObject({
            id: 99, title: 'Biology HL', subject: 'Biology',
            docType: 'textbook', pageCount: 12, chunkCount: 2,
        });
        await new Promise(r => setImmediate(r));
        expect(indexDocument).toHaveBeenCalledWith(1, 99, expect.any(Array), 'Biology');
    });

    it('coerces unknown docType to "other"', async () => {
        const token = generateAccessToken(1);
        const { processDocument } = require('../../services/documentProcessor');
        processDocument.mockResolvedValueOnce({
            chunks: [{ text: 'hi', metadata: {} }],
            pages: 1,
        });
        db.UserDocuments.create.mockResolvedValue({
            id: 100, title: 'Thing', subject: null, docType: 'other', pageCount: 1, chunkCount: 1,
        });
        const res = await request(app)
            .post('/ai/upload-document')
            .set('Authorization', `Bearer ${token}`)
            .set('x-test-file', '1')
            .send({ title: 'Thing', docType: 'nonsense' });
        expect(res.status).toBe(200);
        expect(db.UserDocuments.create).toHaveBeenCalledWith(
            expect.objectContaining({ docType: 'other' })
        );
    });
});

// ── POST /ai/suggest ─────────────────────────────────────────────────────────

describe('POST /ai/suggest', () => {
    it('returns 401 without auth token', async () => {
        const res = await request(app).post('/ai/suggest').send({ content: 'test' });
        expect(res.status).toBe(401);
    });

    it('returns 400 when content is empty', async () => {
        const token = generateAccessToken(1);
        const res = await request(app)
            .post('/ai/suggest')
            .set('Authorization', `Bearer ${token}`)
            .send({ content: '   ' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/content/i);
    });

    it('returns suggestedTitle and suggestedTags (200)', async () => {
        const token = generateAccessToken(1);
        chatCompletion.mockResolvedValueOnce({
            content: '{"suggestedTitle":"Chain Rule Explained","suggestedTags":["calculus","chain-rule","derivatives"]}',
            tokens: 30,
        });
        const res = await request(app)
            .post('/ai/suggest')
            .set('Authorization', `Bearer ${token}`)
            .send({ content: 'Content about differentiation using the chain rule', type: 'wiki' });
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('suggestedTitle');
        expect(res.body).toHaveProperty('suggestedTags');
        expect(Array.isArray(res.body.suggestedTags)).toBe(true);
    });
});

// ── GET /ai/history/:groupId ─────────────────────────────────────────────────

describe('GET /ai/history/:groupId', () => {
    it('returns 401 without auth token', async () => {
        const res = await request(app).get('/ai/history/1');
        expect(res.status).toBe(401);
    });

    it('returns message history (200)', async () => {
        const token = generateAccessToken(1);
        db.AiMessages.findAll.mockResolvedValue([
            { id: 1, role: 'user', content: 'Hello', groupId: 1 },
            { id: 2, role: 'assistant', content: 'Hi there', groupId: 1 },
        ]);
        const res = await request(app)
            .get('/ai/history/1')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body).toHaveLength(2);
    });
});

// ── DELETE /ai/history/:groupId ──────────────────────────────────────────────

describe('DELETE /ai/history/:groupId', () => {
    it('returns 401 without auth token', async () => {
        const res = await request(app).delete('/ai/history/1');
        expect(res.status).toBe(401);
    });

    it('clears AI history and returns message (200)', async () => {
        const token = generateAccessToken(1);
        db.AiMessages.destroy.mockResolvedValue(5);
        const res = await request(app)
            .delete('/ai/history/1')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/cleared/i);
        expect(db.AiMessages.destroy).toHaveBeenCalledWith({ where: { groupId: '1' } });
    });
});

// ── GET /ai/sources ───────────────────────────────────────────────────────────

describe('GET /ai/sources', () => {
    it('returns 401 without auth token', async () => {
        const res = await request(app).get('/ai/sources?q=calculus');
        expect(res.status).toBe(401);
    });

    it('returns 400 when q is missing', async () => {
        const token = generateAccessToken(1);
        const res = await request(app)
            .get('/ai/sources')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/query/i);
    });

    it('returns sources array for valid query (200)', async () => {
        const token = generateAccessToken(1);
        const res = await request(app)
            .get('/ai/sources?q=integration')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('sources');
        expect(Array.isArray(res.body.sources)).toBe(true);
    });
});

// ── GET /ai/documents ─────────────────────────────────────────────────────────

describe('GET /ai/documents', () => {
    it('returns 401 without auth token', async () => {
        const res = await request(app).get('/ai/documents');
        expect(res.status).toBe(401);
    });

    it('returns list of user documents (200)', async () => {
        const token = generateAccessToken(1);
        db.UserDocuments.findAll.mockResolvedValue([
            { id: 1, title: 'Biology HL Textbook', docType: 'textbook', pageCount: 400 },
        ]);
        const res = await request(app)
            .get('/ai/documents')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body[0].title).toBe('Biology HL Textbook');
    });
});

// ── DELETE /ai/documents/:id ──────────────────────────────────────────────────

describe('DELETE /ai/documents/:id', () => {
    it('returns 401 without auth token', async () => {
        const res = await request(app).delete('/ai/documents/1');
        expect(res.status).toBe(401);
    });

    it('returns 404 when document not found or belongs to another user', async () => {
        const token = generateAccessToken(1);
        db.UserDocuments.findOne.mockResolvedValue(null);
        const res = await request(app)
            .delete('/ai/documents/999')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(404);
    });

    it('deletes document and embeddings (200)', async () => {
        const token = generateAccessToken(1);
        const doc = { id: 1, userId: 1, destroy: jest.fn().mockResolvedValue(undefined) };
        db.UserDocuments.findOne.mockResolvedValue(doc);
        const { removeDocument } = require('../../services/embeddingSync');
        const res = await request(app)
            .delete('/ai/documents/1')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/deleted/i);
        expect(doc.destroy).toHaveBeenCalled();
        expect(removeDocument).toHaveBeenCalledWith(1);
    });
});
