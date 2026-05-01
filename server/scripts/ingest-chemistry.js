/**
 * Ingest IB Chemistry past papers into GlobalDocuments + RAG embeddings.
 *
 * Chemistry papers:
 *   Paper 1: Multiple choice (30 SL / 40 HL questions)
 *   Paper 2: Data-based + structured + extended response
 *   Paper 3: Options (HL only) — structured questions
 *
 * Usage:
 *   node server/scripts/ingest-chemistry.js [--dry-run] [--skip-embeddings] [--year 2024] [--preview]
 *
 * Expected directory structure:
 *   <INPUT_DIR>/
 *     2024/
 *       May 2024/
 *         Chemistry_paper_1_TZ1_HL.pdf
 *         Chemistry_paper_1_TZ1_HL_markscheme.pdf
 *         Chemistry_paper_2_TZ1_SL.pdf
 *         ...
 */

const {
    createIngester,
    cleanPDFText,
    chunkByQuestions,
    chunkMCQ,
    chunkMarkScheme,
} = require('./ingest-common');

const SUBJECT = 'Chemistry';
const INPUT_DIR = process.env.INGEST_DIR || './past-papers/Chemistry';

// Chemistry-specific cleaning rules (applied after IB-universal cleaning)
const CLEANING_RULES = [
    // Remove "Data booklet" references that repeat on every page
    { pattern: /Refer to the data booklet\.?\s*/gi, replacement: '' },
    // Remove periodic table page markers
    { pattern: /^A clean copy of the periodic table.*$/gm, replacement: '' },
];

// Paper 2/3 question patterns (structured + extended response)
const STRUCTURED_PATTERNS = [
    /^(\d{1,2})\.\s*\(a\)/i,           // "1. (a)" — top-level with first sub
    /^(\d{1,2})\.\s+[A-Z]/,            // "1. Define..." / "2. Explain..."
    /^\([a-z]{1,3}\)\s+/i,             // "(a)", "(b)", "(iv)"
    /^Part\s+\([a-z]\)/i,              // "Part (a)"
    /^(\d{1,2})\s*[\.\)]\s+(?:The|A|An|In|Using|With|Consider|State|Calculate|Determine|Explain|Describe|Outline|Deduce|Suggest|Draw|Sketch|Identify|Compare)/i,
];

// MCQ answer patterns for Paper 1 mark schemes
const MCQ_MS_PATTERNS = [
    /^(\d{1,2})\s+[A-D]\s*$/,          // "1 C" or "1  D"
    /^(\d{1,2})\.\s*[A-D]\s*$/,        // "1. C"
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
    // Paper 1 mark schemes are just answer keys — chunk differently
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
