'use strict';
process.env.NODE_ENV = 'test';

const CHUNKS = [
  { source: 'wiki', sourceId: 1, title: 'A', content: 'alpha content', metadata: {}, score: 0.9 },
  { source: 'wiki', sourceId: 2, title: 'B', content: 'beta content',  metadata: {}, score: 0.7 },
  { source: 'wiki', sourceId: 3, title: 'C', content: 'gamma content', metadata: {}, score: 0.5 },
];

const resetEnv = () => {
  delete process.env.RAG_RERANK_PROVIDER;
  delete process.env.COHERE_API_KEY;
  delete process.env.OLLAMA_BASE_URL;
  delete process.env.RAG_RERANK_MODEL;
};

beforeEach(() => {
  resetEnv();
  jest.resetModules();
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.clearAllMocks();
});

const load = () => require('../../services/rerank');

describe('rerank — off / pass-through cases', () => {
  it('off mode: returns input verbatim, no fetch', async () => {
    process.env.RAG_RERANK_PROVIDER = 'off';
    const { rerank } = load();
    const result = await rerank('what is alpha', CHUNKS);
    expect(result).toBe(CHUNKS);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('default (no env): returns input verbatim, no fetch', async () => {
    const { rerank } = load();
    const result = await rerank('what is alpha', CHUNKS);
    expect(result).toBe(CHUNKS);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('fewer than 2 chunks: returns input verbatim, no fetch', async () => {
    process.env.RAG_RERANK_PROVIDER = 'cohere';
    process.env.COHERE_API_KEY = 'key-xyz';
    const { rerank } = load();
    const single = [CHUNKS[0]];
    const result = await rerank('what is alpha', single);
    expect(result).toBe(single);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('empty query: returns input verbatim, no fetch', async () => {
    process.env.RAG_RERANK_PROVIDER = 'cohere';
    process.env.COHERE_API_KEY = 'key-xyz';
    const { rerank } = load();
    const result = await rerank('', CHUNKS);
    expect(result).toBe(CHUNKS);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('rerank — cohere happy path', () => {
  it('POSTs correct body and reorders chunks with rerankScore', async () => {
    process.env.RAG_RERANK_PROVIDER = 'cohere';
    process.env.COHERE_API_KEY = 'test-cohere-key';
    const { rerank } = load();

    // API says chunk index 2 is most relevant, then 0, then 1
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          { index: 2, relevance_score: 0.95 },
          { index: 0, relevance_score: 0.80 },
          { index: 1, relevance_score: 0.60 },
        ],
      }),
    });

    const result = await rerank('gamma query', CHUNKS, { topN: 3 });

    // Verify POST body
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.cohere.com/v2/rerank');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.query).toBe('gamma query');
    expect(body.documents).toEqual(CHUNKS.map(c => c.content));
    expect(body.top_n).toBe(3);
    expect(body.model).toBe('rerank-english-v3.0');

    // Verify reordering and rerankScore
    expect(result[0].sourceId).toBe(3);
    expect(result[0].rerankScore).toBeCloseTo(0.95);
    expect(result[1].sourceId).toBe(1);
    expect(result[1].rerankScore).toBeCloseTo(0.80);
    expect(result[2].sourceId).toBe(2);
    expect(result[2].rerankScore).toBeCloseTo(0.60);
  });

  it('uses chunks.length as top_n when options.topN omitted', async () => {
    process.env.RAG_RERANK_PROVIDER = 'cohere';
    process.env.COHERE_API_KEY = 'test-cohere-key';
    const { rerank } = load();

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: CHUNKS.map((_, i) => ({ index: i, relevance_score: 0.5 })),
      }),
    });

    await rerank('some query', CHUNKS);
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.top_n).toBe(CHUNKS.length);
  });
});

describe('rerank — cohere error paths', () => {
  it('missing API key: returns input unchanged, no fetch', async () => {
    process.env.RAG_RERANK_PROVIDER = 'cohere';
    // COHERE_API_KEY intentionally not set
    const { rerank } = load();
    const result = await rerank('some query', CHUNKS);
    expect(result).toBe(CHUNKS);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('non-200 response: returns input unchanged', async () => {
    process.env.RAG_RERANK_PROVIDER = 'cohere';
    process.env.COHERE_API_KEY = 'test-key';
    const { rerank } = load();

    global.fetch.mockResolvedValueOnce({ ok: false, status: 429 });

    const result = await rerank('some query', CHUNKS);
    expect(result).toBe(CHUNKS);
  });

  it('network throw: returns input unchanged', async () => {
    process.env.RAG_RERANK_PROVIDER = 'cohere';
    process.env.COHERE_API_KEY = 'test-key';
    const { rerank } = load();

    global.fetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await rerank('some query', CHUNKS);
    expect(result).toBe(CHUNKS);
  });

  it('malformed payload (no results array): returns input unchanged', async () => {
    process.env.RAG_RERANK_PROVIDER = 'cohere';
    process.env.COHERE_API_KEY = 'test-key';
    const { rerank } = load();

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ unexpected: true }),
    });

    const result = await rerank('some query', CHUNKS);
    expect(result).toBe(CHUNKS);
  });
});
