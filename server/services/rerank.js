'use strict';

const PROVIDER = (process.env.RAG_RERANK_PROVIDER || 'off').toLowerCase();
const OLLAMA_BASE = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.RAG_RERANK_MODEL || 'bge-reranker-base';

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

async function rerankCohere(query, chunks, topN) {
  const apiKey = process.env.COHERE_API_KEY;
  if (!apiKey) {
    console.error('[rerank] COHERE_API_KEY not set — skipping rerank');
    return chunks;
  }

  let res;
  try {
    res = await fetch('https://api.cohere.com/v2/rerank', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'rerank-english-v3.0',
        query,
        documents: chunks.map(c => c.content),
        top_n: topN,
      }),
    });
  } catch (err) {
    console.error('[rerank] cohere fetch error:', err.message);
    return chunks;
  }

  if (!res.ok) {
    console.error('[rerank] cohere non-200:', res.status);
    return chunks;
  }

  let body;
  try {
    body = await res.json();
  } catch (err) {
    console.error('[rerank] cohere bad JSON:', err.message);
    return chunks;
  }

  if (!Array.isArray(body?.results)) {
    console.error('[rerank] cohere unexpected payload shape');
    return chunks;
  }

  return body.results.map(r => ({
    ...chunks[r.index],
    rerankScore: r.relevance_score,
  }));
}

// Ollama lacks a true cross-encoder; we embed query + each chunk and rank by cosine sim.
async function rerankOllama(query, chunks) {
  const embed = async (input) => {
    let res;
    try {
      res = await fetch(`${OLLAMA_BASE}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: OLLAMA_MODEL, input }),
      });
    } catch (err) {
      throw new Error(`ollama fetch: ${err.message}`);
    }
    if (!res.ok) throw new Error(`ollama status ${res.status}`);
    const data = await res.json();
    // /api/embed returns { embeddings: [[...]] }
    return data.embeddings?.[0] ?? data.embedding;
  };

  let queryVec;
  try {
    queryVec = await embed(query);
  } catch (err) {
    console.error('[rerank] ollama query embed error:', err.message);
    return chunks;
  }

  const scored = [];
  for (const chunk of chunks) {
    try {
      const vec = await embed(chunk.content);
      scored.push({ ...chunk, rerankScore: cosine(queryVec, vec) });
    } catch (err) {
      console.error('[rerank] ollama chunk embed error:', err.message);
      return chunks;
    }
  }

  return scored.sort((a, b) => b.rerankScore - a.rerankScore);
}

async function rerank(query, chunks, options = {}) {
  if (PROVIDER === 'off' || !query || chunks.length < 2) return chunks;

  const topN = options.topN || chunks.length;

  if (PROVIDER === 'cohere') return rerankCohere(query, chunks, topN);
  if (PROVIDER === 'ollama') return rerankOllama(query, chunks);

  return chunks;
}

module.exports = { rerank };
