const OpenAI = require('openai');

// ── Provider selection ──────────────────────────────────────────────────────
// Set OLLAMA_BASE_URL (e.g. http://localhost:11434) to use a local Ollama instance
// instead of OpenAI. The OpenAI SDK's OpenAI-compatible mode is used, so the rest
// of the codebase is unchanged.
//
// Recommended Ollama models:
//   Chat:       ollama pull llama3.2   (or mistral, qwen2.5, phi3, etc.)
//   Embeddings: ollama pull nomic-embed-text
//
// Required env vars:
//   OpenAI mode:  OPENAI_API_KEY
//   Ollama mode:  OLLAMA_BASE_URL  (OPENAI_API_KEY not needed)
//   Both modes:   AI_MODEL, RAG_EMBEDDING_MODEL (optional overrides)

let client = null;

function getClient() {
    if (client) return client;
    if (process.env.OLLAMA_BASE_URL) {
        client = new OpenAI({
            baseURL: process.env.OLLAMA_BASE_URL.replace(/\/$/, '') + '/v1',
            apiKey: 'ollama', // required by the SDK, not validated by Ollama
        });
        return client;
    }
    if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is not set. Add it to server/.env (or set OLLAMA_BASE_URL to use a local model)');
    }
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return client;
}

function getAIModel() {
    return process.env.AI_MODEL || (process.env.OLLAMA_BASE_URL ? 'llama3.2' : 'gpt-4o-mini');
}

function getEmbeddingModel() {
    return process.env.RAG_EMBEDDING_MODEL || (process.env.OLLAMA_BASE_URL ? 'nomic-embed-text' : 'text-embedding-3-small');
}

const EMBEDDING_DIMENSIONS = parseInt(process.env.RAG_EMBEDDING_DIMENSIONS || '512', 10);

/**
 * Send a chat completion request.
 * Works with OpenAI and any Ollama model.
 */
async function chatCompletion(messages, options = {}) {
    const params = {
        model: options.model || getAIModel(),
        messages,
        max_tokens: options.max_tokens || 1024,
        temperature: options.temperature ?? 0.7,
    };
    // json_object response_format is OpenAI-specific — skip for Ollama
    if (options.response_format && !process.env.OLLAMA_BASE_URL) {
        params.response_format = options.response_format;
    }
    const response = await getClient().chat.completions.create(params);
    const choice = response.choices[0];
    const usage = response.usage || {};
    return {
        content: choice.message.content,
        tokens: (usage.prompt_tokens || 0) + (usage.completion_tokens || 0),
    };
}

/**
 * Generate an embedding vector for a single text.
 * Uses 512-dimension Matryoshka truncation on OpenAI; Ollama uses its native dimensions.
 */
async function createEmbedding(text) {
    const params = {
        model: getEmbeddingModel(),
        input: text,
    };
    // Ollama does not support the `dimensions` parameter
    if (!process.env.OLLAMA_BASE_URL) {
        params.dimensions = EMBEDDING_DIMENSIONS;
    }
    const response = await getClient().embeddings.create(params);
    return {
        embedding: response.data[0].embedding,
        tokens: response.usage?.total_tokens || 0,
    };
}

/**
 * Generate embeddings for multiple texts in a single API call (batch).
 */
async function createEmbeddingBatch(texts) {
    if (!texts || texts.length === 0) return [];
    const params = {
        model: getEmbeddingModel(),
        input: texts,
    };
    if (!process.env.OLLAMA_BASE_URL) {
        params.dimensions = EMBEDDING_DIMENSIONS;
    }
    const response = await getClient().embeddings.create(params);
    const tokensPerChunk = Math.round((response.usage?.total_tokens || 0) / texts.length);
    return response.data.map(item => ({
        embedding: item.embedding,
        tokens: tokensPerChunk,
    }));
}

/**
 * Returns a human-readable label for the current AI provider.
 * Used in API responses and UI badges.
 */
function getProviderLabel() {
    if (process.env.OLLAMA_BASE_URL) return `Ollama (${getAIModel()})`;
    return `OpenAI (${getAIModel()})`;
}

module.exports = { chatCompletion, createEmbedding, createEmbeddingBatch, getProviderLabel };
