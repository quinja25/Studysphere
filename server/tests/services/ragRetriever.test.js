'use strict';
process.env.JWT_SECRET = 'test-secret-key';
process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'test';
process.env.DB_HOST = 'localhost';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = 'test';

jest.mock('../../models', () => ({
  WikiArticles: { findAll: jest.fn().mockResolvedValue([]) },
  Questions: { findAll: jest.fn().mockResolvedValue([]) },
  Answers: { findAll: jest.fn().mockResolvedValue([]) },
  Posts: { findAll: jest.fn().mockResolvedValue([]) },
  Resources: { findAll: jest.fn().mockResolvedValue([]) },
  ContentEmbeddings: { findAll: jest.fn().mockResolvedValue([]) },
  Users: { findAll: jest.fn().mockResolvedValue([]) },
  sequelize: {
    query: jest.fn().mockResolvedValue([]),
    QueryTypes: { SELECT: 'SELECT' },
  },
}));

jest.mock('../../services/openai', () => ({
  createEmbedding: jest.fn().mockResolvedValue({ embedding: new Array(512).fill(0.1), tokens: 10 }),
}));

jest.mock('../../services/embeddingService', () => ({
  embedText: jest.fn().mockResolvedValue({ embedding: new Array(512).fill(0.1), tokens: 10 }),
  findSimilar: jest.fn().mockResolvedValue([]),
  hasEmbeddings: jest.fn().mockResolvedValue(false),
  cosineSimilarity: jest.fn().mockReturnValue(0.8),
  deserializeEmbedding: jest.fn().mockReturnValue(new Array(512).fill(0.1)),
}));

const { retrieveContext, extractKeywords } = require('../../services/ragRetriever');
const embeddingService = require('../../services/embeddingService');
const db = require('../../models');

describe('ragRetriever', () => {
  beforeEach(() => jest.clearAllMocks());

  // ─── extractKeywords ──────────────────────────────────────────────────────

  describe('extractKeywords', () => {
    it('removes stop words', () => {
      const kw = extractKeywords('how do I integrate by parts');
      expect(kw).not.toContain('how');
      expect(kw).not.toContain('do');
      expect(kw).not.toContain('by');
      expect(kw).toContain('integrate');
      expect(kw).toContain('parts');
    });

    it('returns empty array for stop-word-only query', () => {
      const kw = extractKeywords('how is the what');
      expect(kw).toHaveLength(0);
    });

    it('filters single-character words', () => {
      const kw = extractKeywords('a b c math');
      expect(kw).toContain('math');
      expect(kw).not.toContain('a');
      expect(kw).not.toContain('b');
      expect(kw).not.toContain('c');
    });

    it('lowercases everything', () => {
      const kw = extractKeywords('CALCULUS Integration');
      expect(kw).toContain('calculus');
      expect(kw).toContain('integration');
    });
  });

  // ─── retrieveContext — empty results ──────────────────────────────────────

  describe('retrieveContext', () => {
    it('returns empty array for empty query', async () => {
      const result = await retrieveContext('');
      expect(result).toEqual([]);
    });

    it('returns empty array for query shorter than 3 chars', async () => {
      const result = await retrieveContext('ab');
      expect(result).toEqual([]);
    });

    it('returns empty array when query has only stop words', async () => {
      const result = await retrieveContext('how is the');
      expect(result).toEqual([]);
    });

    it('returns empty array when all searches return nothing', async () => {
      db.sequelize.query.mockResolvedValue([]);
      embeddingService.findSimilar.mockResolvedValue([]);
      embeddingService.hasEmbeddings.mockResolvedValue(false);

      const result = await retrieveContext('quadratic equation', { maxChunks: 5 });
      expect(result).toEqual([]);
    });

    it('returns up to maxChunks results', async () => {
      // Return 6 results from FULLTEXT so we can verify maxChunks=3 slices it
      const mockRows = Array.from({ length: 6 }, (_, i) => ({
        id: i + 1,
        title: `Article ${i + 1}`,
        content: 'Some content about mathematics and calculus.',
        subject: 'Math',
        views: 10,
        createdAt: new Date().toISOString(),
        authorName: 'Alice',
        relevance: 2.0 - i * 0.1,
      }));
      db.sequelize.query.mockResolvedValue(mockRows);

      const result = await retrieveContext('calculus integration', { maxChunks: 3 });
      expect(result.length).toBeLessThanOrEqual(3);
    });

    it('calls FULLTEXT search for meaningful queries', async () => {
      await retrieveContext('photosynthesis biology', { maxChunks: 5 });
      // sequelize.query should be called for FULLTEXT searches
      expect(db.sequelize.query).toHaveBeenCalled();
    });

    it('includes vector results when hasEmbeddings is true', async () => {
      embeddingService.hasEmbeddings.mockResolvedValue(true);
      embeddingService.findSimilar.mockResolvedValue([
        {
          sourceType: 'wiki',
          sourceId: 99,
          chunkIndex: 0,
          chunkText: 'Vector chunk content',
          subject: 'Math',
          userId: null,
          similarity: 0.9,
        },
      ]);
      db.sequelize.query.mockResolvedValue([]);

      const result = await retrieveContext('integration by substitution', { maxChunks: 5 });
      // At least the vector result should appear
      expect(result.some(r => r.sourceId === 99)).toBe(true);
    });

    it('RRF boosts documents appearing in both FULLTEXT and vector results', async () => {
      // Source ID 1 appears in both FULLTEXT wiki results and vector results
      const fulltextRows = [
        {
          id: 1,
          title: 'Calculus Article',
          content: 'Integration by parts is a technique.',
          subject: 'Math',
          views: 5,
          createdAt: new Date().toISOString(),
          authorName: 'Bob',
          relevance: 1.5,
        },
        {
          id: 2,
          title: 'Algebra Article',
          content: 'Quadratic equations have two roots.',
          subject: 'Math',
          views: 5,
          createdAt: new Date().toISOString(),
          authorName: 'Carol',
          relevance: 1.0,
        },
      ];
      db.sequelize.query.mockResolvedValue(fulltextRows);

      embeddingService.hasEmbeddings.mockResolvedValue(true);
      // sourceId=1 also appears in vector results → should be boosted by RRF
      embeddingService.findSimilar.mockResolvedValue([
        { sourceType: 'wiki', sourceId: 1, chunkIndex: 0, chunkText: 'Integration by parts.', subject: 'Math', userId: null, similarity: 0.95 },
        { sourceType: 'wiki', sourceId: 3, chunkIndex: 0, chunkText: 'New vector-only result.', subject: 'Math', userId: null, similarity: 0.85 },
      ]);

      const result = await retrieveContext('integration calculus', { maxChunks: 10 });

      // sourceId=1 (in both lists) should rank above sourceId=2 (FULLTEXT only, lower score)
      const ids = result.map(r => r.sourceId);
      const rank1 = ids.indexOf(1);
      const rank2 = ids.indexOf(2);
      expect(rank1).toBeGreaterThanOrEqual(0); // must appear
      expect(rank1).toBeLessThan(rank2 === -1 ? Infinity : rank2); // ranked higher than id=2
    });
  });
});
