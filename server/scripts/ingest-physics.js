/**
 * Ingest IB Physics past papers into GlobalDocuments + RAG embeddings.
 *
 * Physics papers:
 *   Paper 1: Multiple choice (30 SL / 40 HL questions)
 *   Paper 2: Data-based + structured + extended response
 *   Paper 3: Experimental / options (HL only)
 *
 * Usage:
 *   node server/scripts/ingest-physics.js [--dry-run] [--skip-embeddings] [--year 2024] [--preview]
 *
 * Expected directory structure:
 *   <INPUT_DIR>/
 *     2024/
 *       May 2024/
 *         Physics_paper_1_TZ1_HL.pdf
 *         Physics_paper_1_TZ1_HL_markscheme.pdf
 *         ...
 */

const {
    createIngester,
    chunkByQuestions,
    chunkMCQ,
    chunkMarkScheme,
} = require('./ingest-common');

const SUBJECT = 'Physics';
const INPUT_DIR = process.env.INGEST_DIR || './past-papers/Physics';

const CLEANING_RULES = [
    // Remove "Data booklet" / "Physics data booklet" references
    { pattern: /Refer to the (?:physics )?data booklet\.?\s*/gi, replacement: '' },
    // Remove SI unit table references
    { pattern: /^A clean copy of the.*data booklet.*$/gm, replacement: '' },
];

// Paper 2/3 question patterns
const STRUCTURED_PATTERNS = [
    /^(\d{1,2})\.\s*\(a\)/i,
    /^(\d{1,2})\.\s+[A-Z]/,
    /^\([a-z]{1,3}\)\s+/i,
    /^Part\s+\([a-z]\)/i,
    // Physics-specific: questions often start with scenario setup
    /^(\d{1,2})\s*[\.\)]\s+(?:A|An|The|Two|Three|Four|In|On|At|Consider|State|Calculate|Determine|Explain|Describe|Outline|Deduce|Suggest|Draw|Sketch|Identify|Estimate|Show|Derive|Define|Distinguish|Compare|Discuss)/i,
];

function chunkPaper(cleanedText, title, paperNum) {
    if (paperNum === 1) {
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
