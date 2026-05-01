/**
 * Ingest IB Mathematics past papers into GlobalDocuments + RAG embeddings.
 *
 * Mathematics papers (AA = Analysis & Approaches, AI = Applications & Interpretation):
 *   Paper 1: Short + extended response (no calculator for AA, calculator for AI)
 *   Paper 2: Extended response (calculator allowed)
 *   Paper 3: HL only — investigation/modeling
 *
 * No multiple choice in any Math paper.
 *
 * Usage:
 *   node server/scripts/ingest-mathematics.js [--dry-run] [--skip-embeddings] [--year 2024] [--preview]
 *
 * Expected directory structure:
 *   <INPUT_DIR>/
 *     2024/
 *       May 2024/
 *         Mathematics_paper_1_TZ1_HL.pdf
 *         Mathematics_paper_1_TZ1_HL_markscheme.pdf
 *         ...
 *
 * Supports both "Mathematics" and "Mathematics_AA" / "Mathematics_AI" filename prefixes.
 */

const {
    createIngester,
    chunkByQuestions,
    chunkMarkScheme,
} = require('./ingest-common');

const SUBJECT = 'Mathematics';
const INPUT_DIR = process.env.INGEST_DIR || './past-papers/Mathematics';

const CLEANING_RULES = [
    // Remove "Formula booklet" references
    { pattern: /Refer to the formula booklet\.?\s*/gi, replacement: '' },
    // Remove calculator instructions
    { pattern: /^(?:A )?[Gg]raphic display calculator is (?:required|not allowed).*$/gm, replacement: '' },
    // Remove "Maximum mark:" lines (already captured in prefix)
    { pattern: /^Maximum mark:\s*\d+\s*$/gm, replacement: '' },
];

// Math question patterns — no MCQ, all structured
const QUESTION_PATTERNS = [
    // Top-level: "1." or "1)" followed by anything (math questions often start with formulas, not words)
    /^(\d{1,2})\.\s*\(a\)/i,           // "1. (a)"
    /^(\d{1,2})\.\s+\S/,               // "1. Let f(x)..." / "1. Consider..."
    /^(\d{1,2})\)\s+\S/,               // "1) ..."
    /^\([a-z]{1,3}\)\s+/i,             // "(a)", "(b)", "(ii)"
    // Math-specific: "1. [N marks]" or "1. [Maximum mark: N]"
    /^(\d{1,2})\.\s*\[/i,              // "1. [6 marks]"
];

// Custom filename parser to handle Mathematics_AA / Mathematics_AI variants
function parseFilename(filename) {
    const isMarkScheme = /_markscheme\.pdf$/i.test(filename);
    const normalized = filename.replace(/__/g, '_');

    // Match: Mathematics_paper_1_TZ1_HL.pdf or Mathematics_AA_paper_1_TZ1_HL.pdf
    const match = normalized.match(
        /^Mathematics(?:_(AA|AI))?_paper_(\d)_(?:(TZ\d)_)?(HL|SL|HLSL)(?:_markscheme)?\.pdf$/i
    );
    if (!match) return null;

    return {
        variant: match[1] ? match[1].toUpperCase() : null,
        paper: match[2],
        tz: match[3] ? match[3].toUpperCase() : null,
        level: match[4].toUpperCase(),
        isMarkScheme,
    };
}

function chunkPaper(cleanedText, title, paperNum) {
    return chunkByQuestions(cleanedText, title, SUBJECT, {
        questionPatterns: QUESTION_PATTERNS,
        maxChunkChars: 2500,
        splitChars: 1000,
    });
}

function chunkMS(cleanedText, title) {
    return chunkMarkScheme(cleanedText, title, SUBJECT, {
        questionPatterns: [
            /^(\d{1,2})\.\s*\([a-z]\)/i,
            /^\([a-z]{1,3}\)\s/i,
            /^(\d{1,2})\.\s+/,
        ],
    });
}

createIngester({
    subject: SUBJECT,
    inputDir: INPUT_DIR,
    parseFilename,
    chunkPaper,
    chunkMS,
    cleaningRules: CLEANING_RULES,
}).run();
