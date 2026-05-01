/**
 * Shared utilities for IB past paper ingestion scripts.
 *
 * Each subject-specific ingest file (ingest-chemistry.js, etc.) requires this
 * module and passes its own config: question patterns, chunking strategy,
 * filename parser, and directory path.
 *
 * Usage from a subject file:
 *   const { createIngester } = require('./ingest-common');
 *   createIngester({ subject: 'Chemistry', ... }).run();
 */

const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

// ── IB command terms (shared across all subjects) ───────────────

const IB_COMMAND_TERMS = [
    'analyse', 'analyze', 'calculate', 'comment', 'compare', 'construct',
    'contrast', 'deduce', 'define', 'demonstrate', 'describe', 'design',
    'determine', 'differentiate', 'discuss', 'distinguish', 'draw',
    'estimate', 'evaluate', 'examine', 'explain', 'identify', 'justify',
    'label', 'list', 'measure', 'outline', 'predict', 'sketch', 'state',
    'suggest', 'summarize', 'summarise', 'to what extent',
];

// ── PDF text cleaning (IB-universal boilerplate removal) ────────

function cleanPDFText(raw, extraRules) {
    let text = raw;

    // Trilingual IB copyright blocks (EN + FR + ES)
    text = text.replace(
        /©\s*International Baccalaureate[\s\S]*?applying-for-a-license\/\.\s*/g, ''
    );
    text = text.replace(
        /©\s*Organisation du Baccalauréat[\s\S]*?applying-for-a-license\/\.\s*/g, ''
    );
    text = text.replace(
        /©\s*Organización del Bachillerato[\s\S]*?applying-for-a-license\/\.\s*/g, ''
    );

    // Page headers: "– 2 –\n2224 – 5101" or "– 3 –2224 – 5104"
    text = text.replace(/–\s*\d+\s*–\s*\n?\d{4}\s*–\s*\d{4}[A-Z]?\s*/g, '');

    // Standalone page numbers "– N –"
    text = text.replace(/^–\s*\d+\s*–\s*$/gm, '');

    // IB exam codes: "M10/3/ECONO/SP2/ENG/TZ0/XX", "N15/3/PHYSI/HP1/ENG/TZ0/XX", etc.
    text = text.replace(/^[MN]\d{2}\/\d\/[A-Z]+\/\S+\/\S+\/\S+\/\S+\s*$/gm, '');

    // Old-format exam codes: "2210-5113", "8820-5103", "2224 – 5101"
    text = text.replace(/^\d{4}\s*[-–]\s*\d{4}[A-Z]?\s*$/gm, '');

    // "Turn over" page footers
    text = text.replace(/\nTurn over\s*\n/gi, '\n');

    // "Blank page" lines
    text = text.replace(/\nBlank page\s*\n/gi, '\n');

    // "(Question N continued)" lines
    text = text.replace(/\(Question \d+ continued\)\s*/g, '');

    // "(This question continues on the following page)"
    text = text.replace(/\(This question continues on.*?\)\s*/g, '');

    // Disclaimer blocks
    text = text.replace(/Disclaimer:[\s\S]*?Source adapted\.\s*/g, '');

    // Multi-space artifacts from PDF columnar extraction
    text = text.replace(/  +/g, ' ');

    // Broken words across lines (lowercase continues lowercase)
    text = text.replace(/(\w)\s*\n(\w)/g, (match, before, after) => {
        if (/[a-z]/.test(before) && /[a-z]/.test(after)) return before + after;
        return before + '\n' + after;
    });

    // Collapse 3+ newlines to 2
    text = text.replace(/\n{3,}/g, '\n\n');

    // Apply subject-specific cleaning rules
    if (extraRules) {
        for (const rule of extraRules) {
            text = text.replace(rule.pattern, rule.replacement || '');
        }
    }

    return text.trim();
}

// ── Shared helpers ──────────────────────────────────────────────

function extractMarks(text) {
    const m = text.match(/\[(\d+)(?:\s*marks?)?\]/i)
        || text.match(/\((\d+)\s*marks?\)/i);
    return m ? parseInt(m[1]) : null;
}

