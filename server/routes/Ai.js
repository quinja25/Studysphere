const express = require('express');
const multer = require('multer');
const router = express.Router();
const db = require('../models');
const { AiMessages, Groups, Users, Chats, UserDocuments, ContentEmbeddings } = db;
const { validateToken } = require('../middlewares/AuthMiddleware');
const { chatCompletion, getProviderLabel } = require('../services/openai');
const { estimateTokens } = require('../services/embeddingService');
const { retrieveContext } = require('../services/ragRetriever');
const { reindexAll, indexDocument, removeDocument } = require('../services/embeddingSync');
const { processDocument } = require('../services/documentProcessor');
const { rewriteQuery } = require('../services/queryRewriter');

// Accept PDFs up to 20MB in memory (no disk write)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (file.mimetype === 'application/pdf') cb(null, true);
        else cb(new Error('Only PDF files are accepted'));
    },
});

// IB command terms guide injected into the system prompt
const IB_PROMPT_ADDON =
    `\n\nThis platform serves IB students. When answering, follow IB assessment conventions:\n` +
    `- Command term awareness: Analyse (detailed examination of elements), Calculate (show working), ` +
    `Compare (similarities AND differences), Contrast (only differences), Deduce (reach conclusion from given info), ` +
    `Define (formal precise meaning), Describe (detailed account of features), Discuss (reasoned argument covering multiple viewpoints), ` +
    `Evaluate (make a judgement based on evidence and reasoning), Explain (give reasons/mechanisms, not just state facts), ` +
    `Identify (select/name), Justify (provide valid reasons), Outline (brief account without detail), ` +
    `State (specific brief answer with no explanation), Suggest (propose a hypothesis or answer), ` +
    `To what extent (balanced argument with a conclusion).\n` +
    `- Structure answers to match mark allocations (1 mark = 1 distinct point).\n` +
    `- Reference HL vs SL depth where relevant.\n` +
    `- Cite uploaded textbooks or past papers when they appear in the knowledge base.`;

const DAILY_TOKEN_LIMIT = parseInt(process.env.AI_DAILY_TOKEN_LIMIT || '50000', 10);

/**
 * Check and reset daily AI credits for a user.
 * Returns the user record (mutated if reset happened).
 */
async function ensureDailyCredits(user) {
    const now = new Date();
    const resetAt = user.aiCreditsResetAt ? new Date(user.aiCreditsResetAt) : null;

    // Reset if never set or if the last reset was before today
    if (!resetAt || resetAt.toDateString() !== now.toDateString()) {
        user.aiCreditsUsed = 0;
        user.aiCreditsResetAt = now;
        await user.save();
    }
    return user;
}

