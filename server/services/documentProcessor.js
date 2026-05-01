const pdfParse = require('pdf-parse');
const { chunkText } = require('./embeddingService');
const { cleanPDFText } = require('../scripts/ingest-common');

// IB command terms — used to annotate past paper chunk prefixes
const IB_COMMAND_TERMS = [
    'analyse', 'analyze', 'calculate', 'comment', 'compare', 'construct',
    'contrast', 'deduce', 'define', 'demonstrate', 'describe', 'design',
    'determine', 'differentiate', 'discuss', 'distinguish', 'draw',
    'estimate', 'evaluate', 'examine', 'explain', 'identify', 'justify',
    'label', 'list', 'measure', 'outline', 'predict', 'sketch', 'state',
    'suggest', 'summarize', 'summarise',
];

// Lines that look like textbook section headers
const HEADER_REGEXES = [
    /^chapter\s+\d+/i,               // "Chapter 3" / "Chapter 3: Title"
    /^section\s+\d+/i,               // "Section 2.1"
    /^unit\s+\d+/i,                  // "Unit 1"
    /^part\s+\d+/i,                  // "Part 1"
    /^\d{1,2}\.\d{1,2}\s+[A-Z]/,    // "1.2 Membrane Structure"
    /^\d{1,2}\s+[A-Z][a-z]{2,}/,    // "3 Cell Biology"
    /^[A-Z][A-Z\s\-]{5,50}$/,       // "CELL BIOLOGY" / "THE CELL MEMBRANE"
];

// Lines that look like past paper question starts (conservative — avoid false positives)
const QUESTION_REGEXES = [
    /^Q\.?\s*\d{1,2}[\.\)]/i,       // Q1. / Q.1) / Q2.
    /^\d{1,2}\s*[\.\)]\s+[A-Z]/,    // "1. Explain..." / "2) Describe..."
    /^\([a-z]{1,2}\)\s+\S/,         // "(a) Outline..." / "(iv) Calculate..."
    /^Part\s+\([a-z]\)/i,           // "Part (a)"
];

function isHeader(line) {
    const t = line.trim();
    // Must be non-empty, not too long, and must not end with sentence punctuation
    if (!t || t.length > 100 || /[.!?,;]$/.test(t)) return false;
    return HEADER_REGEXES.some(r => r.test(t));
}

function isQuestionStart(line) {
    const t = line.trim();
    if (!t) return false;
    return QUESTION_REGEXES.some(r => r.test(t));
}

function extractMarks(text) {
    // Match "[4 marks]", "(4 marks)", "4 marks" near end of line
    const m = text.match(/\[(\d+)\s*marks?\]/i)
        || text.match(/\((\d+)\s*marks?\)/i)
        || text.match(/(\d+)\s*marks?\b/i);
    return m ? parseInt(m[1]) : null;
}

function extractCommandTerm(text) {
    const lower = text.toLowerCase();
    // Find the first command term that appears in the first 100 chars of the question
    const head = lower.slice(0, 100);
    for (const term of IB_COMMAND_TERMS) {
        // Match whole word
        if (new RegExp(`\\b${term}\\b`).test(head)) {
            return term.charAt(0).toUpperCase() + term.slice(1);
        }
    }
    return null;
}

/**
 * Extract text from a PDF buffer.
 * Returns { text, pages }.
 */
async function extractPDFText(buffer) {
    const data = await pdfParse(buffer);
    return { text: data.text, pages: data.numpages };
}

/**
 * Chunk a textbook by detecting section headers as boundaries.
 * Each section is chunked independently with its header in the prefix,
 * so every chunk knows which chapter/section it came from.
 */