function extractCommandTerm(text) {
    const lower = text.toLowerCase().slice(0, 200);
    for (const term of IB_COMMAND_TERMS) {
        if (new RegExp(`\\b${term}\\b`).test(lower)) {
            return term.charAt(0).toUpperCase() + term.slice(1);
        }
    }
    return null;
}

function splitLongText(text, maxChars) {
    let segments = text.split(/\n\n+/);
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

// ── Generic question chunker ────────────────────────────────────

function chunkByQuestions(cleanedText, title, subject, config) {
    const {
        questionPatterns,
        isTopLevel,
        prefixType = 'IB Past Paper',
        maxChunkChars = 2000,
        splitChars = 800,
        skipHeader = true,
    } = config;

    const lines = cleanedText.split('\n');
    const questions = [];
    let currentLabel = null;
    let currentLines = [];
    let headerConsumed = !skipHeader;

    const isQuestionStart = (line) => {
        const t = line.trim();
        if (!t || t.length < 3) return false;
        return questionPatterns.some(r => r.test(t));
    };

    const isTopLevelQuestion = isTopLevel || ((line) => {
        return questionPatterns[0] && questionPatterns[0].test(line.trim());
    });

    for (const line of lines) {
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
            `${prefixType}: ${title}`,
            `Subject: ${subject}`,
            q.label ? `Question: ${q.label.slice(0, 120)}` : null,
            marks ? `[${marks} marks]` : null,
            commandTerm ? `Command Term: ${commandTerm}` : null,
        ].filter(Boolean).join('\n');

        if (fullText.length > maxChunkChars) {
            const subChunks = splitLongText(fullText, splitChars);
            for (const sc of subChunks) {
                chunks.push(`${prefix}\n\n${sc}`);
            }
        } else {
            chunks.push(`${prefix}\n\n${fullText}`);
        }
    }

    // Fallback: if no questions detected, flat-chunk the whole text
    if (chunks.length === 0 && cleanedText.length > 50) {
        const prefix = `${prefixType}: ${title}\nSubject: ${subject}`;
        const subChunks = splitLongText(cleanedText, splitChars);
        for (const sc of subChunks) {
            chunks.push(`${prefix}\n\n${sc}`);
        }
    }

    return chunks;
}

// ── MCQ chunker (for Science Paper 1s) ──────────────────────────

function chunkMCQ(cleanedText, title, subject) {
    const lines = cleanedText.split('\n');
    const questions = [];
    let currentLines = [];
    let currentNum = null;

    // MCQ pattern: line starts with a number followed by period/parenthesis
    const MCQ_START = /^(\d{1,2})\s*[.)]\s+/;
    // Option pattern: A/B/C/D at start of line
    const OPTION = /^\s*[A-D]\s*[.)]\s+|^\s*[A-D]\.\s+/;

    for (const line of lines) {
        const match = line.trim().match(MCQ_START);
        if (match && !OPTION.test(line.trim())) {
            if (currentLines.length > 0) {
                questions.push({ num: currentNum, text: currentLines.join('\n').trim() });
            }
            currentNum = match[1];
            currentLines = [line];
        } else {
            currentLines.push(line);
        }
    }
    if (currentLines.length > 0) {
        questions.push({ num: currentNum, text: currentLines.join('\n').trim() });
    }

    const chunks = [];
    // Group MCQs in batches of 5 to avoid too many tiny chunks
    const BATCH_SIZE = 5;
    for (let i = 0; i < questions.length; i += BATCH_SIZE) {
        const batch = questions.slice(i, i + BATCH_SIZE);
        const batchText = batch.map(q => q.text).join('\n\n');
        const firstNum = batch[0].num || '?';
        const lastNum = batch[batch.length - 1].num || '?';

        const prefix = [
            `IB Past Paper: ${title}`,
            `Subject: ${subject}`,
            `Questions: ${firstNum}–${lastNum} (Multiple Choice)`,
        ].join('\n');

        chunks.push(`${prefix}\n\n${batchText}`);
    }

    if (chunks.length === 0 && cleanedText.length > 50) {
        const prefix = `IB Past Paper: ${title}\nSubject: ${subject}\nMultiple Choice`;
        const subChunks = splitLongText(cleanedText, 800);
        for (const sc of subChunks) {
            chunks.push(`${prefix}\n\n${sc}`);
        }
    }

    return chunks;
}

