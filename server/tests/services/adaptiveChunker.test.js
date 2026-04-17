'use strict';

const { chunkContent, slidingWindow } = require('../../services/adaptiveChunker');

// ── helpers ───────────────────────────────────────────────────────────────────

/** Build a string of approximately n characters. */
function str(n, char = 'a') { return char.repeat(n); }

// ── wiki ──────────────────────────────────────────────────────────────────────

describe('chunkContent – wiki', () => {
    it('3 sections → 3 chunks, each contains heading and article title', () => {
        const record = {
            title: 'Physics',
            content: [
                '## Kinematics\nObjects in motion.',
                '## Dynamics\nForces and mass.',
                '## Thermodynamics\nHeat and energy.',
            ].join('\n'),
        };
        const chunks = chunkContent('wiki', record);
        expect(chunks).toHaveLength(3);
        chunks.forEach(c => expect(c).toContain('Physics'));
        expect(chunks[0]).toContain('## Kinematics');
        expect(chunks[1]).toContain('## Dynamics');
        expect(chunks[2]).toContain('## Thermodynamics');
    });

    it('no headings → falls back to sliding window (may be 1+ chunks)', () => {
        const record = { title: 'Maths', content: 'Just plain prose without any markdown headings at all.' };
        const chunks = chunkContent('wiki', record);
        expect(Array.isArray(chunks)).toBe(true);
        expect(chunks.length).toBeGreaterThanOrEqual(1);
        // Should NOT contain article title prefix (pure sliding-window fallback)
        expect(chunks[0]).not.toMatch(/\[Maths\]/);
    });

    it('oversize section → splits into multiple chunks', () => {
        // 1 section with body > 1500 chars
        const bigBody = str(1600);
        const record  = { title: 'CS', content: `## Big Section\n${bigBody}` };
        const chunks  = chunkContent('wiki', record);
        expect(chunks.length).toBeGreaterThan(1);
        // First chunk must contain the heading
        expect(chunks[0]).toContain('## Big Section');
    });

    it('empty content → []', () => {
        expect(chunkContent('wiki', { title: 'X', content: '' })).toEqual([]);
        expect(chunkContent('wiki', { title: 'X', content: '   ' })).toEqual([]);
    });
});

// ── question ──────────────────────────────────────────────────────────────────

describe('chunkContent – question', () => {
    it('with accepted answer → 1 chunk containing both [Q] and [Accepted Answer]', () => {
        const record = {
            title: 'What is entropy?',
            body:  'Please explain in simple terms.',
            acceptedAnswer: 'Entropy is a measure of disorder in a system.',
        };
        const chunks = chunkContent('question', record);
        expect(chunks).toHaveLength(1);
        expect(chunks[0]).toContain('[Q] What is entropy?');
        expect(chunks[0]).toContain('[Accepted Answer]');
        expect(chunks[0]).toContain('Entropy is a measure');
    });

    it('without accepted answer → 1 chunk with [Q] prefix only', () => {
        const record = { title: 'What is gravity?', body: 'Explain gravity.', acceptedAnswer: null };
        const chunks = chunkContent('question', record);
        expect(chunks).toHaveLength(1);
        expect(chunks[0]).toContain('[Q] What is gravity?');
        expect(chunks[0]).not.toContain('[Accepted Answer]');
    });

    it('empty title and body → []', () => {
        expect(chunkContent('question', { title: '', body: '', acceptedAnswer: null })).toEqual([]);
    });
});

// ── answer ────────────────────────────────────────────────────────────────────

describe('chunkContent – answer', () => {
    it('small answer → 1 chunk with [Answer to: ...] prefix', () => {
        const record = { content: 'The answer is 42.', questionTitle: 'What is the answer?' };
        const chunks = chunkContent('answer', record);
        expect(chunks).toHaveLength(1);
        expect(chunks[0]).toContain('[Answer to: What is the answer?]');
        expect(chunks[0]).toContain('The answer is 42.');
    });

    it('oversized answer → multiple chunks, first starts with [Answer to: ...]', () => {
        const record = {
            content: str(1600),
            questionTitle: 'Big question',
        };
        const chunks = chunkContent('answer', record);
        expect(chunks.length).toBeGreaterThan(1);
        expect(chunks[0]).toContain('[Answer to: Big question]');
    });

    it('empty content → []', () => {
        expect(chunkContent('answer', { content: '', questionTitle: 'Q' })).toEqual([]);
    });
});

// ── post ──────────────────────────────────────────────────────────────────────

