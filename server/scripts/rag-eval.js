/**
 * RAG Evaluation Harness — IB Economics
 *
 * Runs 20 IB Economics questions through both:
 *   (A) Baseline: plain GPT-4o-mini with no context
 *   (B) RAG:      GPT-4o-mini with retrieved context from past papers + knowledge base
 *
 * Saves results to server/scripts/rag-eval-results.json for comparison.
 *
 * Usage:
 *   node server/scripts/rag-eval.js              # run both baseline + RAG
 *   node server/scripts/rag-eval.js --baseline   # baseline only (no DB needed)
 *   node server/scripts/rag-eval.js --rag        # RAG only
 *   node server/scripts/rag-eval.js --compare    # print diff of existing results file
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');

const RESULTS_FILE = path.join(__dirname, 'rag-eval-results.json');

const args = process.argv.slice(2);
const RUN_BASELINE = !args.includes('--rag');
const RUN_RAG = !args.includes('--baseline');
const COMPARE_ONLY = args.includes('--compare');

// ── 20 IB Economics golden questions ─────────────────────────────
// Covers: Micro, Macro, International, Development
// Command terms: define, explain, evaluate, discuss, calculate, outline

const QUESTIONS = [
    // ── Microeconomics ────────────────────────────────────────────
    {
        id: 'micro_01',
        topic: 'Elasticity',
        paper: 'Paper 1',
        level: 'SL/HL',
        command: 'Explain',
        question: 'Explain why the price elasticity of demand for cigarettes tends to be price inelastic, and discuss the implications for government tax policy.',
    },
    {
        id: 'micro_02',
        topic: 'Market Structures',
        paper: 'Paper 1',
        level: 'HL',
        command: 'Evaluate',
        question: 'Evaluate the view that firms in perfect competition are more efficient than firms operating as monopolies.',
    },
    {
        id: 'micro_03',
        topic: 'Externalities',
        paper: 'Paper 1',
        level: 'SL/HL',
        command: 'Explain',
        question: 'Using a diagram, explain how a negative externality of production leads to market failure and suggest two government policies to correct it.',
    },
    {
        id: 'micro_04',
        topic: 'Market Failure',
        paper: 'Paper 1',
        level: 'SL/HL',
        command: 'Discuss',
        question: 'Discuss the strengths and limitations of using a maximum price (price ceiling) to make housing more affordable.',
    },
    {
        id: 'micro_05',
        topic: 'Oligopoly',
        paper: 'Paper 1',
        level: 'HL',
        command: 'Explain',
        question: 'Explain why firms in an oligopoly tend to engage in non-price competition rather than price competition.',
    },

    // ── Macroeconomics ────────────────────────────────────────────
    {
        id: 'macro_01',
        topic: 'Multiplier',
        paper: 'Paper 1',
        level: 'SL/HL',
        command: 'Explain',
        question: 'Using the Keynesian multiplier, explain how an initial increase in government spending of $500 million can lead to a larger increase in national income.',
    },
    {
        id: 'macro_02',
        topic: 'Inflation',
        paper: 'Paper 1',
        level: 'SL/HL',
        command: 'Evaluate',
        question: 'Evaluate the use of higher interest rates as a policy to reduce demand-pull inflation.',
    },
    {
        id: 'macro_03',
        topic: 'Unemployment',
        paper: 'Paper 1',
        level: 'SL/HL',
        command: 'Explain',
        question: 'Explain the difference between cyclical unemployment and structural unemployment, and outline one appropriate policy response for each.',
    },
    {
        id: 'macro_04',
        topic: 'Fiscal Policy',
        paper: 'Paper 1',
        level: 'SL/HL',
        command: 'Evaluate',
        question: 'Evaluate the effectiveness of expansionary fiscal policy in achieving economic growth during a recession.',
    },
    {
        id: 'macro_05',
        topic: 'Economic Growth vs Development',
        paper: 'Paper 1',
        level: 'SL/HL',
        command: 'Discuss',
        question: 'Discuss the extent to which high rates of economic growth always lead to improvements in living standards.',
    },

    // ── International Economics ───────────────────────────────────
    {
        id: 'intl_01',
        topic: 'Comparative Advantage',
        paper: 'Paper 2',
        level: 'SL/HL',
        command: 'Explain',
        question: 'Explain the theory of comparative advantage and discuss one limitation of using it to justify free trade.',
    },
    {
        id: 'intl_02',
        topic: 'Exchange Rates',
        paper: 'Paper 2',
        level: 'SL/HL',
        command: 'Explain',
        question: 'Using a demand and supply diagram, explain the likely effect of a rise in domestic interest rates on the exchange rate.',
    },
    {
        id: 'intl_03',
        topic: 'Balance of Payments',
        paper: 'Paper 2',
        level: 'HL',
        command: 'Evaluate',
        question: 'Evaluate the methods a government might use to reduce a persistent current account deficit.',
    },
    {
        id: 'intl_04',
        topic: 'Trade Protection',
        paper: 'Paper 2',
        level: 'SL/HL',
        command: 'Explain',
        question: 'Using an international trade diagram, explain how a tariff on imported goods affects domestic consumers, domestic producers, and government revenue.',
    },
    {
        id: 'intl_05',
        topic: 'Free Trade vs Protectionism',
        paper: 'Paper 1',
        level: 'HL',
        command: 'Evaluate',
        question: 'Evaluate the case for and against a developing country using protectionist policies to promote industrialisation.',
    },

    // ── Development Economics ─────────────────────────────────────
    {
        id: 'dev_01',
        topic: 'Poverty',
        paper: 'Paper 1',
        level: 'SL/HL',
        command: 'Explain',
        question: 'Explain why a country may have a high GDP per capita but still have high levels of absolute poverty.',
    },
    {
        id: 'dev_02',
        topic: 'Development Indicators',
        paper: 'Paper 2',
        level: 'SL/HL',
        command: 'Discuss',
        question: 'Discuss the strengths and limitations of using GDP per capita as a measure of economic development compared to the Human Development Index (HDI).',
    },
    {
        id: 'dev_03',
        topic: 'Aid',
        paper: 'Paper 1',
        level: 'SL/HL',
        command: 'Evaluate',
        question: 'Evaluate the effectiveness of foreign aid as a strategy to promote economic development in low-income countries.',
    },
    {
        id: 'dev_04',
        topic: 'Poverty Cycle',
        paper: 'Paper 1',
        level: 'SL/HL',
        command: 'Explain',
        question: 'Using a poverty cycle diagram, explain how low income levels can trap a country in a cycle of poverty.',
    },
    {
        id: 'dev_05',
        topic: 'Microfinance',
        paper: 'Paper 1',
        level: 'SL/HL',
        command: 'Evaluate',
        question: 'Evaluate microfinance as a market-based strategy for reducing poverty and promoting economic development.',
    },
];

const SYSTEM_PROMPT = `You are an expert IB Economics tutor. Answer the following IB Economics exam question clearly and accurately.
Structure your answer with: key definitions, relevant economic theory, a diagram description if applicable, and evaluation/analysis.
Keep your answer focused and exam-appropriate (aim for 200-400 words).`;

const SYSTEM_PROMPT_RAG = `You are an expert IB Economics tutor with access to IB past papers and mark schemes.
Answer the following IB Economics exam question using the provided context from past papers and mark schemes.
Structure your answer with: key definitions, relevant economic theory, a diagram description if applicable, and evaluation/analysis.
Reference the context where relevant. Keep your answer focused and exam-appropriate (200-400 words).`;

// ── Baseline: plain GPT, no context ──────────────────────────────

async function getBaselineAnswer(q, chatCompletion) {
    const start = Date.now();
    const result = await chatCompletion([
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: q.question },
    ], { max_tokens: 600 });
    return {
        answer: result.content,
        tokens: result.tokens,
        latencyMs: Date.now() - start,
        sources: [],
    };
}

// ── RAG: retrieve context then answer ────────────────────────────

async function getRagAnswer(q, retrieveContext, chatCompletion) {
    const start = Date.now();

    const context = await retrieveContext(q.question, {
        subject: 'Economics',
        curriculum: 'IB',
    });

    const contextBlock = context.length > 0
        ? context.map((c, i) => `[${i + 1}] ${c.chunkText || c.text || c}`).join('\n\n')
        : null;

    const messages = [
        { role: 'system', content: SYSTEM_PROMPT_RAG },
    ];

    if (contextBlock) {
        messages.push({
            role: 'user',
            content: `Context from IB Economics past papers and mark schemes:\n\n${contextBlock}\n\n---\n\nQuestion: ${q.question}`,
        });
    } else {
        messages.push({ role: 'user', content: q.question });
    }

    const result = await chatCompletion(messages, { max_tokens: 600 });

    return {
        answer: result.content,
        tokens: result.tokens,
        latencyMs: Date.now() - start,
        sources: context.map(c => ({
            sourceType: c.sourceType,
            sourceId: c.sourceId,
            chunkText: (c.chunkText || c.text || '').slice(0, 200),
            score: c.score,
        })),
        contextUsed: !!contextBlock,
        contextChunks: context.length,
    };
}

// ── Compare mode ─────────────────────────────────────────────────

function compare() {
    if (!fs.existsSync(RESULTS_FILE)) {
        console.error('No results file found. Run without --compare first.');
        process.exit(1);
    }
    const results = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));

    console.log(`\n${'='.repeat(80)}`);
    console.log('RAG EVALUATION COMPARISON');
    console.log(`Run at: ${results.metadata?.runAt}`);
    console.log(`Questions: ${results.results?.length}`);
    console.log('='.repeat(80));

    for (const r of results.results) {
        console.log(`\n[${r.id}] ${r.topic} — ${r.command}`);
        console.log(`Q: ${r.question.slice(0, 120)}...`);

        if (r.baseline) {
            console.log(`\n  BASELINE (${r.baseline.tokens} tokens, ${r.baseline.latencyMs}ms):`);
            console.log('  ' + r.baseline.answer.slice(0, 300).replace(/\n/g, '\n  ') + '...');
        }

        if (r.rag) {
            console.log(`\n  RAG (${r.rag.tokens} tokens, ${r.rag.latencyMs}ms, ${r.rag.contextChunks} chunks retrieved):`);
            if (r.rag.sources?.length > 0) {
                console.log(`  Sources: ${r.rag.sources.map(s => s.sourceType + ':' + s.sourceId).join(', ')}`);
            }
            console.log('  ' + r.rag.answer.slice(0, 300).replace(/\n/g, '\n  ') + '...');
        }
        console.log('-'.repeat(80));
    }

    // Summary stats
    const withBaseline = results.results.filter(r => r.baseline);
    const withRag = results.results.filter(r => r.rag);
    const ragWithContext = withRag.filter(r => r.rag.contextUsed);

    console.log('\n=== SUMMARY ===');
    if (withBaseline.length) {
        const avgTokens = Math.round(withBaseline.reduce((s, r) => s + r.baseline.tokens, 0) / withBaseline.length);
        console.log(`Baseline avg tokens: ${avgTokens}`);
    }
    if (withRag.length) {
        const avgTokens = Math.round(withRag.reduce((s, r) => s + r.rag.tokens, 0) / withRag.length);
        console.log(`RAG avg tokens: ${avgTokens}`);
        console.log(`RAG answers with context: ${ragWithContext.length}/${withRag.length}`);
        if (ragWithContext.length) {
            const avgChunks = (ragWithContext.reduce((s, r) => s + r.rag.contextChunks, 0) / ragWithContext.length).toFixed(1);
            console.log(`Avg chunks retrieved: ${avgChunks}`);
        }
    }
}

// ── Main ──────────────────────────────────────────────────────────

async function main() {
    if (COMPARE_ONLY) {
        compare();
        return;
    }

    // Load existing results if any
    let existing = { results: [] };
    if (fs.existsSync(RESULTS_FILE)) {
        existing = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
        console.log(`Loaded ${existing.results.length} existing results from ${RESULTS_FILE}`);
    }

    // Build a map of existing results by id
    const existingMap = {};
    for (const r of existing.results) existingMap[r.id] = r;

    // Lazy-load dependencies
    const { chatCompletion } = require('../services/openai');
    let retrieveContext = null;
    if (RUN_RAG) {
        retrieveContext = require('../services/ragRetriever').retrieveContext;
        const db = require('../models');
        await db.sequelize.authenticate();
        console.log('Database connected.\n');
    }

    const results = [];
    let baselineTokens = 0, ragTokens = 0;

    for (let i = 0; i < QUESTIONS.length; i++) {
        const q = QUESTIONS[i];
        const label = `[${i + 1}/${QUESTIONS.length}]`;
        console.log(`${label} ${q.id} — ${q.topic}`);

        const entry = {
            id: q.id,
            topic: q.topic,
            paper: q.paper,
            level: q.level,
            command: q.command,
            question: q.question,
            baseline: existingMap[q.id]?.baseline || null,
            rag: existingMap[q.id]?.rag || null,
        };

        if (RUN_BASELINE && !entry.baseline) {
            process.stdout.write('  baseline... ');
            try {
                entry.baseline = await getBaselineAnswer(q, chatCompletion);
                baselineTokens += entry.baseline.tokens;
                console.log(`done (${entry.baseline.tokens} tokens, ${entry.baseline.latencyMs}ms)`);
            } catch (err) {
                console.log(`FAIL: ${err.message}`);
                entry.baseline = { error: err.message };
            }
        } else if (entry.baseline) {
            console.log('  baseline: (cached)');
        }

        if (RUN_RAG && !entry.rag) {
            process.stdout.write('  rag... ');
            try {
                entry.rag = await getRagAnswer(q, retrieveContext, chatCompletion);
                ragTokens += entry.rag.tokens;
                console.log(`done (${entry.rag.tokens} tokens, ${entry.rag.contextChunks} chunks, ${entry.rag.latencyMs}ms)`);
            } catch (err) {
                console.log(`FAIL: ${err.message}`);
                entry.rag = { error: err.message };
            }
        } else if (entry.rag) {
            console.log('  rag: (cached)');
        }

        results.push(entry);
    }

    // Save results
    const output = {
        metadata: {
            runAt: new Date().toISOString(),
            totalQuestions: QUESTIONS.length,
            baselineTokensUsed: baselineTokens,
            ragTokensUsed: ragTokens,
        },
        results,
    };
    fs.writeFileSync(RESULTS_FILE, JSON.stringify(output, null, 2), 'utf8');

    console.log(`\n=== Done ===`);
    console.log(`Results saved to: ${RESULTS_FILE}`);
    if (baselineTokens) console.log(`Baseline tokens used: ${baselineTokens}`);
    if (ragTokens) console.log(`RAG tokens used: ${ragTokens}`);
    console.log(`\nRun with --compare to print side-by-side comparison.`);

    if (RUN_RAG) {
        const db = require('../models');
        await db.sequelize.close();
    }
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
