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

const path = require('path');

const SUBJECT = 'Physics';
const INPUT_DIR = process.env.INGEST_DIR || path.join(__dirname, '../../past_papers/Physics Past Papers');

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

/**
 * Physics folders look like:
 *   2024 Examination Session/
 *     May 2024 Examination Session/
 *       PDFs/
 *         Experimental sciences/
 *           Physics_paper_1_TZ1_HL.pdf
 *
 * Standard scanner expects: 2024/May 2024/Physics_paper_1_TZ1_HL.pdf
 */
function scanPhysicsPairs(inputDir, subject, parseFilename, yearFilter) {
    const fs = require('fs');

    if (!fs.existsSync(inputDir)) {
        console.error(`Input directory not found: ${inputDir}`);
        process.exit(1);
    }

    const pairs = [];

    for (const yearEntry of fs.readdirSync(inputDir)) {
        const yearMatch = yearEntry.match(/\b(\d{4})\b/);
        if (!yearMatch) continue;
        const year = yearMatch[1];
        if (yearFilter && year !== yearFilter) continue;

        const yearPath = path.join(inputDir, yearEntry);
        if (!fs.statSync(yearPath).isDirectory()) continue;

        for (const sessionEntry of fs.readdirSync(yearPath)) {
            const sessionMatch = sessionEntry.match(/^(May|November)\s+\d{4}/i);
            if (!sessionMatch) continue;

            const sessionPath = path.join(yearPath, sessionEntry);
            if (!fs.statSync(sessionPath).isDirectory()) continue;

            // PDFs may be directly in sessionPath or nested under PDFs/Experimental sciences/
            const candidates = [
                sessionPath,
                path.join(sessionPath, 'PDFs', 'Experimental sciences'),
                path.join(sessionPath, 'PDFs'),
            ];
            const pdfDir = candidates.find(d => fs.existsSync(d) && fs.readdirSync(d).some(f => f.endsWith('.pdf')));
            if (!pdfDir) continue;

            const files = fs.readdirSync(pdfDir).filter(f => f.endsWith('.pdf'));
            const groups = {};

            for (const file of files) {
                const parsed = parseFilename(file);
                if (!parsed) {
                    console.warn(`  [SKIP] ${year}/${sessionEntry}/${file}`);
                    continue;
                }
                const key = `P${parsed.paper}_${parsed.tz || 'noTZ'}_${parsed.level}`;
                if (!groups[key]) groups[key] = { parsed, question: null, markScheme: null };
                if (parsed.isMarkScheme) {
                    groups[key].markScheme = path.join(pdfDir, file);
                } else {
                    groups[key].question = path.join(pdfDir, file);
                }
            }

            for (const group of Object.values(groups)) {
                const sessionName = sessionMatch[1]; // "May" or "November"
                const parts = [`IB ${subject}`, `Paper ${group.parsed.paper}`];
                if (group.parsed.tz) parts.push(group.parsed.tz);
                parts.push(group.parsed.level);
                parts.push(`— ${sessionName} ${year}`);

                pairs.push({
                    year,
                    session: sessionName,
                    title: parts.join(' '),
                    questionPath: group.question,
                    markSchemePath: group.markScheme,
                    parsed: group.parsed,
                });
            }
        }
    }

    return pairs;
}

createIngester({
    subject: SUBJECT,
    inputDir: INPUT_DIR,
    scanPairs: scanPhysicsPairs,
    chunkPaper,
    chunkMS,
    cleaningRules: CLEANING_RULES,
}).run();
