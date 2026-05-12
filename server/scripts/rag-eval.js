/**
 * RAG Evaluation Harness
 *
 * Compares baseline GPT vs RAG-augmented answers using golden pairs.
 * Golden pairs live in eval-data/golden-{subject}.json.
 * Results are written to eval-data/results/{subject}-latest.json.
 *
 * Usage:
 *   node server/scripts/rag-eval.js                        # baseline + RAG, economics
 *   node server/scripts/rag-eval.js --baseline             # baseline only
 *   node server/scripts/rag-eval.js --rag                  # RAG only
 *   node server/scripts/rag-eval.js --compare              # print existing results
 *   node server/scripts/rag-eval.js --judge                # LLM-as-judge scoring
 *   node server/scripts/rag-eval.js --subject chemistry    # different subject
 *   node server/scripts/rag-eval.js --mode retrieval       # retrieval metrics only (no LLM calls)
 *   node server/scripts/rag-eval.js --rag --judge --subject economics
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');

// ── CLI args ──────────────────────────────────────────────────────

const args = process.argv.slice(2);

function getArg(flag) {
    const i = args.indexOf(flag);
    return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
}

const SUBJECT      = (getArg('--subject') || 'economics').toLowerCase();
const MODE         = getArg('--mode') || 'both';          // retrieval | answer | both
const RUN_BASELINE = !args.includes('--rag');
const RUN_RAG      = !args.includes('--baseline');
const COMPARE_ONLY = args.includes('--compare');
const RUN_JUDGE    = args.includes('--judge');

const EVAL_DIR     = path.join(__dirname, 'eval-data');
const RESULTS_DIR  = path.join(EVAL_DIR, 'results');
const GOLDEN_FILE  = path.join(EVAL_DIR, `golden-${SUBJECT}.json`);
const RESULTS_FILE = path.join(RESULTS_DIR, `${SUBJECT}-latest.json`);

// ── Load golden pairs ─────────────────────────────────────────────

function loadGoldenPairs() {
    if (!fs.existsSync(GOLDEN_FILE)) {
        console.error(`Golden file not found: ${GOLDEN_FILE}`);
        process.exit(1);
    }
    const data = JSON.parse(fs.readFileSync(GOLDEN_FILE, 'utf8'));
    if (!data.pairs || data.pairs.length === 0) {
        console.error(`No pairs in ${GOLDEN_FILE}. Fill in the golden pairs first.`);
        process.exit(1);
    }
    return data.pairs;
}

// ── Prompts ───────────────────────────────────────────────────────

const subjectTitle = SUBJECT.charAt(0).toUpperCase() + SUBJECT.slice(1);

const SYSTEM_PROMPT = `You are an expert IB ${subjectTitle} tutor. Answer the following IB exam question clearly and accurately.
Structure your answer with: key definitions, relevant theory, a diagram description if applicable, and evaluation/analysis.
Keep your answer focused and exam-appropriate (aim for 200-400 words).`;

const SYSTEM_PROMPT_RAG = `You are an expert IB ${subjectTitle} tutor with access to IB past papers and mark schemes.
Answer the following IB exam question using the provided context from past papers and mark schemes.
Structure your answer with: key definitions, relevant theory, a diagram description if applicable, and evaluation/analysis.
Reference the context where relevant. Keep your answer focused and exam-appropriate (200-400 words).`;

// ── Retrieval scoring ─────────────────────────────────────────────

/**
 * Check whether a chunk is "relevant" to a query.
 * A chunk is relevant if it contains at least one relevantKeyword (case-insensitive).
 */
function chunkIsRelevant(chunk, keywords) {
    const text = (chunk.content || chunk.chunkText || chunk.text || '').toLowerCase();
    return keywords.some(kw => text.includes(kw.toLowerCase()));
}

/**
 * recall@k: did any of the top-k chunks contain a relevant keyword?
 */
function recallAtK(chunks, keywords, k = 5) {
    const topK = chunks.slice(0, k);
    return topK.some(c => chunkIsRelevant(c, keywords)) ? 1 : 0;
}

/**
 * MRR: reciprocal rank of the first relevant chunk.
 * Returns 0 if none of the retrieved chunks are relevant.
 */
function meanReciprocalRank(chunks, keywords) {
    for (let i = 0; i < chunks.length; i++) {
        if (chunkIsRelevant(chunks[i], keywords)) return 1 / (i + 1);
    }
    return 0;
}

// ── Baseline answer ───────────────────────────────────────────────

async function getBaselineAnswer(q, chatCompletion) {
    const start = Date.now();
    const result = await chatCompletion([
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: q.query },
    ], { max_tokens: 600 });
    return {
        answer: result.content,
        tokens: result.tokens,
        latencyMs: Date.now() - start,
        sources: [],
    };
}

// ── RAG answer ────────────────────────────────────────────────────