// ──────────────────────────────────────────────
// POST /ai/chat — Send a message to the AI
// ──────────────────────────────────────────────
router.post('/chat', validateToken, async (req, res) => {
    try {
        const { groupId, message } = req.body;
        const userId = req.user.id;

        if (!groupId || !message) {
            return res.status(400).json({ error: 'groupId and message are required' });
        }

        // 1. Verify user is a member of the group
        const JoinTable = db.Groups_Users || db.UserGroup;
        const membership = await JoinTable.findOne({
            where: { UserId: userId, GroupId: groupId }
        });
        if (!membership) {
            return res.status(403).json({ error: 'You must be a member of this group' });
        }

        // 2. Fetch user and group in parallel
        const [user, group] = await Promise.all([
            Users.findByPk(userId),
            Groups.findByPk(groupId),
        ]);
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (!group) return res.status(404).json({ error: 'Group not found' });

        await ensureDailyCredits(user);

        if (user.aiCreditsUsed >= DAILY_TOKEN_LIMIT) {
            return res.status(429).json({
                error: 'Daily AI credit limit reached. Try again tomorrow.',
                creditsUsed: user.aiCreditsUsed,
                creditsLimit: DAILY_TOKEN_LIMIT,
            });
        }

        // 4. Build conversation context
        // Fetch recent AI messages newest-first, then trim to a token budget.
        // Without a budget, a long study session (20 detailed messages) can easily
        // consume 8,000–12,000 tokens of context before the user's question is even sent.
        const aiHistoryRaw = await AiMessages.findAll({
            where: { groupId },
            order: [['createdAt', 'DESC']],
            limit: 40,
        });
        const HISTORY_TOKEN_BUDGET = 3000;
        let historyTokens = 0;
        const aiHistory = [];
        for (const msg of aiHistoryRaw) {
            const t = estimateTokens(msg.content);
            if (historyTokens + t > HISTORY_TOKEN_BUDGET) break;
            historyTokens += t;
            aiHistory.unshift(msg); // restore chronological order (oldest first)
        }

        // Recent chat messages for room awareness (last 10)
        const recentChats = await Chats.findAll({
            where: { GroupId: groupId },
            order: [['createdAt', 'DESC']],
            limit: 10,
        });

        // Build system prompt
        const subjectInfo = [group.subject, group.major, group.gradeLevel]
            .filter(Boolean)
            .join(', ');

        const systemPrompt = `You are a helpful study assistant embedded in a collaborative study room${subjectInfo ? ` focused on: ${subjectInfo}` : ''}. `
            + `The room is called "${group.groupName}". `
            + `Be concise, educational, and encouraging. `
            + `Help students understand concepts, suggest study strategies, and answer questions. `
            + `Keep responses under 300 words unless the student asks for a detailed explanation. `
            + `If relevant knowledge base content is provided below, use it to give more accurate and specific answers. `
            + `Prioritise content from uploaded textbooks and past papers over general platform content. `
            + `Always cite your sources when using knowledge base content (e.g., "According to the Biology HL textbook, Section 2.1..."). `
            + `If the knowledge base content is not relevant to the question, ignore it and answer from your general knowledge.`
            + IB_PROMPT_ADDON;

        // Build messages array for OpenAI
        const openaiMessages = [{ role: 'system', content: systemPrompt }];

        // Add recent chat context if any
        if (recentChats.length > 0) {
            const chatSummary = recentChats
                .reverse()
                .map(c => `${c.author}: ${c.message}`)
                .join('\n');
            openaiMessages.push({
                role: 'system',
                content: `Here is the recent group chat for context:\n${chatSummary}`
            });
        }

        // 5. RAG — retrieve relevant knowledge base content + user's uploaded documents.
        // Query rewriter expands follow-ups using AiMessages history (retrieval only;
        // the original message still goes to the LLM).
        const rewriteHistory = aiHistory.map(m => ({ role: m.role, content: m.content }));
        const retrievalQuery = await rewriteQuery(message, rewriteHistory);
        const ragChunks = await retrieveContext(retrievalQuery, {
            subject: group.subject || user.subject || null,
            major: group.major || user.major || null,
            gradeLevel: group.gradeLevel || user.gradeLevel || null,
            userId,
            isPro: user.isPro || false,
            maxChunks: 5,
        });

        if (ragChunks.length > 0) {
            const contextBlock = ragChunks.map((chunk, i) =>
                `[Source ${i + 1}: ${chunk.source} — "${chunk.title}"]\n${chunk.content}\n(${chunk.metadata})`
            ).join('\n\n');
            openaiMessages.push({
                role: 'system',
                content: `Relevant content from the StudySphere knowledge base:\n\n${contextBlock}`
            });
        }

        // Add AI conversation history
        for (const msg of aiHistory) {
            openaiMessages.push({ role: msg.role, content: msg.content });
        }

        // Add the new user message
        openaiMessages.push({ role: 'user', content: message });

        // 5. Call OpenAI
        const aiResponse = await chatCompletion(openaiMessages);

        // 6. Save both messages to DB
        const userMsg = await AiMessages.create({
            groupId,
            userId,
            role: 'user',
            content: message,
            tokens: 0,
        });

        const assistantMsg = await AiMessages.create({
            groupId,
            userId,
            role: 'assistant',
            content: aiResponse.content,
            tokens: aiResponse.tokens,
        });

        // 7. Atomically update daily credits.
        // Using a SQL-level increment avoids a race condition where two concurrent requests
        // both read the same stale value, increment it locally, then overwrite each other.
        await Users.update(
            { aiCreditsUsed: db.sequelize.literal(`aiCreditsUsed + ${aiResponse.tokens}`) },
            { where: { id: userId } }
        );
        const estimatedCreditsUsed = user.aiCreditsUsed + aiResponse.tokens;

        res.json({
            userMessage: userMsg,
            assistantMessage: assistantMsg,
            creditsUsed: estimatedCreditsUsed,
            creditsLimit: DAILY_TOKEN_LIMIT,
            sources: ragChunks.map(c => ({ title: c.title, source: c.source })),
        });
    } catch (error) {
        console.error('AI chat error:', error);
        if (error.status === 401 || error.code === 'invalid_api_key') {
            return res.status(503).json({ error: 'AI service is not configured. Please set OPENAI_API_KEY.' });
        }
        res.status(500).json({ error: 'Failed to get AI response' });
    }
});

