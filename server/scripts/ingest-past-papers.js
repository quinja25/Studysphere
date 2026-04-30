/**
 * Bulk-ingest IB Economics past papers into GlobalDocuments + RAG embeddings.
 *
 * Pairs question papers with mark schemes so each GlobalDocuments row contains
 * combined chunks (question + marking criteria) for better retrieval.
 *
 * Usage:
 *   node server/scripts/ingest-past-papers.js [--dry-run] [--skip-embeddings] [--year 2024] [--preview]
 *
 * Flags:
 *   --dry-run          Parse and pair files but don't write to DB or embed
 *   --skip-embeddings  Create GlobalDocuments rows but skip embedding generation
 *   --year <YYYY>      Only process a specific year
 *   --preview          Show cleaned text + chunks for first paper then exit
 */

const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

const INPUT_DIR = String.raw`C:\Users\jaeyo\OneDrive\Desktop\업무용\Economics Past Papers`;
const SUBJECT = 'Economics';
const CURRICULUM = 'IB';
const BATCH_DELAY_MS = 500;

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SKIP_EMBEDDINGS = args.includes('--skip-embeddings');
const PREVIEW = args.includes('--preview');
const YEAR_FILTER = args.includes('--year') ? args[args.indexOf('--year') + 1] : null;

// ── Text cleaning ────────────────────────────────────────────────

function cleanPDFText(raw) {
    let text = raw;

    // Remove the trilingual copyright block (EN + FR + ES)
    // Starts with "© International Baccalaureate" or similar, ends before actual content
    text = text.replace(
        /©\s*International Baccalaureate[\s\S]*?applying-for-a-license\/\.\s*/g,
        ''
    );
    text = text.replace(
        /©\s*Organisation du Baccalauréat[\s\S]*?applying-for-a-license\/\.\s*/g,
        ''
    );
    text = text.replace(
        /©\s*Organización del Bachillerato[\s\S]*?applying-for-a-license\/\.\s*/g,
        ''
    );

    // Remove page headers like "– 2 –\n2224 – 5101" or "– 3 –2224 – 5104"
    text = text.replace(/–\s*\d+\s*–\s*\n?\d{4}\s*–\s*\d{4}[A-Z]?\s*/g, '');

    // Remove standalone page numbers "– N –"
    text = text.replace(/^–\s*\d+\s*–\s*$/gm, '');

    // Remove old-format paper codes like "M10/3/ECONO/SP2/ENG/TZ0/XX" or "N15/3/ECONO/HP1/ENG/TZ0/XX"
    text = text.replace(/^[MN]\d{2}\/\d\/ECONO\/\S+\/\S+\/\S+\/\S+\s*$/gm, '');

    // Remove old-format exam codes like "2210-5113", "8820-5103", "2224 – 5101"
    text = text.replace(/^\d{4}\s*[-–]\s*\d{4}[A-Z]?\s*$/gm, '');

    // Remove "Turn over" page footers
    text = text.replace(/\nTurn over\n/g, '\n');

    // Remove "Blank page" lines
    text = text.replace(/\nBlank page\n/g, '\n');

    // Remove "(Question N continued)" lines
    text = text.replace(/\(Question \d+ continued\)\s*/g, '');

    // Remove "(This question continues on the following page)" / "(This question continues on page N)"
    text = text.replace(/\(This question continues on.*?\)\s*/g, '');

    // Remove disclaimer blocks at end
    text = text.replace(/Disclaimer:[\s\S]*?Source adapted\.\s*/g, '');

    // Remove reference blocks at end (start with "References:" or "Text A  ...")
    text = text.replace(/References:\s*\nText\s+[A-Z][\s\S]*$/g, '');

    // Clean up weird multi-space artifacts from PDF columnar extraction
    text = text.replace(/  +/g, ' ');

    // Clean up broken words across lines (e.g., "us   e" → "use", "fic\nhier" → "fichier")
    // Only fix mid-word line breaks where a word is split
    text = text.replace(/(\w)\s*\n(\w)/g, (match, before, after) => {
        // If lowercase continues lowercase, likely a broken word
        if (/[a-z]/.test(before) && /[a-z]/.test(after)) {
            return before + after;
        }
        return before + '\n' + after;
    });

    // Fix broken question numbers: "1.(\na)" → "1.(a)", "N.\nb." → "N.b."
    text = text.replace(/(\d)\.\s*\(\s*\n\s*([a-z]\))/g, '$1.($2');

    // Fix broken "A\nnswers" → "Answers"
    text = text.replace(/\bA\n\s*nswers/g, 'Answers');

    // Fix broken "N.\nB." → "N.B."
    text = text.replace(/\bN\.\s*\n\s*B\./g, 'N.B.');

    // Collapse 3+ newlines to 2
    text = text.replace(/\n{3,}/g, '\n\n');

    return text.trim();
}