async function getRagAnswer(q, retrieveContext, chatCompletion) {
    const start = Date.now();

    const rawChunks = await retrieveContext(q.query, {
        subject: subjectTitle,
        curriculum: 'IB',
        isPro: true,
    });

    const contextBlock = rawChunks.length > 0
        ? rawChunks.map((c, i) => `[${i + 1}] ${c.content || c.chunkText || c.text || ''}`).join('\n\n')
        : null;

    const messages = [{ role: 'system', content: SYSTEM_PROMPT_RAG }];

    messages.push({
        role: 'user',
        content: contextBlock
            ? `Context from IB ${subjectTitle} past papers and mark schemes:\n\n${contextBlock}\n\n---\n\nQuestion: ${q.query}`
            : q.query,
    });

    const result = await chatCompletion(messages, { max_tokens: 600 });

    // Retrieval metrics
    const keywords = q.relevantKeywords || [];
    const recall5  = recallAtK(rawChunks, keywords, 5);
    const mrr      = meanReciprocalRank(rawChunks, keywords);

    return {
        answer: result.content,
        tokens: result.tokens,
        latencyMs: Date.now() - start,
        contextUsed: !!contextBlock,
        contextChunks: rawChunks.length,
        retrieval: { recall5, mrr },
        sources: rawChunks.map(c => ({
            sourceType: c.source || c.sourceType,
            sourceId:   c.sourceId,
            chunkText:  (c.content || c.chunkText || c.text || '').slice(0, 200),
            score:      c.rrfScore || c.score,
            relevant:   keywords.length ? chunkIsRelevant(c, keywords) : null,
        })),
    };
}

// ── LLM-as-judge ─────────────────────────────────────────────────

const JUDGE_SYSTEM = `You are an IB examiner evaluating a student's answer. Score the answer on three dimensions (each 1–5):
- accuracy: factual correctness vs the reference answer
- specificity: use of precise concepts, diagrams, examples
- curriculum_alignment: matches IB command term expectations

Respond ONLY with a JSON object like:
{"accuracy":4,"specificity":3,"curriculum_alignment":4,"rationale":"one sentence"}`;

async function judgeAnswer(question, answer, expectedAnswer, chatCompletion) {
    const prompt = `Reference answer:\n${expectedAnswer}\n\nStudent answer:\n${answer}\n\nQuestion: ${question}`;
    try {
        const result = await chatCompletion([
            { role: 'system', content: JUDGE_SYSTEM },
            { role: 'user', content: prompt },
        ], { max_tokens: 150, temperature: 0 });

        const raw = result.content.trim();
        const json = raw.startsWith('{') ? raw : raw.slice(raw.indexOf('{'));
        return JSON.parse(json);
    } catch {
        return { accuracy: null, specificity: null, curriculum_alignment: null, rationale: 'parse error' };
    }
}

// ── Compare / print ───────────────────────────────────────────────