// ──────────────────────────────────────────────
// POST /ai/quiz — Generate quiz questions based on session context
// ──────────────────────────────────────────────
router.post('/quiz', validateToken, async (req, res) => {
    try {
        const { groupId, topic, difficulty, numQuestions } = req.body;
        const userId = req.user.id;

        let user, group;

        if (groupId) {
            const JoinTable = db.Groups_Users || db.UserGroup;
            const membership = await JoinTable.findOne({
                where: { UserId: userId, GroupId: groupId }
            });
            if (!membership) {
                return res.status(403).json({ error: 'You must be a member of this group' });
            }

            [user, group] = await Promise.all([
                Users.findByPk(userId),
                Groups.findByPk(groupId),
            ]);
            if (!user) return res.status(404).json({ error: 'User not found' });
            if (!group) return res.status(404).json({ error: 'Group not found' });
        } else {
            user = await Users.findByPk(userId);
            if (!user) return res.status(404).json({ error: 'User not found' });
        }

        await ensureDailyCredits(user);
        if (user.aiCreditsUsed >= DAILY_TOKEN_LIMIT) {
            return res.status(429).json({ error: 'Daily AI credit limit reached.' });
        }

        let recentChats = [];
        let aiHistory = [];

        if (groupId) {
            recentChats = await Chats.findAll({
                where: { GroupId: groupId },
                order: [['createdAt', 'DESC']],
                limit: 20,
            });
            aiHistory = await AiMessages.findAll({
                where: { groupId },
                order: [['createdAt', 'DESC']],
                limit: 10,
            });
        }

        const subjectInfo = group
            ? [group.subject, group.major, group.gradeLevel].filter(Boolean).join(', ')
            : user.subject || '';

        const count = Math.min(Math.max(parseInt(numQuestions) || 3, 1), 5);
        const diff = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'medium';

        let contextBlock = '';
        if (recentChats.length > 0) {
            contextBlock += 'Recent group chat:\n' + recentChats.reverse().map(c => `${c.author}: ${c.message}`).join('\n') + '\n\n';
        }
        if (aiHistory.length > 0) {
            contextBlock += 'Recent AI discussion:\n' + aiHistory.reverse().map(m => `${m.role}: ${m.content}`).join('\n') + '\n\n';
        }

        // RAG — retrieve relevant knowledge base content + user's uploaded documents for quiz generation
        const quizSubject = (group ? group.subject : user.subject) || '';
        const ragChunks = await retrieveContext(topic || quizSubject, {
            subject: quizSubject,
            userId,
            maxChunks: 3,
        });
        if (ragChunks.length > 0) {
            contextBlock += 'Relevant knowledge base content:\n' +
                ragChunks.map(c => `[${c.source}] ${c.title}: ${c.content}`).join('\n') + '\n\n';
        }

        // response_format: json_object requires the system prompt to mention "JSON"
        const systemPrompt = `You are a quiz generator for a study group${subjectInfo ? ` studying: ${subjectInfo}` : ''}. `
            + `Generate exactly ${count} multiple-choice questions at ${diff} difficulty. `
            + (topic ? `Focus the questions on: ${topic}. ` : `Base questions on what the group has been discussing. `)
            + `Respond with valid JSON only, using this exact object format:\n`
            + `{"questions":[{"question":"...","options":["A)...","B)...","C)...","D)..."],"correctIndex":0,"explanation":"..."}]}`;

        const messages = [
            { role: 'system', content: systemPrompt },
        ];
        if (contextBlock) {
            messages.push({ role: 'system', content: contextBlock });
        }
        messages.push({ role: 'user', content: `Generate ${count} ${diff} quiz questions${topic ? ` about ${topic}` : ''}.` });

        // json_object mode guarantees valid JSON — no regex extraction needed
        const aiResponse = await chatCompletion(messages, {
            temperature: 0.8,
            response_format: { type: 'json_object' },
        });

        let quiz;
        try {
            const parsed = JSON.parse(aiResponse.content);
            // Support {"questions":[...]} (json_object mode) and bare arrays (fallback)
            quiz = Array.isArray(parsed) ? parsed : (parsed.questions || []);
            if (!Array.isArray(quiz) || quiz.length === 0) throw new Error('Empty quiz');
        } catch {
            return res.status(500).json({ error: 'Failed to parse quiz. Try again.' });
        }

        // Save as AI messages for history
        const userMsg = await AiMessages.create({
            groupId: groupId || null, userId, role: 'user',
            content: `[Quiz Request] ${count} ${diff} questions${topic ? ` on "${topic}"` : ''}`,
            tokens: 0,
        });
        const assistantMsg = await AiMessages.create({
            groupId: groupId || null, userId, role: 'assistant',
            content: `[Quiz] Generated ${quiz.length} questions`,
            tokens: aiResponse.tokens,
        });

        // Atomic credit update — same pattern as /ai/chat
        await Users.update(
            { aiCreditsUsed: db.sequelize.literal(`aiCreditsUsed + ${aiResponse.tokens}`) },
            { where: { id: userId } }
        );

        res.json({
            quiz,
            userMessage: userMsg,
            assistantMessage: assistantMsg,
            creditsUsed: user.aiCreditsUsed + aiResponse.tokens,
            creditsLimit: DAILY_TOKEN_LIMIT,
        });
    } catch (error) {
        console.error('AI quiz error:', error);
        if (error.status === 401 || error.code === 'invalid_api_key') {
            return res.status(503).json({ error: 'AI service is not configured.' });
        }
        res.status(500).json({ error: 'Failed to generate quiz' });
    }
});