// ── IB Economics-specific chunking ───────────────────────────────

const IB_COMMAND_TERMS = [
    'analyse', 'analyze', 'calculate', 'comment', 'compare', 'construct',
    'contrast', 'deduce', 'define', 'demonstrate', 'describe', 'design',
    'determine', 'differentiate', 'discuss', 'distinguish', 'draw',
    'estimate', 'evaluate', 'examine', 'explain', 'identify', 'justify',
    'label', 'list', 'measure', 'outline', 'predict', 'sketch', 'state',
    'suggest', 'summarize', 'summarise', 'to what extent',
];

function extractCommandTerm(text) {
    const lower = text.toLowerCase().slice(0, 200);
    for (const term of IB_COMMAND_TERMS) {
        if (new RegExp(`\\b${term}\\b`).test(lower)) {
            return term.charAt(0).toUpperCase() + term.slice(1);
        }
    }
    return null;
}

function extractMarks(text) {
    // [10], [15], [2], [4 marks], [25 marks]
    const m = text.match(/\[(\d+)(?:\s*marks?)?\]/i);
    return m ? parseInt(m[1]) : null;
}

/**
 * Detect Paper type from extracted text.
 * Paper 1: essay (3 questions, "Answer one question")
 * Paper 2: data response (long texts, tables, figures)
 * Paper 3: HL quantitative
 */
function detectPaperType(text) {
    if (/Paper\s*3/i.test(text)) return 3;
    if (/Paper\s*2/i.test(text)) return 2;
    return 1;
}

// Question start patterns for IB Economics
const QUESTION_PATTERNS = [
    // Top-level: "1. (a)" or "1.(a)" — Paper 1 essay questions
    /^(\d)\.\s*\(a\)/i,
    // Top-level: "1. Read the extracts" — Paper 2 data response
    /^(\d)\.\s*Read the/i,
    // Sub-question with roman numeral: "(a) (i)" or "(a)(i)"
    /^\(a\)\s*\(i\)/i,
    // Sub-question: "(a)", "(b)", "(c)" etc at start of line followed by content
    /^\([a-g]\)\s+(?:\(i\)|[A-Z])/i,
    // Mark scheme format: "1.(a)" or "1. (a)"
    /^(\d)\.\s*\([a-z]\)\s/i,
];

function isQuestionStart(line) {
    const t = line.trim();
    if (!t || t.length < 5) return false;
    return QUESTION_PATTERNS.some(r => r.test(t));
}

function isTopLevelQuestion(line) {
    const t = line.trim();
    return /^\d\.\s*(?:\(a\)|Read the)/i.test(t);
}

/**
 * Chunk IB Economics papers by question boundaries.
 * Groups content under each question/sub-question.
 */
function chunkEconomicsPaper(cleanedText, title, paperNum) {
    const lines = cleanedText.split('\n');
    const questions = [];
    let currentLabel = null;
    let currentLines = [];
    let headerConsumed = false;

    for (const line of lines) {
        // Skip header/instructions until we hit the first question
        if (!headerConsumed) {
            if (isTopLevelQuestion(line) || isQuestionStart(line)) {
                headerConsumed = true;
            } else {
                continue;
            }
        }

        if (isQuestionStart(line)) {
            const body = currentLines.join('\n').trim();
            if (body || currentLabel) {
                questions.push({ label: currentLabel, body });
            }
            currentLabel = line.trim();
            currentLines = [];
        } else {
            currentLines.push(line);
        }
    }
    // Last question
    const body = currentLines.join('\n').trim();
    if (body || currentLabel) {
        questions.push({ label: currentLabel, body });
    }

    const chunks = [];
    for (const q of questions) {
        const fullText = [q.label, q.body].filter(Boolean).join('\n').trim();
        if (!fullText || fullText.length < 20) continue;

        const marks = extractMarks(fullText);
        const commandTerm = extractCommandTerm(fullText);

        const prefix = [
            `IB Past Paper: ${title}`,
            `Subject: ${SUBJECT}`,
            q.label ? `Question: ${q.label.slice(0, 120)}` : null,
            marks ? `[${marks} marks]` : null,
            commandTerm ? `Command Term: ${commandTerm}` : null,
        ].filter(Boolean).join('\n');

        // For Paper 2 data response questions with long text extracts,
        // split into smaller chunks
        if (fullText.length > 2000) {
            const subChunks = splitLongText(fullText, 800);
            for (const sc of subChunks) {
                chunks.push(`${prefix}\n\n${sc}`);
            }
        } else {
            chunks.push(`${prefix}\n\n${fullText}`);
        }
    }

    // Fallback: if no questions detected, chunk the whole cleaned text
    if (chunks.length === 0 && cleanedText.length > 50) {
        const prefix = `IB Past Paper: ${title}\nSubject: ${SUBJECT}`;
        const subChunks = splitLongText(cleanedText, 800);
        for (const sc of subChunks) {
            chunks.push(`${prefix}\n\n${sc}`);
        }
    }

    return chunks;
}