function compare() {
    if (!fs.existsSync(RESULTS_FILE)) {
        console.error(`No results file: ${RESULTS_FILE}\nRun without --compare first.`);
        process.exit(1);
    }
    const data = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
    const { metadata, results } = data;

    console.log(`\n${'='.repeat(80)}`);
    console.log(`RAG EVALUATION — ${metadata.subject?.toUpperCase() || SUBJECT.toUpperCase()}`);
    console.log(`Run at: ${metadata.runAt}   Questions: ${results.length}`);
    console.log('='.repeat(80));

    for (const r of results) {
        console.log(`\n[${r.id}] ${r.topic} — ${r.command}`);
        console.log(`Q: ${r.query.slice(0, 120)}...`);

        if (r.baseline) {
            const j = r.baseline.judge;
            const judgeStr = j ? ` | judge: acc=${j.accuracy} spec=${j.specificity} curric=${j.curriculum_alignment}` : '';
            console.log(`\n  BASELINE (${r.baseline.tokens} tok, ${r.baseline.latencyMs}ms${judgeStr}):`);
            console.log('  ' + r.baseline.answer.slice(0, 300).replace(/\n/g, '\n  ') + '...');
        }

        if (r.rag) {
            const ret = r.rag.retrieval || {};
            const j   = r.rag.judge;
            const judgeStr  = j ? ` | judge: acc=${j.accuracy} spec=${j.specificity} curric=${j.curriculum_alignment}` : '';
            const retStr    = ret.recall5 !== undefined ? ` | recall@5=${ret.recall5} MRR=${ret.mrr?.toFixed(3)}` : '';
            console.log(`\n  RAG (${r.rag.tokens} tok, ${r.rag.latencyMs}ms, ${r.rag.contextChunks} chunks${retStr}${judgeStr}):`);
            if (r.rag.sources?.length > 0) {
                const relevant = r.rag.sources.filter(s => s.relevant).length;
                console.log(`  Sources: ${r.rag.sources.length} retrieved, ${relevant} relevant`);
            }
            console.log('  ' + r.rag.answer.slice(0, 300).replace(/\n/g, '\n  ') + '...');
        }
        console.log('-'.repeat(80));
    }

    // Aggregate stats
    const withBaseline = results.filter(r => r.baseline && !r.baseline.error);
    const withRag      = results.filter(r => r.rag && !r.rag.error);
    const ragContext   = withRag.filter(r => r.rag.contextUsed);

    console.log('\n=== AGGREGATE SUMMARY ===');

    if (withBaseline.length) {
        const avgTok = Math.round(withBaseline.reduce((s, r) => s + r.baseline.tokens, 0) / withBaseline.length);
        console.log(`Baseline  avg tokens: ${avgTok}`);
        const judged = withBaseline.filter(r => r.baseline.judge?.accuracy);
        if (judged.length) {
            const avg = k => (judged.reduce((s, r) => s + r.baseline.judge[k], 0) / judged.length).toFixed(2);
            console.log(`Baseline  judge avg — accuracy:${avg('accuracy')} specificity:${avg('specificity')} curriculum:${avg('curriculum_alignment')}`);
        }
    }

    if (withRag.length) {
        const avgTok    = Math.round(withRag.reduce((s, r) => s + r.rag.tokens, 0) / withRag.length);
        const avgRecall = (withRag.filter(r => r.rag.retrieval).reduce((s, r) => s + (r.rag.retrieval.recall5 || 0), 0) / withRag.length).toFixed(2);
        const avgMrr    = (withRag.filter(r => r.rag.retrieval).reduce((s, r) => s + (r.rag.retrieval.mrr || 0), 0) / withRag.length).toFixed(3);
        console.log(`RAG       avg tokens: ${avgTok}`);
        console.log(`RAG       retrieval  — recall@5:${avgRecall}  MRR:${avgMrr}  (${ragContext.length}/${withRag.length} answers had context)`);
        if (ragContext.length) {
            const avgChunks = (ragContext.reduce((s, r) => s + r.rag.contextChunks, 0) / ragContext.length).toFixed(1);
            console.log(`RAG       avg chunks retrieved: ${avgChunks}`);
        }
        const judged = withRag.filter(r => r.rag.judge?.accuracy);
        if (judged.length) {
            const avg = k => (judged.reduce((s, r) => s + r.rag.judge[k], 0) / judged.length).toFixed(2);
            console.log(`RAG       judge avg — accuracy:${avg('accuracy')} specificity:${avg('specificity')} curriculum:${avg('curriculum_alignment')}`);
        }
    }
}

// ── Main ──────────────────────────────────────────────────────────

