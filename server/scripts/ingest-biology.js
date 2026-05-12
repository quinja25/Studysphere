/**
 * Ingest IB Biology past papers into GlobalDocuments + RAG embeddings.
 *
 * Biology papers:
 *   Paper 1: Multiple choice (30 SL / 40 HL questions)
 *   Paper 2: Data-based + structured + extended response
 *   Paper 3: Options (HL only) — structured questions
 *
 * Usage:
 *   node server/scripts/ingest-biology.js [--dry-run] [--skip-embeddings] [--year 2024] [--preview]
 *
 * Expected directory structure:
 *   <INPUT_DIR>/
 *     2024/
 *       May 2024/
 *         Biology_paper_1_TZ1_HL.pdf
 *         Biology_paper_1_TZ1_HL_markscheme.pdf
 *         ...
 */

const {
    createIngester,
    chunkByQuestions,
    chunkMCQ,
    chunkMarkScheme,
} = require('./ingest-common');

const path = require('path');

const SUBJECT = 'Biology';
const INPUT_DIR = process.env.INGEST_DIR || path.join(__dirname, '../../past_papers/Biology Past Papers');

const CLEANING_RULES = [
    // Remove "Data booklet" references
    { pattern: /Refer to the data booklet\.?\s*/gi, replacement: '' },
    // Remove diagram reference placeholders that pdf-parse can't render
    { pattern: /\[Diagram\]/gi, replacement: '[See original paper for diagram]' },
];

// Paper 2/3 question patterns
const STRUCTURED_PATTERNS = [
    /^(\d{1,2})\.\s*\(a\)/i,
    /^(\d{1,2})\.\s+[A-Z]/,
    /^\([a-z]{1,3}\)\s+/i,
    /^Part\s+\([a-z]\)/i,
    // Biology-specific: questions reference figures, tables, micrographs
    /^(\d{1,2})\s*[\.\)]\s+(?:The|A|An|In|Using|With|Consider|State|Calculate|Determine|Explain|Describe|Outline|Deduce|Suggest|Draw|Sketch|Identify|Compare|Discuss|Annotate|Label|List|Distinguish|Figure|Table)/i,
];

function chunkPaper(cleanedText, title, paperNum) {
    if (paperNum === '1' || paperNum === '1A') {
        return chunkMCQ(cleanedText, title, SUBJECT);
    }
    return chunkByQuestions(cleanedText, title, SUBJECT, {
        questionPatterns: STRUCTURED_PATTERNS,
        maxChunkChars: 2000,
        splitChars: 800,
    });
}

function chunkMS(cleanedText, title) {
    if (/Paper\s*1/i.test(title)) {
        const prefix = `IB Past Paper Mark Scheme: ${title}\nSubject: ${SUBJECT}\nMultiple Choice Answer Key`;
        return [`${prefix}\n\n${cleanedText.slice(0, 3000)}`];
    }
    return chunkMarkScheme(cleanedText, title, SUBJECT, {
        questionPatterns: [
            /^(\d{1,2})\.\s*\([a-z]\)/i,
            /^\([a-z]{1,3}\)\s/i,
        ],
    });
}

createIngester({
    subject: SUBJECT,
    inputDir: INPUT_DIR,
    chunkPaper,
    chunkMS,
    cleaningRules: CLEANING_RULES,
}).run();