/**
 * Chunk mark scheme by question, preserving marking criteria with the question.
 */
function chunkMarkScheme(cleanedText, title) {
    const lines = cleanedText.split('\n');
    const sections = [];
    let currentLabel = null;
    let currentLines = [];
    let headerConsumed = false;

    // Mark scheme question patterns: "1.(a)", "1. (a)", "(b)"
    const MS_QUESTION = /^(\d)\.\s*\([a-z]\)|^\([a-z]\)\s/i;

    for (const line of lines) {
        if (!headerConsumed) {
            if (MS_QUESTION.test(line.trim())) {
                headerConsumed = true;
            } else {
                continue;
            }
        }

        if (MS_QUESTION.test(line.trim()) && currentLines.length > 0) {
            const body = currentLines.join('\n').trim();
            if (body) sections.push({ label: currentLabel, body });
            currentLabel = line.trim();
            currentLines = [];
        } else if (MS_QUESTION.test(line.trim()) && !currentLabel) {
            currentLabel = line.trim();
        } else {
            currentLines.push(line);
        }
    }
    const body = currentLines.join('\n').trim();
    if (body) sections.push({ label: currentLabel, body });

    const chunks = [];
    for (const s of sections) {
        let fullText = [s.label, s.body].filter(Boolean).join('\n').trim();
        if (!fullText || fullText.length < 20) continue;

        // Strip the verbose assessment criteria / markband tables — they're the same
        // across all questions and add noise. Keep only the "Answers may include:" section.
        const criteriaIdx = fullText.indexOf('Assessment Criteria');
        const marksLevelIdx = fullText.indexOf('Marks Level descriptor');
        if (criteriaIdx > 100) {
            fullText = fullText.slice(0, criteriaIdx).trim();
        } else if (marksLevelIdx > 100) {
            fullText = fullText.slice(0, marksLevelIdx).trim();
        }

        const marks = extractMarks(fullText);
        const commandTerm = extractCommandTerm(fullText);

        const prefix = [
            `IB Past Paper Mark Scheme: ${title}`,
            `Subject: ${SUBJECT}`,
            s.label ? `Question: ${s.label.slice(0, 120)}` : null,
            marks ? `[${marks} marks]` : null,
            commandTerm ? `Command Term: ${commandTerm}` : null,
        ].filter(Boolean).join('\n');

        if (fullText.length > 2000) {
            const subChunks = splitLongText(fullText, 800);
            for (const sc of subChunks) {
                chunks.push(`${prefix}\n\n${sc}`);
            }
        } else {
            chunks.push(`${prefix}\n\n${fullText}`);
        }
    }

    // Fallback
    if (chunks.length === 0 && cleanedText.length > 50) {
        const prefix = `IB Past Paper Mark Scheme: ${title}\nSubject: ${SUBJECT}`;
        const subChunks = splitLongText(cleanedText, 800);
        for (const sc of subChunks) {
            chunks.push(`${prefix}\n\n${sc}`);
        }
    }

    return chunks;
}

function splitLongText(text, maxChars) {
    // First try splitting by double newlines (paragraphs)
    let segments = text.split(/\n\n+/);
    // If that didn't produce enough segments, split by single newlines
    if (segments.length < 3 && text.length > maxChars) {
        segments = text.split(/\n/);
    }

    const chunks = [];
    let current = '';

    for (const seg of segments) {
        if (current.length + seg.length > maxChars && current.length > 100) {
            chunks.push(current.trim());
            current = seg;
        } else {
            current += (current ? '\n' : '') + seg;
        }
    }
    if (current.trim()) chunks.push(current.trim());
    return chunks;
}

