const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { Op } = require('sequelize');
const db = require('../models');
const { Questions, Answers } = db;
const { chatCompletion } = require('../services/openai');
const { retrieveContext } = require('../services/ragRetriever');

const IB_PROMPT_ADDON =
    `\n\nThis platform serves IB students. Follow IB assessment conventions:\n` +
    `- Command term awareness: Define, Describe, Explain, Discuss, Evaluate, Compare, Contrast, etc.\n` +
    `- Reference HL vs SL depth when relevant.\n` +
    `- Keep answers concise (under 180 words for this preview).\n` +
    `- Cite sources when knowledge-base content is used.`;

const aiTryLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000,
    max: 3,
    message: { error: 'Free preview limit reached — sign up free to keep going.', rateLimited: true },
    standardHeaders: true,
    legacyHeaders: false,
});

router.get('/stats', async (req, res) => {
    try {
        const roomUsers = req.app.get('roomUsers');
        let activeRooms = 0;
        let studentsOnline = 0;
        if (roomUsers && typeof roomUsers.forEach === 'function') {
            roomUsers.forEach((members) => {
                if (members && members.size > 0) {
                    activeRooms += 1;
                    studentsOnline += members.size;
                }
            });
        }

        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const [questionsLast24h, unansweredQuestions, latestAnswer] = await Promise.all([
            Questions.count({ where: { createdAt: { [Op.gte]: since } } }).catch(() => 0),
            Questions.count({ where: { isAnswered: false } }).catch(() => 0),
            Answers.findOne({ order: [['createdAt', 'DESC']], attributes: ['createdAt'] }).catch(() => null),
        ]);

        let lastAnswerMinutesAgo = null;
        if (latestAnswer?.createdAt) {
            lastAnswerMinutesAgo = Math.max(
                0,
                Math.round((Date.now() - new Date(latestAnswer.createdAt).getTime()) / 60000)
            );
        }

        res.set('Cache-Control', 'public, max-age=30');
        res.json({
            studentsOnline,
            activeRooms,
            questionsLast24h,
            unansweredQuestions,
            lastAnswerMinutesAgo,
        });
    } catch (err) {
        console.error('Public stats error:', err);
        res.status(200).json({
            studentsOnline: 0,
            activeRooms: 0,
            questionsLast24h: 0,
            unansweredQuestions: 0,
            lastAnswerMinutesAgo: null,
        });
    }
});

router.get('/open-questions', async (req, res) => {
    try {
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 3, 1), 6);
        const rows = await Questions.findAll({
            where: { isAnswered: false },
            order: [['createdAt', 'DESC']],
            limit,
            attributes: ['id', 'title', 'subject', 'createdAt'],
        });
        res.set('Cache-Control', 'public, max-age=30');
        res.json({
            questions: rows.map(r => ({
                id: r.id,
                title: r.title,
                subject: r.subject,
                createdAt: r.createdAt,
            })),
        });
    } catch (err) {
        console.error('Public open-questions error:', err);
        res.status(200).json({ questions: [] });
    }
});

router.post('/ai-try', aiTryLimiter, async (req, res) => {
    try {
        const { message } = req.body || {};
        if (!message || typeof message !== 'string' || !message.trim()) {
            return res.status(400).json({ error: 'message is required' });
        }
        if (message.length > 200) {
            return res.status(400).json({ error: 'Preview is limited to 200 characters. Sign up for unlimited.' });
        }

        const ragChunks = await retrieveContext(message, {
            subject: null,
            maxChunks: 3,
        }).catch(() => []);

        const systemPrompt =
            `You are the StudySphere AI study assistant — a preview demo on the public landing page. ` +
            `You specialise in the International Baccalaureate (IB) curriculum. ` +
            `Answer the student's question clearly and concisely. ` +
            `If relevant knowledge-base content is provided, cite it. ` +
            `End with a one-line nudge to sign up if they want full access.` +
            IB_PROMPT_ADDON;

        const messages = [{ role: 'system', content: systemPrompt }];
        if (ragChunks.length > 0) {
            const ctx = ragChunks
                .map((c, i) => `[Source ${i + 1} — ${c.source}: "${c.title}"]\n${c.content}`)
                .join('\n\n');
            messages.push({ role: 'system', content: `Knowledge base:\n\n${ctx}` });
        }
        messages.push({ role: 'user', content: message });

        const aiResponse = await chatCompletion(messages, { max_tokens: 320 });

        const remaining = Math.max(
            0,
            parseInt(res.getHeader('RateLimit-Remaining') || '0', 10)
        );

        res.json({
            answer: aiResponse.content,
            sources: ragChunks.map(c => ({
                title: c.title,
                source: c.source,
                preview: (c.content || '').slice(0, 160),
            })),
            remainingToday: remaining,
        });
    } catch (err) {
        console.error('Public ai-try error:', err);
        if (err.status === 401 || err.code === 'invalid_api_key') {
            return res.status(503).json({ error: 'AI preview is temporarily unavailable.' });
        }
        res.status(500).json({ error: 'Failed to get answer. Please try again.' });
    }
});

module.exports = router;
