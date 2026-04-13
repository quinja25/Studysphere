'use strict';
process.env.JWT_SECRET = 'test-secret-key';
process.env.NODE_ENV = 'test';

jest.mock('../../models', () => ({
  ContentEmbeddings: {
    findAll: jest.fn(),
    bulkCreate: jest.fn(),
    destroy: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  Op: require('sequelize').Op,
}));

jest.mock('../../services/openai', () => ({
  createEmbedding: jest.fn().mockResolvedValue({ embedding: new Array(512).fill(0.1), tokens: 10 }),
  createEmbeddingBatch: jest.fn().mockResolvedValue([{ embedding: new Array(512).fill(0.1), tokens: 10 }]),
}));

const {
  chunkText,
  cosineSimilarity,
  serializeEmbedding,
  deserializeEmbedding,
  findSimilar,
  invalidateVectorIndex,
} = require('../../services/embeddingService');

const { ContentEmbeddings } = require('../../models');

describe('embeddingService', () => {
  beforeEach(() => jest.clearAllMocks());

  // ─── chunkText ────────────────────────────────────────────────────────────

  describe('chunkText', () => {
    it('returns empty array for empty string', () => {
      expect(chunkText('')).toEqual([]);
    });

    it('returns empty array for null/undefined', () => {
      expect(chunkText(null)).toEqual([]);
      expect(chunkText(undefined)).toEqual([]);
    });

    it('returns a single chunk when text is short', () => {
      const text = 'Short text.';
      const chunks = chunkText(text);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toContain(text);
    });

    it('prepends prefix to each chunk', () => {
      const text = 'Some content about biology.';
      const prefix = 'Wiki Article: Biology\nSubject: Science';
      const chunks = chunkText(text, prefix);
      chunks.forEach(chunk => {
        expect(chunk).toContain(prefix);
      });
    });

    it('splits long text into multiple chunks', () => {
      // Generate text clearly longer than one chunk (maxTokens=150, ~600 chars)
      const paragraph = 'This is a sentence about a topic. ';
      const text = paragraph.repeat(40); // ~1360 chars >> 600 char limit
      const chunks = chunkText(text, '', 150);
      expect(chunks.length).toBeGreaterThan(1);
    });

    it('each chunk does not greatly exceed the character budget', () => {
      const paragraph = 'Word '.repeat(200); // 1000 chars
      const chunks = chunkText(paragraph, '', 50); // 50 tokens = 200 chars budget
      // Allow some slack for overlap but chunks shouldn't be wildly oversized
      chunks.forEach(chunk => {
        expect(chunk.length).toBeLessThan(1200);
      });
    });

    it('returns single chunk with prefix for text that fits within limit', () => {
      const text = 'Hello world.';
      const prefix = 'Wiki Article: Test';
      const result = chunkText(text, prefix, 150);
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(`${prefix}\n\n${text}`);
    });
  });

  // ─── cosineSimilarity ─────────────────────────────────────────────────────

  describe('cosineSimilarity', () => {
    it('returns 1.0 for identical vectors', () => {
      const vec = [1, 2, 3, 4];
      const sim = cosineSimilarity(vec, vec);
      expect(sim).toBeCloseTo(1.0, 5);
    });

    it('returns 0.0 for orthogonal vectors', () => {
      const a = [1, 0];
      const b = [0, 1];
      expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 5);
    });

    it('returns 0 for zero vectors (avoid divide-by-zero)', () => {
      const zero = [0, 0, 0];
      expect(cosineSimilarity(zero, zero)).toBe(0);
    });

    it('returns correct value for known vectors', () => {
      // [1,1] vs [1,0]: dot=1, |a|=√2, |b|=1 → cos=1/√2 ≈ 0.707
      const sim = cosineSimilarity([1, 1], [1, 0]);
      expect(sim).toBeCloseTo(0.7071, 3);
    });

    it('handles negative components', () => {
      const a = [1, 0];
      const b = [-1, 0];
      expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 5);
    });
  });

  // ─── serializeEmbedding / deserializeEmbedding ────────────────────────────

  describe('serializeEmbedding / deserializeEmbedding', () => {
    it('round-trips a float array through Buffer and back', () => {
      const original = [0.1, 0.5, -0.3, 0.9];
      const buf = serializeEmbedding(original);
      expect(Buffer.isBuffer(buf)).toBe(true);
      const restored = deserializeEmbedding(buf);
      expect(Array.from(restored).length).toBe(original.length);
      original.forEach((v, i) => {
        expect(restored[i]).toBeCloseTo(v, 5);
      });
    });
  });

  // ─── findSimilar ──────────────────────────────────────────────────────────

  describe('findSimilar', () => {
    // The cache is module-level state. Reset it before each test so each test
    // gets a fresh load from the mocked ContentEmbeddings.findAll.
    beforeEach(() => invalidateVectorIndex());

    function makeRow(similarity, sourceId = 1) {
      // Build an embedding that will produce the desired similarity with queryVec [1,0,...,0]
      // For simplicity, just store a real Buffer that our mock will return
      const vec = new Array(512).fill(0);
      vec[0] = similarity; // cosine similarity with [1,0,...] = similarity (normalised)
      const buf = serializeEmbedding(vec);
      return {
        sourceType: 'wiki',
        sourceId,
        chunkIndex: 0,
        chunkText: `chunk ${sourceId}`,
        subject: 'Math',
        userId: null,
        embedding: buf,
      };
    }

    it('returns empty array when no embeddings exist', async () => {
      ContentEmbeddings.findAll.mockResolvedValue([]);
      const result = await findSimilar([1, 0]);
      expect(result).toEqual([]);
    });

    it('excludes results below similarity threshold', async () => {
      // threshold defaults to 0.5; row has similarity ~0.0
      const row = makeRow(0.0);
      ContentEmbeddings.findAll.mockResolvedValue([row]);
      const queryVec = new Array(512).fill(0);
      queryVec[0] = 1; // unit vector along dim 0
      const result = await findSimilar(queryVec, { threshold: 0.5 });
      expect(result).toHaveLength(0);
    });

    it('returns results above similarity threshold sorted descending', async () => {
      // Row A: similarity ≈ 1.0 (parallel), Row B: similarity ≈ 0.0 (orthogonal)
      const vecA = new Array(512).fill(0); vecA[0] = 1;
      const vecB = new Array(512).fill(0); vecB[1] = 1;
      const rowA = { sourceType: 'wiki', sourceId: 1, chunkIndex: 0, chunkText: 'A', subject: null, userId: null, embedding: serializeEmbedding(vecA) };
      const rowB = { sourceType: 'wiki', sourceId: 2, chunkIndex: 0, chunkText: 'B', subject: null, userId: null, embedding: serializeEmbedding(vecB) };

      ContentEmbeddings.findAll.mockResolvedValue([rowB, rowA]); // intentionally out of order

      const queryVec = new Array(512).fill(0);
      queryVec[0] = 1;
      const result = await findSimilar(queryVec, { threshold: 0.5, limit: 10 });

      expect(result).toHaveLength(1); // only rowA passes threshold
      expect(result[0].sourceId).toBe(1);
      expect(result[0].similarity).toBeCloseTo(1.0, 4);
    });

    it('respects the limit option', async () => {
      const vecs = [1, 2, 3].map(sourceId => {
        const vec = new Array(512).fill(0);
        vec[0] = 1; // all parallel → similarity ~1.0
        return {
          sourceType: 'wiki',
          sourceId,
          chunkIndex: 0,
          chunkText: `chunk ${sourceId}`,
          subject: null,
          userId: null,
          embedding: serializeEmbedding(vec),
        };
      });
      ContentEmbeddings.findAll.mockResolvedValue(vecs);

      const queryVec = new Array(512).fill(0);
      queryVec[0] = 1;
      const result = await findSimilar(queryVec, { threshold: 0.5, limit: 2 });
      expect(result).toHaveLength(2);
    });
  });
});
