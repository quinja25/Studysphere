/**
 * Ingest IB textbook PDFs into GlobalDocuments + RAG embeddings.
 *
 * Textbooks complement past papers: past papers test retrieval of exam-style Q&A,
 * textbooks provide conceptual explanations, definitions, and worked examples.
 *
 * Chunking strategy: section-based (headings + paragraphs), not question-based.
 * Chunks are larger (up to 1200 chars) to preserve explanatory context.
 *
 * Usage:
 *   node server/scripts/ingest-textbook.js [--dry-run] [--skip-embeddings] [--preview]
 *
 * Required env:
 *   INGEST_DIR   — path to folder of textbook PDFs (flat or one level deep)
 *   SUBJECT      — e.g. "Economics", "Biology", "Chemistry", "Physics", "Mathematics"
 *   CURRICULUM   — e.g. "IB" (default: IB)
 *
 * Example:
 *   INGEST_DIR="C:\Users\jaeyo\OneDrive\Desktop\업무용\Textbooks\Economics" \
 *   SUBJECT=Economics node server/scripts/ingest-textbook.js --skip-embeddings
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs   = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

const SUBJECT    = process.env.SUBJECT    || 'General';
const CURRICULUM = process.env.CURRICULUM || 'IB';
const INPUT_DIR  = process.env.INGEST_DIR;

if (!INPUT_DIR) {
    console.error('Set INGEST_DIR to the folder containing textbook PDFs.');
    process.exit(1);
}

const args          = process.argv.slice(2);
const DRY_RUN       = args.includes('--dry-run');
const SKIP_EMBED    = args.includes('--skip-embeddings');
const PREVIEW       = args.includes('--preview');

// ── Cleaning ──────────────────────────────────────────────────────

const CLEANING_RULES = [
    { pattern: /\f/g,                              replacement: '\n' },
    { pattern: /(\w)-\n(\w)/g,                     replacement: '$1$2' },   // dehyphenate
    { pattern: /\n{3,}/g,                          replacement: '\n\n' },
    { pattern: /^\s*(Page \d+|©.*|ISBN.*)\s*$/gim, replacement: '' },
    { pattern: /[ \t]{2,}/g,                        replacement: ' ' },
];

function cleanText(text) {
    for (const { pattern, replacement } of CLEANING_RULES) {
        text = text.replace(pattern, replacement);
    }
    return text.trim();
}

// ── Section-based chunker ─────────────────────────────────────────
// Splits on heading patterns; falls back to paragraph splits.

const HEADING_RE = /^(?:\d+[\.\d]*\s+[A-Z]|[A-Z][A-Z\s]{3,}$|#+\s+)/m;

function chunkTextbook(text, title, subject) {
    const PREFIX = `IB Textbook: ${title}\nSubject: ${subject}\n`;
    const MAX    = 1200;
    const MIN    = 150;

    // Split into candidate blocks on blank lines or headings
    const blocks = text.split(/\n{2,}/).map(b => b.trim()).filter(Boolean);

    const chunks  = [];
    let   current = '';

    const flush = () => {
        if (current.length >= MIN) chunks.push(`${PREFIX}\n${current.trim()}`);
        current = '';
    };

    for (const block of blocks) {
        const isHeading = HEADING_RE.test(block) && block.length < 120;

        if (isHeading && current.length >= MIN) {
            flush();
            current = block + '\n';
        } else if (current.length + block.length > MAX) {
            flush();
            current = block + '\n';
        } else {
            current += block + '\n';
        }
    }
    flush();

    return chunks;
}

// ── Find PDFs ─────────────────────────────────────────────────────

function findPDFs(dir) {
    const results = [];
    for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
            results.push(...findPDFs(full));
        } else if (entry.toLowerCase().endsWith('.pdf')) {
            results.push(full);
        }
    }
    return results;
}

// ── Main ──────────────────────────────────────────────────────────

async function main() {
    if (!fs.existsSync(INPUT_DIR)) {
        console.error(`INGEST_DIR not found: ${INPUT_DIR}`);
        process.exit(1);
    }

    const pdfs = findPDFs(INPUT_DIR);
    console.log(`Found ${pdfs.length} PDF(s) in ${INPUT_DIR}`);

    if (pdfs.length === 0) process.exit(0);

    const db = require('../models');
    await db.sequelize.authenticate();
    console.log('DB connected.\n');

    const { GlobalDocuments } = db;
    const { indexGlobalDocument } = require('../services/embeddingSync');

    let totalDocs = 0, totalChunks = 0, errors = 0;

    for (const pdfPath of pdfs) {
        const filename = path.basename(pdfPath);
        const title    = filename.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ');

        process.stdout.write(`  ${filename} ... `);

        try {
            const buf  = fs.readFileSync(pdfPath);
            const data = await pdfParse(buf);
            const text = cleanText(data.text);

            const chunks = chunkTextbook(text, title, SUBJECT);

            if (PREVIEW) {
                console.log(`\n  Pages: ${data.numpages}, Chunks: ${chunks.length}`);
                console.log('  Sample chunk:\n  ' + chunks[0]?.slice(0, 300).replace(/\n/g, '\n  '));
                continue;
            }

            if (DRY_RUN) {
                console.log(`pages=${data.numpages} chunks=${chunks.length} (dry-run, not saved)`);
                continue;
            }

            // Remove existing record for this filename
            await GlobalDocuments.destroy({ where: { filename, subject: SUBJECT } });

            const doc = await GlobalDocuments.create({
                title,
                filename,
                subject:    SUBJECT,
                curriculum: CURRICULUM,
                docType:    'textbook',
                uploadedBy: 1,
                pageCount:  data.numpages,
                chunkCount: chunks.length,
                fileSize:   buf.length,
                chunksJson: JSON.stringify(chunks),
            });

            if (!SKIP_EMBED) {
                await indexGlobalDocument(doc.id, chunks, SUBJECT);
            }

            totalDocs++;
            totalChunks += chunks.length;
            console.log(`pages=${data.numpages} chunks=${chunks.length} id=${doc.id}`);
        } catch (err) {
            console.log(`ERROR: ${err.message}`);
            errors++;
        }
    }

    console.log(`\n=== Done ===`);
    console.log(`Docs: ${totalDocs}, Chunks: ${totalChunks}, Errors: ${errors}`);
    if (SKIP_EMBED) console.log('Embeddings skipped — run node scripts/run-reindex.js --global-only after.');

    await db.sequelize.close();
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