describe('chunkContent – post', () => {
    it('short post → 1 chunk with title prefix', () => {
        const record = { title: 'Study Tips', content: 'Use spaced repetition.' };
        const chunks = chunkContent('post', record);
        expect(chunks).toHaveLength(1);
        expect(chunks[0]).toContain('Study Tips');
        expect(chunks[0]).toContain('Use spaced repetition.');
    });

    it('long post → multiple ~200-token chunks, title only in chunk 1', () => {
        // 200 tokens ≈ 600 chars (3 chars/token); generate >600 chars
        const record = { title: 'My Post', content: str(1500) };
        const chunks = chunkContent('post', record);
        expect(chunks.length).toBeGreaterThan(1);
        expect(chunks[0]).toContain('My Post');
        // Subsequent chunks should NOT repeat title
        for (let i = 1; i < chunks.length; i++) {
            expect(chunks[i]).not.toContain('My Post');
        }
    });

    it('empty content → []', () => {
        expect(chunkContent('post', { title: 'T', content: '' })).toEqual([]);
    });
});

// ── resource ──────────────────────────────────────────────────────────────────

describe('chunkContent – resource', () => {
    it('short resource → description + content in 1 chunk', () => {
        const record = { title: 'Notes', description: 'A handy guide.', content: 'Content here.' };
        const chunks = chunkContent('resource', record);
        expect(chunks).toHaveLength(1);
        expect(chunks[0]).toContain('A handy guide.');
        expect(chunks[0]).toContain('Content here.');
    });

    it('long resource → multiple chunks, description in chunk 1', () => {
        const record = {
            title: 'Textbook',
            description: 'Essential reading for CS students.',
            content: str(1300),
        };
        const chunks = chunkContent('resource', record);
        expect(chunks.length).toBeGreaterThan(1);
        expect(chunks[0]).toContain('Essential reading for CS students.');
    });

    it('empty description and content → []', () => {
        expect(chunkContent('resource', { title: 'T', description: '', content: '' })).toEqual([]);
    });
});

// ── unknown type ──────────────────────────────────────────────────────────────

describe('chunkContent – unknown type', () => {
    it('unknown type → fallback sliding window on string field values', () => {
        const record = { body: 'Some random text content that should still be chunked properly.' };
        const chunks = chunkContent('diary', record);
        expect(Array.isArray(chunks)).toBe(true);
        expect(chunks.length).toBeGreaterThanOrEqual(1);
    });

    it('unknown type with long text → produces multiple chunks', () => {
        const record = { body: str(1000) };
        const chunks = chunkContent('diary', record, { fallbackChunkSize: 50, fallbackOverlap: 10 });
        expect(chunks.length).toBeGreaterThan(1);
    });
});

// ── null / empty guards ───────────────────────────────────────────────────────

describe('chunkContent – null / empty guards', () => {
    it('null record → []', () => {
        expect(chunkContent('wiki', null)).toEqual([]);
        expect(chunkContent('question', null)).toEqual([]);
        expect(chunkContent('answer', null)).toEqual([]);
    });

    it('whitespace-only content → []', () => {
        expect(chunkContent('post', { title: '', content: '   \n  ' })).toEqual([]);
        expect(chunkContent('answer', { content: '   ', questionTitle: '' })).toEqual([]);
    });
});

// ── slidingWindow internals ───────────────────────────────────────────────────

describe('slidingWindow', () => {
    it('short text → single chunk', () => {
        expect(slidingWindow('hello world', 100, 20)).toHaveLength(1);
    });

    it('empty / whitespace → []', () => {
        expect(slidingWindow('')).toEqual([]);
        expect(slidingWindow('   ')).toEqual([]);
        expect(slidingWindow(null)).toEqual([]);
    });

    it('correct chunk count for known input with no overlap', () => {
        // chunkSize=10 tokens → 30 chars; overlap=0; text=90 chars → 3 chunks
        const text = str(90);
        const chunks = slidingWindow(text, 10, 0);
        expect(chunks).toHaveLength(3);
    });

    it('overlap causes subsequent chunks to start before previous chunk end', () => {
        // chunkSize=10 tokens (30 chars), overlap=5 tokens (15 chars)
        // chunk 1: [0, 30), chunk 2: [15, 45), chunk 3: [30, 60) ... on 90-char input → 4 chunks
        const text = str(90, 'x');
        const chunks = slidingWindow(text, 10, 5);
        expect(chunks.length).toBeGreaterThan(3);
        // Each chunk should be non-empty
        chunks.forEach(c => expect(c.length).toBeGreaterThan(0));
    });

    it('respects custom chunkSize and overlap via options passthrough', () => {
        const text = str(600);
        const small  = slidingWindow(text, 20, 5);
        const larger = slidingWindow(text, 100, 20);
        expect(small.length).toBeGreaterThan(larger.length);
    });
});
