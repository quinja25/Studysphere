'use strict';

// 1 token ≈ 3 chars (spec-defined approximation for this module)
const CHARS_PER_TOKEN = 3;

const DEFAULT_CHUNK_SIZE = 150;   // tokens
const DEFAULT_OVERLAP    = 50;    // tokens

/**
 * Simple sliding-window chunker. chunkSize and overlap are in tokens.
 * Returns [] for empty/whitespace-only input.
 */
function slidingWindow(text, chunkSize = DEFAULT_CHUNK_SIZE, overlap = DEFAULT_OVERLAP) {
    if (!text || !text.trim()) return [];

    const chunkChars   = chunkSize * CHARS_PER_TOKEN;
    const overlapChars = overlap   * CHARS_PER_TOKEN;

    if (text.length <= chunkChars) return [text.trim()];

    const chunks = [];
    let start = 0;

    while (start < text.length) {
        const end  = start + chunkChars;
        const slice = text.slice(start, end).trim();
        if (slice) chunks.push(slice);
        if (end >= text.length) break;
        start = end - overlapChars;
        if (start < 0) start = 0;
    }

    return chunks;
}

// ── per-type handlers ─────────────────────────────────────────────────────────

function chunkWiki(record, opts) {
    const { title = '', content = '' } = record;
    if (!content.trim()) return [];

    const MAX_SECTION = 1500;
    const HEADING_RE  = /^(#+\s.+)$/m;

    // Split on markdown headings, keeping the heading in each part.
    const parts = content.split(/^(?=#+\s)/m);

    // If no heading found (parts === 1 and no heading at start), fall back.
    const hasHeadings = parts.some(p => HEADING_RE.test(p.split('\n')[0]));
    if (!hasHeadings) {
        return slidingWindow(content, opts.fallbackChunkSize, opts.fallbackOverlap);
    }

    const chunks = [];
    for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;

        const lines   = trimmed.split('\n');
        const heading = HEADING_RE.test(lines[0]) ? lines[0].trim() : '';
        const prefix  = heading
            ? `${heading} [${title}]`
            : title;
        const body    = heading ? lines.slice(1).join('\n').trim() : trimmed;

        const full = body ? `${prefix}\n\n${body}` : prefix;

        if (full.length <= MAX_SECTION) {
            chunks.push(full);
        } else {
            // Oversized section: sliding-window the body, prefix only the first sub-chunk.
            const subChunks = slidingWindow(body, opts.fallbackChunkSize, opts.fallbackOverlap);
            subChunks.forEach((sc, i) => {
                chunks.push(i === 0 ? `${prefix}\n\n${sc}` : sc);
            });
        }
    }

    return chunks;
}

function chunkQuestion(record, opts) {
    const { title = '', body = '', acceptedAnswer } = record;
    if (!title.trim() && !body.trim()) return [];

    const MAX = 2000;
    const qPart  = `[Q] ${title}${body ? `\n\n${body}` : ''}`;
    const aPart  = acceptedAnswer ? `\n\n[Accepted Answer] ${acceptedAnswer}` : '';
    const full   = qPart + aPart;

    if (full.length <= MAX) return [full];

    // Oversized: keep Q+AcceptedAnswer as chunk 1, remainder via sliding window.
    const chunks = [full.slice(0, MAX)];
    const remainder = full.slice(MAX);
    if (remainder.trim()) {
        chunks.push(...slidingWindow(remainder, opts.fallbackChunkSize, opts.fallbackOverlap));
    }
    return chunks;
}

function chunkAnswer(record, opts) {
    const { content = '', questionTitle = '' } = record;
    if (!content.trim()) return [];

    const MAX     = 1500;
    const prefix  = `[Answer to: ${questionTitle}]`;
    const full    = `${prefix}\n\n${content}`;

    if (full.length <= MAX) return [full];

    const subChunks = slidingWindow(content, opts.fallbackChunkSize, opts.fallbackOverlap);
    return subChunks.map((sc, i) => (i === 0 ? `${prefix}\n\n${sc}` : sc));
}

function chunkPost(record, opts) {
    const { title = '', content = '' } = record;
    if (!content.trim()) return [];

    // Posts use 200-token chunks (≈600 chars), 50-token overlap.
    const POST_CHUNK = 200;
    const POST_OVERLAP = 50;

    const subChunks = slidingWindow(content, POST_CHUNK, POST_OVERLAP);
    return subChunks.map((sc, i) => (i === 0 && title ? `${title}\n\n${sc}` : sc));
}

function chunkResource(record, opts) {
    const { title = '', description = '', content = '' } = record;
    const MAX = 1200;

    const body = [description, content].filter(Boolean).join('\n\n');
    if (!body.trim()) return [];

    if (body.length <= MAX) return [body];

    // Long resource: sliding-window title+content, description always in chunk 1.
    const base = [title, content].filter(Boolean).join('\n\n');
    const subChunks = slidingWindow(base, opts.fallbackChunkSize, opts.fallbackOverlap);
    return subChunks.map((sc, i) => {
        if (i === 0) {
            return description ? `${description}\n\n${sc}` : sc;
        }
        return sc;
    });
}

// ── public API ────────────────────────────────────────────────────────────────

/**
 * Produce semantically meaningful chunks for a content record.
 *
 * @param {string} sourceType  'wiki'|'question'|'answer'|'post'|'resource'
 * @param {object} record      Content row; shape varies per type.
 * @param {object} [options]   { fallbackChunkSize, fallbackOverlap }
 * @returns {Array<string>}
 */
function chunkContent(sourceType, record, options = {}) {
    if (!record) return [];

    const opts = {
        fallbackChunkSize: options.fallbackChunkSize || DEFAULT_CHUNK_SIZE,
        fallbackOverlap:   options.fallbackOverlap   || DEFAULT_OVERLAP,
    };

    switch (sourceType) {
        case 'wiki':     return chunkWiki(record, opts);
        case 'question': return chunkQuestion(record, opts);
        case 'answer':   return chunkAnswer(record, opts);
        case 'post':     return chunkPost(record, opts);
        case 'resource': return chunkResource(record, opts);
        default: {
            // Fallback: concatenate any string fields and sliding-window them.
            const text = Object.values(record)
                .filter(v => typeof v === 'string')
                .join('\n\n');
            return slidingWindow(text, opts.fallbackChunkSize, opts.fallbackOverlap);
        }
    }
}

module.exports = { chunkContent, slidingWindow };