// ── Filename parser ──────────────────────────────────────────────

function parseFilename(filename) {
    const isMarkScheme = /_markscheme\.pdf$/i.test(filename);
    const normalized = filename.replace(/__/g, '_');

    const match = normalized.match(
        /^Economics_paper_(\d)_(?:(TZ\d)_)?(HL|SL|HLSL)(?:_markscheme)?\.pdf$/i
    );
    if (!match) return null;

    return {
        paper: match[1],
        tz: match[2] ? match[2].toUpperCase() : null,
        level: match[3].toUpperCase(),
        isMarkScheme,
    };
}

function buildPairKey(parsed) {
    return `P${parsed.paper}_${parsed.tz || 'noTZ'}_${parsed.level}`;
}

function buildTitle(year, session, parsed) {
    const parts = ['IB Economics', `Paper ${parsed.paper}`];
    if (parsed.tz) parts.push(parsed.tz);
    parts.push(parsed.level);
    parts.push(`— ${session} ${year}`);
    return parts.join(' ');
}

// ── Scan directory and pair files ────────────────────────────────

function scanAndPair() {
    const years = fs.readdirSync(INPUT_DIR).filter(d => {
        const full = path.join(INPUT_DIR, d);
        return fs.statSync(full).isDirectory() && /^\d{4}$/.test(d);
    }).sort();

    const pairs = [];

    for (const year of years) {
        if (YEAR_FILTER && year !== YEAR_FILTER) continue;

        const yearDir = path.join(INPUT_DIR, year);
        const sessions = fs.readdirSync(yearDir).filter(d =>
            fs.statSync(path.join(yearDir, d)).isDirectory()
        );

        for (const session of sessions) {
            const sessionDir = path.join(yearDir, session);
            const files = fs.readdirSync(sessionDir).filter(f => f.endsWith('.pdf'));

            const groups = {};
            for (const file of files) {
                const parsed = parseFilename(file);
                if (!parsed) {
                    console.warn(`  [SKIP] Unrecognized filename: ${year}/${session}/${file}`);
                    continue;
                }
                const key = buildPairKey(parsed);
                if (!groups[key]) groups[key] = { parsed, question: null, markScheme: null };

                if (parsed.isMarkScheme) {
                    groups[key].markScheme = path.join(sessionDir, file);
                } else {
                    groups[key].question = path.join(sessionDir, file);
                }
            }

            for (const [, group] of Object.entries(groups)) {
                const sessionName = session.replace(/\s+\d{4}$/, '');
                pairs.push({
                    year,
                    session: sessionName,
                    title: buildTitle(year, sessionName, group.parsed),
                    questionPath: group.question,
                    markSchemePath: group.markScheme,
                    parsed: group.parsed,
                });
            }
        }
    }

    return pairs;
}

// ── Process a single paper pair ──────────────────────────────────

async function processPair(p) {
    let allChunks = [];
    let totalPages = 0;
    let totalSize = 0;

    if (p.questionPath) {
        const buf = fs.readFileSync(p.questionPath);
        totalSize += buf.length;
        const data = await pdfParse(buf);
        totalPages += data.numpages;

        const cleaned = cleanPDFText(data.text);
        const paperNum = parseInt(p.parsed.paper);
        const chunks = chunkEconomicsPaper(cleaned, p.title, paperNum);
        allChunks.push(...chunks);
    }

    if (p.markSchemePath) {
        const buf = fs.readFileSync(p.markSchemePath);
        totalSize += buf.length;
        const data = await pdfParse(buf);
        totalPages += data.numpages;

        const cleaned = cleanPDFText(data.text);
        const chunks = chunkMarkScheme(cleaned, p.title);
        allChunks.push(...chunks);
    }

    return { chunks: allChunks, pages: totalPages, size: totalSize };
}

// ── Preview mode ─────────────────────────────────────────────────

async function preview() {
    const pairs = scanAndPair();
    // Pick one of each paper type
    const samples = [
        pairs.find(p => p.parsed.paper === '1'),
        pairs.find(p => p.parsed.paper === '2'),
    ].filter(Boolean);

    for (const p of samples) {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`${p.title}`);
        console.log('='.repeat(80));

        const { chunks, pages } = await processPair(p);
        console.log(`Pages: ${pages}, Chunks: ${chunks.length}\n`);

        chunks.forEach((c, i) => {
            console.log(`--- Chunk ${i} (${c.length} chars) ---`);
            console.log(c.slice(0, 500));
            if (c.length > 500) console.log(`  ... (${c.length - 500} more chars)`);
            console.log('');
        });
    }
}