// ──────────────────────────────────────────────
// GET /ai/history/:groupId — Get AI conversation history
// ──────────────────────────────────────────────
router.get('/history/:groupId', validateToken, async (req, res) => {
    try {
        const { groupId } = req.params;
        const messages = await AiMessages.findAll({
            where: { groupId },
            order: [['createdAt', 'ASC']],
            include: [{ model: Users, attributes: ['id', 'name', 'picture'] }],
        });
        res.json(messages);
    } catch (error) {
        console.error('AI history error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ──────────────────────────────────────────────
// DELETE /ai/history/:groupId — Clear AI history (any group member)
// ──────────────────────────────────────────────
router.delete('/history/:groupId', validateToken, async (req, res) => {
    try {
        const { groupId } = req.params;
        await AiMessages.destroy({ where: { groupId } });
        res.json({ message: 'AI history cleared' });
    } catch (error) {
        console.error('AI clear error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ──────────────────────────────────────────────
// GET /ai/sources — Search the knowledge base directly
// ──────────────────────────────────────────────
router.get('/sources', validateToken, async (req, res) => {
    try {
        const { q, groupId } = req.query;
        if (!q) return res.status(400).json({ error: 'Query parameter "q" is required' });

        let subject = null;
        if (groupId) {
            const group = await Groups.findByPk(groupId);
            if (group) subject = group.subject;
        }

        const chunks = await retrieveContext(q, { subject, maxChunks: 10 });
        res.json({ sources: chunks });
    } catch (error) {
        console.error('AI sources error:', error);
        res.status(500).json({ error: 'Failed to search knowledge base' });
    }
});

// ──────────────────────────────────────────────
// GET /ai/credits — Get current user's AI credit status
// ──────────────────────────────────────────────
router.get('/credits', validateToken, async (req, res) => {
    try {
        const user = await Users.findByPk(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        await ensureDailyCredits(user);
        res.json({
            creditsUsed: user.aiCreditsUsed,
            creditsLimit: DAILY_TOKEN_LIMIT,
            creditsRemaining: Math.max(0, DAILY_TOKEN_LIMIT - user.aiCreditsUsed),
            provider: getProviderLabel(),
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ──────────────────────────────────────────────
// POST /ai/suggest — Auto-suggest title + hashtags from content
// ──────────────────────────────────────────────
router.post('/suggest', validateToken, async (req, res) => {
    try {
        const { content, type } = req.body;
        if (!content?.trim()) return res.status(400).json({ error: 'content is required' });

        const typeLabel = type === 'wiki' ? 'wiki article' : 'Q&A question';
        const messages = [
            {
                role: 'system',
                content: `You are a content tagging assistant for an academic study platform. Analyze the given ${typeLabel} and respond with ONLY valid JSON — no markdown, no explanation. Format:\n{"suggestedTitle":"...","suggestedTags":["tag1","tag2","tag3"]}\nRules:\n- Title: clear, specific, 5-12 words\n- Tags: 3-6 tags, lowercase, hyphens for spaces, no # prefix, academically relevant`,
            },
            { role: 'user', content: content.slice(0, 2000) },
        ];

        const aiResponse = await chatCompletion(messages, { temperature: 0.3 });
        const jsonMatch = aiResponse.content.match(/\{[\s\S]*\}/);
        const result = JSON.parse(jsonMatch ? jsonMatch[0] : aiResponse.content);

        res.json({
            suggestedTitle: result.suggestedTitle || '',
            suggestedTags: Array.isArray(result.suggestedTags) ? result.suggestedTags : [],
        });
    } catch (error) {
        console.error('AI suggest error:', error);
        res.status(500).json({ error: 'Failed to generate suggestions' });
    }
});

// ──────────────────────────────────────────────
// POST /ai/ask — Standalone knowledge chat (no group required)
// Accepts { message, history[] } — history is kept client-side; the server is stateless.
// ──────────────────────────────────────────────
router.post('/ask', validateToken, async (req, res) => {
    try {
        const { message, history, subject: subjectOverride } = req.body;
        const userId = req.user.id;
        if (!message?.trim()) return res.status(400).json({ error: 'message is required' });

        const user = await Users.findByPk(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });
        await ensureDailyCredits(user);
        if (user.aiCreditsUsed >= DAILY_TOKEN_LIMIT) {
            return res.status(429).json({ error: 'Daily AI credit limit reached. Try again tomorrow.' });
        }

        // Rewrite the query with conversational context for retrieval only.
        // Original `message` still goes to the LLM so the final answer addresses the raw question.
        const retrievalQuery = await rewriteQuery(message, Array.isArray(history) ? history : []);
        const ragChunks = await retrieveContext(retrievalQuery, {
            userId,
            subject: subjectOverride || user.subject || null,
            major: user.major || null,
            gradeLevel: user.gradeLevel || null,
            isPro: user.isPro || false,
            maxChunks: 6,
        });

        const userContext = [user.curriculum, subjectOverride || user.subject, user.gradeLevel]
            .filter(Boolean).join(', ');

        const systemPrompt =
            `You are a knowledgeable study assistant for the StudySphere academic platform` +
            (userContext ? `, helping a ${user.role || 'student'} studying ${userContext}` : '') + `. ` +
            `You have access to content from the platform's Wiki, Q&A board, posts, resources, and the user's uploaded textbooks and past papers. ` +
            `Prioritise content that matches the user's subject and curriculum level. ` +
            `Prioritise uploaded textbooks and past papers when they are available, cite your sources clearly, ` +
            `and answer concisely. If no relevant content is found, answer from general knowledge.` +
            IB_PROMPT_ADDON;

        const openaiMessages = [{ role: 'system', content: systemPrompt }];

        if (ragChunks.length > 0) {
            const ctx = ragChunks.map((c, i) =>
                `[Source ${i + 1} — ${c.source}: "${c.title}"]\n${c.content}`
            ).join('\n\n');
            openaiMessages.push({ role: 'system', content: `Knowledge base:\n\n${ctx}` });
        }

        // Last 10 turns of conversation history sent from client
        if (Array.isArray(history)) {
            openaiMessages.push(...history.slice(-10).map(m => ({ role: m.role, content: m.content })));
        }
        openaiMessages.push({ role: 'user', content: message });

        const aiResponse = await chatCompletion(openaiMessages);

        await Users.update(
            { aiCreditsUsed: db.sequelize.literal(`aiCreditsUsed + ${aiResponse.tokens}`) },
            { where: { id: userId } }
        );

        res.json({
            answer: aiResponse.content,
            sources: ragChunks.map(c => ({
                title: c.title,
                source: c.source,
                sourceId: c.sourceId,
                preview: c.content.slice(0, 220),
            })),
            creditsUsed: user.aiCreditsUsed + aiResponse.tokens,
            creditsLimit: DAILY_TOKEN_LIMIT,
        });
    } catch (error) {
        console.error('AI ask error:', error);
        if (error.status === 401 || error.code === 'invalid_api_key') {
            return res.status(503).json({ error: 'AI service is not configured.' });
        }
        res.status(500).json({ error: 'Failed to get answer' });
    }
});

// ──────────────────────────────────────────────
// POST /ai/upload-document — Upload a PDF (textbook, past paper, notes)
// Processes, embeds, and stores permanently per user.
// ──────────────────────────────────────────────
router.post('/upload-document', validateToken, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'PDF file is required' });

        const { title, subject, docType } = req.body;
        if (!title?.trim()) return res.status(400).json({ error: 'title is required' });

        const validTypes = ['textbook', 'past_paper', 'notes', 'other'];
        const type = validTypes.includes(docType) ? docType : 'other';

        const userId = req.user.id;

        // Extract text + chunk according to document type
        const { chunks, pages } = await processDocument(req.file.buffer, {
            title: title.trim(),
            subject: subject?.trim() || null,
            docType: type,
        });

        if (chunks.length === 0) {
            return res.status(422).json({ error: 'Could not extract text from this PDF. Make sure it is not a scanned image.' });
        }

        // Save document record first (need the ID for embeddings)
        const doc = await UserDocuments.create({
            userId,
            title: title.trim(),
            subject: subject?.trim() || null,
            docType: type,
            pageCount: pages,
            chunkCount: chunks.length,
        });

        // Embed and store all chunks — runs in background so we respond immediately
        res.json({
            message: 'Document uploaded. Indexing in progress — it will be searchable in a few moments.',
            document: {
                id: doc.id,
                title: doc.title,
                subject: doc.subject,
                docType: doc.docType,
                pageCount: doc.pageCount,
                chunkCount: doc.chunkCount,
            },
        });

        // Async indexing after response is sent
        indexDocument(userId, doc.id, chunks, subject?.trim() || null).catch(err => {
            console.error(`Failed to index document ${doc.id}:`, err.message);
        });

    } catch (error) {
        console.error('Document upload error:', error);
        if (error.message === 'Only PDF files are accepted') {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: 'Failed to process document' });
    }
});

// ──────────────────────────────────────────────
// GET /ai/documents — List the current user's uploaded documents
// ──────────────────────────────────────────────
router.get('/documents', validateToken, async (req, res) => {
    try {
        const docs = await UserDocuments.findAll({
            where: { userId: req.user.id },
            order: [['createdAt', 'DESC']],
            attributes: ['id', 'title', 'subject', 'docType', 'pageCount', 'chunkCount', 'createdAt'],
        });
        res.json(docs);
    } catch (error) {
        console.error('Documents list error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ──────────────────────────────────────────────
// DELETE /ai/documents/:id — Delete a document and its embeddings
// ──────────────────────────────────────────────
router.delete('/documents/:id', validateToken, async (req, res) => {
    try {
        const doc = await UserDocuments.findOne({
            where: { id: req.params.id, userId: req.user.id },
        });
        if (!doc) return res.status(404).json({ error: 'Document not found' });

        await removeDocument(doc.id);
        await doc.destroy();

        res.json({ message: 'Document deleted' });
    } catch (error) {
        console.error('Document delete error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ──────────────────────────────────────────────
// POST /ai/reindex — Re-index all content for vector search
// ──────────────────────────────────────────────
router.post('/reindex', validateToken, async (req, res) => {
    try {
        // Start reindexing in the background — don't block the response
        res.json({ message: 'Reindexing started. This may take a few minutes.' });

        const result = await reindexAll((progress) => {
            console.log(`Reindex progress: ${progress.type}/${progress.id} — ${progress.indexed} indexed, ${progress.errors} errors`);
        });

        console.log(`Reindex complete: ${result.indexed} indexed, ${result.errors} errors`);
    } catch (error) {
        console.error('Reindex error:', error);
    }
});

module.exports = router;