async function main() {
    if (COMPARE_ONLY) { compare(); return; }

    const pairs = loadGoldenPairs();
    console.log(`Loaded ${pairs.length} golden pairs for ${subjectTitle} (mode: ${MODE})\n`);

    // Restore cached results
    let existing = { results: [] };
    if (fs.existsSync(RESULTS_FILE)) {
        existing = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
        console.log(`Restored ${existing.results.length} cached results from ${RESULTS_FILE}`);
    }
    const existingMap = Object.fromEntries((existing.results || []).map(r => [r.id, r]));

    // Lazy-load AI deps
    const { chatCompletion } = require('../services/openai');
    let retrieveContext = null;

    if (RUN_RAG && MODE !== 'answer') {
        retrieveContext = require('../services/ragRetriever').retrieveContext;
        const db = require('../models');
        await db.sequelize.authenticate();
        console.log('Database connected.\n');
    }

    if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });

    const results = [];
    let baselineTokens = 0, ragTokens = 0, judgeTokens = 0;

    for (let i = 0; i < pairs.length; i++) {
        const q     = pairs[i];
        const label = `[${i + 1}/${pairs.length}]`;
        console.log(`${label} ${q.id} — ${q.topic}`);

        const entry = {
            id:       q.id,
            topic:    q.topic,
            paper:    q.paper,
            level:    q.level,
            command:  q.command,
            query:    q.query,
            baseline: existingMap[q.id]?.baseline || null,
            rag:      existingMap[q.id]?.rag || null,
        };

        // ── Baseline ────────────────────────────────────────────
        if (RUN_BASELINE && MODE !== 'retrieval' && !entry.baseline) {
            process.stdout.write('  baseline... ');
            try {
                entry.baseline = await getBaselineAnswer(q, chatCompletion);
                baselineTokens += entry.baseline.tokens;
                console.log(`done (${entry.baseline.tokens} tok, ${entry.baseline.latencyMs}ms)`);
            } catch (err) {
                console.log(`FAIL: ${err.message}`);
                entry.baseline = { error: err.message };
            }
        } else if (entry.baseline && !entry.baseline.error) {
            console.log('  baseline: (cached)');
        }

        // ── RAG ─────────────────────────────────────────────────
        if (RUN_RAG && !entry.rag) {
            process.stdout.write('  rag... ');
            try {
                if (MODE === 'retrieval') {
                    // Retrieval-only: fetch chunks, score, no LLM answer
                    const rawChunks = await retrieveContext(q.query, { subject: subjectTitle, curriculum: 'IB', isPro: true });
                    const keywords  = q.relevantKeywords || [];
                    entry.rag = {
                        answer:        null,
                        tokens:        0,
                        latencyMs:     0,
                        contextUsed:   rawChunks.length > 0,
                        contextChunks: rawChunks.length,
                        retrieval: {
                            recall5: recallAtK(rawChunks, keywords, 5),
                            mrr:     meanReciprocalRank(rawChunks, keywords),
                        },
                        sources: rawChunks.map(c => ({
                            sourceType: c.source || c.sourceType,
                            sourceId:   c.sourceId,
                            chunkText:  (c.content || c.chunkText || c.text || '').slice(0, 200),
                            score:      c.rrfScore || c.score,
                            relevant:   keywords.length ? chunkIsRelevant(c, keywords) : null,
                        })),
                    };
                    console.log(`done (${rawChunks.length} chunks, recall@5=${entry.rag.retrieval.recall5}, MRR=${entry.rag.retrieval.mrr.toFixed(3)})`);
                } else {
                    entry.rag = await getRagAnswer(q, retrieveContext, chatCompletion);
                    ragTokens += entry.rag.tokens;
                    const ret = entry.rag.retrieval;
                    console.log(`done (${entry.rag.tokens} tok, ${entry.rag.contextChunks} chunks, recall@5=${ret.recall5}, MRR=${ret.mrr.toFixed(3)}, ${entry.rag.latencyMs}ms)`);
                }
            } catch (err) {
                console.log(`FAIL: ${err.message}`);
                entry.rag = { error: err.message };
            }
        } else if (entry.rag && !entry.rag.error) {
            console.log('  rag: (cached)');
        }

        // ── LLM judge ───────────────────────────────────────────
        if (RUN_JUDGE && q.expectedAnswer) {
            if (entry.baseline?.answer && !entry.baseline.judge) {
                process.stdout.write('  judge baseline... ');
                entry.baseline.judge = await judgeAnswer(q.query, entry.baseline.answer, q.expectedAnswer, chatCompletion);
                judgeTokens += 150;
                console.log(`acc=${entry.baseline.judge.accuracy} spec=${entry.baseline.judge.specificity} curric=${entry.baseline.judge.curriculum_alignment}`);
            }
            if (entry.rag?.answer && !entry.rag.judge) {
                process.stdout.write('  judge rag... ');
                entry.rag.judge = await judgeAnswer(q.query, entry.rag.answer, q.expectedAnswer, chatCompletion);
                judgeTokens += 150;
                console.log(`acc=${entry.rag.judge.accuracy} spec=${entry.rag.judge.specificity} curric=${entry.rag.judge.curriculum_alignment}`);
            }
        }

        results.push(entry);
    }

    // Save
    const output = {
        metadata: {
            runAt:              new Date().toISOString(),
            subject:            SUBJECT,
            totalQuestions:     pairs.length,
            mode:               MODE,
            judgeEnabled:       RUN_JUDGE,
            baselineTokensUsed: baselineTokens,
            ragTokensUsed:      ragTokens,
            judgeTokensUsed:    judgeTokens,
        },
        results,
    };

    fs.writeFileSync(RESULTS_FILE, JSON.stringify(output, null, 2), 'utf8');

    console.log(`\n=== Done ===`);
    console.log(`Results: ${RESULTS_FILE}`);
    if (baselineTokens) console.log(`Baseline tokens: ${baselineTokens}`);
    if (ragTokens)      console.log(`RAG tokens:      ${ragTokens}`);
    if (judgeTokens)    console.log(`Judge tokens:    ~${judgeTokens}`);

    // Inline aggregate
    const ragWithRetrieval = results.filter(r => r.rag?.retrieval);
    if (ragWithRetrieval.length) {
        const avgR5  = (ragWithRetrieval.reduce((s, r) => s + r.rag.retrieval.recall5, 0) / ragWithRetrieval.length).toFixed(2);
        const avgMrr = (ragWithRetrieval.reduce((s, r) => s + r.rag.retrieval.mrr,     0) / ragWithRetrieval.length).toFixed(3);
        console.log(`\nRetrieval  recall@5=${avgR5}  MRR=${avgMrr}  (over ${ragWithRetrieval.length} questions)`);
    }

    console.log(`\nRun with --compare to print side-by-side output.`);

    if (RUN_RAG && retrieveContext) {
        const db = require('../models');
        await db.sequelize.close();
    }
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