// ── Full ingest ──────────────────────────────────────────────────

async function ingest() {
    console.log('Scanning past papers directory...');
    const pairs = scanAndPair();

    console.log(`Found ${pairs.length} paper groups to ingest.`);
    const paired = pairs.filter(p => p.questionPath && p.markSchemePath).length;
    const questionOnly = pairs.filter(p => p.questionPath && !p.markSchemePath).length;
    const markSchemeOnly = pairs.filter(p => !p.questionPath && p.markSchemePath).length;
    console.log(`  Paired (Q+MS): ${paired}`);
    console.log(`  Question only: ${questionOnly}`);
    console.log(`  Mark scheme only: ${markSchemeOnly}\n`);

    if (DRY_RUN) {
        console.log('=== DRY RUN — listing pairs ===\n');
        for (const p of pairs) {
            console.log(`  ${p.title}`);
            console.log(`    Q:  ${p.questionPath ? path.basename(p.questionPath) : '(none)'}`);
            console.log(`    MS: ${p.markSchemePath ? path.basename(p.markSchemePath) : '(none)'}`);
        }
        console.log(`\n${pairs.length} papers would be ingested.`);
        process.exit(0);
    }

    // Lazy-require DB dependencies so --dry-run works without a DB connection
    const db = require('../models');
    const { GlobalDocuments } = db;
    const { indexGlobalDocument } = require('../services/embeddingSync');

    await db.sequelize.authenticate();
    console.log('Database connected.\n');

    const stats = { total: pairs.length, ingested: 0, skipped: 0, failed: 0, chunks: 0 };

    for (let i = 0; i < pairs.length; i++) {
        const p = pairs[i];
        const label = `[${i + 1}/${pairs.length}]`;

        const existing = await GlobalDocuments.findOne({ where: { title: p.title } });
        if (existing) {
            console.log(`${label} SKIP (exists): ${p.title}`);
            stats.skipped++;
            continue;
        }

        try {
            const { chunks, pages, size } = await processPair(p);

            if (chunks.length === 0) {
                console.log(`${label} SKIP (no text extracted): ${p.title}`);
                stats.skipped++;
                continue;
            }

            const primaryFile = p.questionPath
                ? path.basename(p.questionPath)
                : path.basename(p.markSchemePath);

            const doc = await GlobalDocuments.create({
                title: p.title,
                filename: primaryFile,
                subject: SUBJECT,
                curriculum: CURRICULUM,
                docType: 'past_paper',
                uploadedBy: 5,
                pageCount: pages,
                chunkCount: 0,
                fileSize: size,
                chunksJson: JSON.stringify(chunks),
            });

            if (p.questionPath) {
                const uploadsDir = path.join(__dirname, '../uploads/global-docs');
                fs.mkdirSync(uploadsDir, { recursive: true });
                const slug = p.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
                fs.copyFileSync(p.questionPath, path.join(uploadsDir, `${doc.id}-${slug}.pdf`));
            }

            if (!SKIP_EMBEDDINGS) {
                await indexGlobalDocument(doc.id, chunks, SUBJECT, true);
                console.log(`${label} OK: ${p.title} (${chunks.length} chunks, ${pages} pages)`);
            } else {
                await GlobalDocuments.update({ chunkCount: chunks.length }, { where: { id: doc.id } });
                console.log(`${label} OK (no embed): ${p.title} (${chunks.length} chunks)`);
            }

            stats.ingested++;
            stats.chunks += chunks.length;

            if (!SKIP_EMBEDDINGS && i < pairs.length - 1) {
                await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
            }
        } catch (err) {
            console.error(`${label} FAIL: ${p.title} — ${err.message}`);
            stats.failed++;
        }
    }

    console.log('\n=== Done ===');
    console.log(`  Ingested: ${stats.ingested}`);
    console.log(`  Skipped:  ${stats.skipped}`);
    console.log(`  Failed:   ${stats.failed}`);
    console.log(`  Chunks:   ${stats.chunks}`);

    await db.sequelize.close();
}

// ── Entry point ──────────────────────────────────────────────────

if (PREVIEW) {
    preview().catch(err => { console.error('Error:', err); process.exit(1); });
} else {
    ingest().catch(err => { console.error('Fatal error:', err); process.exit(1); });
}