// ── Mark scheme chunker ─────────────────────────────────────────

function chunkMarkScheme(cleanedText, title, subject, config = {}) {
    const {
        questionPatterns = [/^(\d)\.\s*\([a-z]\)|^\([a-z]\)\s/i],
        stripCriteria = true,
    } = config;

    const lines = cleanedText.split('\n');
    const sections = [];
    let currentLabel = null;
    let currentLines = [];
    let headerConsumed = false;

    const isMS = (line) => {
        const t = line.trim();
        if (!t) return false;
        return questionPatterns.some(r => r.test(t));
    };

    for (const line of lines) {
        if (!headerConsumed) {
            if (isMS(line)) headerConsumed = true;
            else continue;
        }

        if (isMS(line) && currentLines.length > 0) {
            const body = currentLines.join('\n').trim();
            if (body) sections.push({ label: currentLabel, body });
            currentLabel = line.trim();
            currentLines = [];
        } else if (isMS(line) && !currentLabel) {
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

        if (stripCriteria) {
            const criteriaIdx = fullText.indexOf('Assessment Criteria');
            const marksLevelIdx = fullText.indexOf('Marks Level descriptor');
            if (criteriaIdx > 100) fullText = fullText.slice(0, criteriaIdx).trim();
            else if (marksLevelIdx > 100) fullText = fullText.slice(0, marksLevelIdx).trim();
        }

        const marks = extractMarks(fullText);
        const commandTerm = extractCommandTerm(fullText);

        const prefix = [
            `IB Past Paper Mark Scheme: ${title}`,
            `Subject: ${subject}`,
            s.label ? `Question: ${s.label.slice(0, 120)}` : null,
            marks ? `[${marks} marks]` : null,
            commandTerm ? `Command Term: ${commandTerm}` : null,
        ].filter(Boolean).join('\n');

        if (fullText.length > 2000) {
            const subChunks = splitLongText(fullText, 800);
            for (const sc of subChunks) chunks.push(`${prefix}\n\n${sc}`);
        } else {
            chunks.push(`${prefix}\n\n${fullText}`);
        }
    }

    if (chunks.length === 0 && cleanedText.length > 50) {
        const prefix = `IB Past Paper Mark Scheme: ${title}\nSubject: ${subject}`;
        const subChunks = splitLongText(cleanedText, 800);
        for (const sc of subChunks) chunks.push(`${prefix}\n\n${sc}`);
    }

    return chunks;
}

// ── Generic filename parser ─────────────────────────────────────

function createFilenameParser(subject) {
    const subjectUpper = subject.replace(/\s+/g, '_');
    const pattern = new RegExp(
        `^${subjectUpper}_paper_(\\d)_(?:(TZ\\d)_)?(HL|SL|HLSL)(?:_markscheme)?\\.pdf$`, 'i'
    );

    return function parseFilename(filename) {
        const isMarkScheme = /_markscheme\.pdf$/i.test(filename);
        const normalized = filename.replace(/__/g, '_');
        const match = normalized.match(pattern);
        if (!match) return null;
        return {
            paper: match[1],
            tz: match[2] ? match[2].toUpperCase() : null,
            level: match[3].toUpperCase(),
            isMarkScheme,
        };
    };
}

// ── Directory scanner + file pairer ─────────────────────────────

function scanAndPair(inputDir, subject, parseFilename, yearFilter) {
    if (!fs.existsSync(inputDir)) {
        console.error(`Input directory not found: ${inputDir}`);
        process.exit(1);
    }

    const years = fs.readdirSync(inputDir).filter(d => {
        const full = path.join(inputDir, d);
        return fs.statSync(full).isDirectory() && /^\d{4}$/.test(d);
    }).sort();

    const pairs = [];

    for (const year of years) {
        if (yearFilter && year !== yearFilter) continue;

        const yearDir = path.join(inputDir, year);
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
                const key = `P${parsed.paper}_${parsed.tz || 'noTZ'}_${parsed.level}`;
                if (!groups[key]) groups[key] = { parsed, question: null, markScheme: null };

                if (parsed.isMarkScheme) {
                    groups[key].markScheme = path.join(sessionDir, file);
                } else {
                    groups[key].question = path.join(sessionDir, file);
                }
            }

            for (const [, group] of Object.entries(groups)) {
                const sessionName = session.replace(/\s+\d{4}$/, '');
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

// ── Main ingester factory ───────────────────────────────────────

function createIngester(config) {
    const {
        subject,
        curriculum = 'IB',
        inputDir,
        parseFilename: customParser,
        chunkPaper,
        chunkMS,
        cleaningRules = [],
        batchDelayMs = 500,
    } = config;

    const parseFile = customParser || createFilenameParser(subject);

    const args = process.argv.slice(2);
    const DRY_RUN = args.includes('--dry-run');
    const SKIP_EMBEDDINGS = args.includes('--skip-embeddings');
    const PREVIEW = args.includes('--preview');
    const YEAR_FILTER = args.includes('--year') ? args[args.indexOf('--year') + 1] : null;

    async function processPair(p) {
        let allChunks = [];
        let totalPages = 0;
        let totalSize = 0;

        if (p.questionPath) {
            const buf = fs.readFileSync(p.questionPath);
            totalSize += buf.length;
            const data = await pdfParse(buf);
            totalPages += data.numpages;

            const cleaned = cleanPDFText(data.text, cleaningRules);
            const chunks = chunkPaper(cleaned, p.title, parseInt(p.parsed.paper));
            allChunks.push(...chunks);
        }

        if (p.markSchemePath) {
            const buf = fs.readFileSync(p.markSchemePath);
            totalSize += buf.length;
            const data = await pdfParse(buf);
            totalPages += data.numpages;

            const cleaned = cleanPDFText(data.text, cleaningRules);
            const chunks = chunkMS(cleaned, p.title);
            allChunks.push(...chunks);
        }

        return { chunks: allChunks, pages: totalPages, size: totalSize };
    }

    async function preview() {
        const pairs = scanAndPair(inputDir, subject, parseFile, YEAR_FILTER);
        if (pairs.length === 0) {
            console.log('No papers found. Check INPUT_DIR and filename format.');
            return;
        }

        const samples = [
            pairs.find(p => p.parsed.paper === '1'),
            pairs.find(p => p.parsed.paper === '2'),
            pairs.find(p => p.parsed.paper === '3'),
        ].filter(Boolean);

        for (const p of samples) {
            console.log(`\n${'='.repeat(80)}`);
            console.log(p.title);
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

    async function ingest() {
        console.log(`Scanning ${subject} past papers...`);
        const pairs = scanAndPair(inputDir, subject, parseFile, YEAR_FILTER);

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
                    subject,
                    curriculum,
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
                    await indexGlobalDocument(doc.id, chunks, subject, true);
                    console.log(`${label} OK: ${p.title} (${chunks.length} chunks, ${pages} pages)`);
                } else {
                    await GlobalDocuments.update({ chunkCount: chunks.length }, { where: { id: doc.id } });
                    console.log(`${label} OK (no embed): ${p.title} (${chunks.length} chunks)`);
                }

                stats.ingested++;
                stats.chunks += chunks.length;

                if (!SKIP_EMBEDDINGS && i < pairs.length - 1) {
                    await new Promise(r => setTimeout(r, batchDelayMs));
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

    return {
        run() {
            if (PREVIEW) {
                preview().catch(err => { console.error('Error:', err); process.exit(1); });
            } else {
                ingest().catch(err => { console.error('Fatal error:', err); process.exit(1); });
            }
        },
    };
}

module.exports = {
    createIngester,
    cleanPDFText,
    splitLongText,
    extractMarks,
    extractCommandTerm,
    chunkByQuestions,
    chunkMCQ,
    chunkMarkScheme,
    createFilenameParser,
    IB_COMMAND_TERMS,
};