function chunkTextbook(rawText, title, subject) {
    const lines = rawText.split('\n');
    const sections = [];
    let currentHeader = null;
    let currentLines = [];

    for (const line of lines) {
        if (isHeader(line)) {
            // Save the current section if it has content
            const body = currentLines.join('\n').trim();
            if (body) sections.push({ header: currentHeader, body });
            currentHeader = line.trim();
            currentLines = [];
        } else {
            currentLines.push(line);
        }
    }
    // Save the last section
    const body = currentLines.join('\n').trim();
    if (body) sections.push({ header: currentHeader, body });

    const TEXTBOOK_CHUNK_SIZE = 300; // larger than default 150 — textbook prose is denser
    const results = [];

    for (const section of sections) {
        const prefix = [
            `Textbook: ${title}`,
            section.header ? `Section: ${section.header}` : null,
            `Subject: ${subject || 'General'}`,
        ].filter(Boolean).join('\n');

        results.push(...chunkText(section.body, prefix, TEXTBOOK_CHUNK_SIZE));
    }

    // If no sections were detected (no headers found), fall back to flat chunking
    if (results.length === 0) {
        const prefix = `Textbook: ${title}\nSubject: ${subject || 'General'}`;
        results.push(...chunkText(rawText, prefix, TEXTBOOK_CHUNK_SIZE));
    }

    return results;
}

/**
 * Chunk a past paper by grouping content under each question.
 * Each question becomes its own chunk (not split unless very long),
 * with marks and command term in the prefix for precise retrieval.
 */
function chunkPastPaper(rawText, title, subject) {
    const lines = rawText.split('\n');
    const questions = [];
    let currentLabel = null;
    let currentLines = [];

    for (const line of lines) {
        if (isQuestionStart(line)) {
            const body = currentLines.join('\n').trim();
            if (body) questions.push({ label: currentLabel, body });
            currentLabel = line.trim();
            currentLines = [];
        } else {
            currentLines.push(line);
        }
    }
    const body = currentLines.join('\n').trim();
    if (body) questions.push({ label: currentLabel, body });

    const results = [];

    for (const q of questions) {
        const fullText = [q.label, q.body].filter(Boolean).join('\n').trim();
        if (!fullText) continue;

        const marks = extractMarks(fullText);
        const commandTerm = extractCommandTerm(fullText);

        const prefix = [
            `IB Past Paper: ${title}`,
            `Subject: ${subject || 'General'}`,
            q.label ? `Question: ${q.label.slice(0, 80)}` : null,
            marks ? `[${marks} marks]` : null,
            commandTerm ? `Command Term: ${commandTerm}` : null,
        ].filter(Boolean).join('\n');

        // Short questions (< 800 chars): one chunk. Long ones: split at 200 tokens.
        if (fullText.length <= 800) {
            results.push(`${prefix}\n\n${fullText}`);
        } else {
            results.push(...chunkText(q.body, prefix, 200));
        }
    }

    // If no questions detected, fall back to flat chunking
    if (results.length === 0) {
        const prefix = `IB Past Paper: ${title}\nSubject: ${subject || 'General'}`;
        results.push(...chunkText(rawText, prefix, 200));
    }

    return results;
}

/**
 * Process an uploaded PDF buffer into an array of text chunks ready for embedding.
 * docType drives the chunking strategy.
 *
 * @param {Buffer} buffer - PDF file buffer
 * @param {{ title, subject, docType }} meta
 * @returns {{ chunks: string[], pages: number }}
 */
async function processDocument(buffer, { title, subject, docType }) {
    const { text: rawText, pages } = await extractPDFText(buffer);
    const text = cleanPDFText(rawText);

    let chunks;
    switch (docType) {
        case 'textbook':
            chunks = chunkTextbook(text, title, subject);
            break;
        case 'past_paper':
            chunks = chunkPastPaper(text, title, subject);
            break;
        default: {
            // notes / other: standard chunking with doc context in prefix
            const prefix = `Document: ${title}\nSubject: ${subject || 'General'}`;
            chunks = chunkText(text, prefix);
            break;
        }
    }

    return { chunks, pages };
}

module.exports = { processDocument, extractPDFText };
