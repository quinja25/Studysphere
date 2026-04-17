const express = require('express');
const router = express.Router();
const { Questions, Answers, Users, AnswerVotes } = require('../models');
const { Op } = require('sequelize');
const { validateToken } = require('../middlewares/AuthMiddleware');
const { indexContent, removeContent } = require('../services/embeddingSync');
const { createAndEmit } = require('../services/notificationService');

// ── Questions ──

// GET /qa — paginated question list (optional ?subject=, ?search=, ?page=, ?limit=)
router.get('/', async (req, res) => {
    try {
        const where = {};
        if (req.query.subject) where.subject = req.query.subject; // exact match — subject is a dropdown value
        if (req.query.search) where.title = { [Op.like]: `%${req.query.search}%` };

        const page  = Math.max(1, parseInt(req.query.page)  || 1);
        const limit = Math.min(50, parseInt(req.query.limit) || 20);
        const offset = (page - 1) * limit;

        const { rows, count } = await Questions.findAndCountAll({
            where,
            include: [
                { model: Users, as: 'author', attributes: ['id', 'name', 'picture'] },
                { model: Answers, as: 'answers', attributes: ['id'] },
            ],
            order: [['createdAt', 'DESC']],
            limit,
            offset,
            distinct: true, // needed for correct count with includes
        });

        res.json({
            data: rows,
            total: count,
            page,
            totalPages: Math.ceil(count / limit),
            hasMore: offset + rows.length < count,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /qa/:id — single question with all answers
router.get('/:id', async (req, res) => {
    try {
        const question = await Questions.findByPk(req.params.id, {
            include: [
                { model: Users, as: 'author', attributes: ['id', 'name', 'picture'] },
                {
                    model: Answers, as: 'answers',
                    include: [{ model: Users, as: 'author', attributes: ['id', 'name', 'picture', 'role'] }],
                    order: [['isAccepted', 'DESC'], ['votes', 'DESC']],
                },
            ],
        });
        if (!question) return res.status(404).json({ error: 'Question not found' });
        res.json(question);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /qa — ask a question (auth required)
router.post('/', validateToken, async (req, res) => {
    const { title, body, subject, tags } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required.' });
    if (!body || !body.trim()) return res.status(400).json({ error: 'Question body is required.' });
    const tagsStr = Array.isArray(tags) ? tags.join(',') : (tags || null);
    try {
        const question = await Questions.create({ title: title.trim(), body, subject, tags: tagsStr, authorId: req.user.id });
        indexContent('question', question.id).catch(err => console.error('Embedding sync error:', err.message));
        res.status(201).json(question);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE /qa/:id — delete own question (auth required)
router.delete('/:id', validateToken, async (req, res) => {
    try {
        const question = await Questions.findByPk(req.params.id);
        if (!question) return res.status(404).json({ error: 'Not found' });
        if (question.authorId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
        const questionId = question.id;
        await question.destroy();
        removeContent('question', questionId).catch(err => console.error('Embedding sync error:', err.message));
        res.json({ message: 'Deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ── Answers ──

// POST /qa/:questionId/answers — post an answer (auth required)
router.post('/:questionId/answers', validateToken, async (req, res) => {
    const { content } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'Answer content is required.' });
    try {
        const question = await Questions.findByPk(req.params.questionId);
        if (!question) return res.status(404).json({ error: 'Question not found' });
        const answer = await Answers.create({
            content, questionId: req.params.questionId, authorId: req.user.id,
        });
        // reload to attach author association — avoids a second findByPk round-trip
        await answer.reload({
            include: [{ model: Users, as: 'author', attributes: ['id', 'name', 'picture', 'role'] }],
        });
        indexContent('answer', answer.id).catch(err => console.error('Embedding sync error:', err.message));

        // Notify the question author unless they answered their own question
        if (question.authorId && question.authorId !== req.user.id) {
            const authorName = answer.author?.name || 'Someone';
            createAndEmit({
                userId: question.authorId,
                type: 'answer',
                relatedType: 'question',
                relatedId: question.id,
                content: `${authorName} answered your question: "${question.title}"`,
                link: `/qa?question=${question.id}`,
            }, req.app.get('io')).catch(err => console.error('Notification error:', err.message));
        }

        res.status(201).json(answer);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /qa/answers/:id/vote — upvote an answer (one vote per user)
router.post('/answers/:id/vote', validateToken, async (req, res) => {
    try {
        const answer = await Answers.findByPk(req.params.id);
        if (!answer) return res.status(404).json({ error: 'Answer not found' });
        const [, created] = await AnswerVotes.findOrCreate({
            where: { userId: req.user.id, answerId: answer.id },
        });
        if (!created) return res.status(409).json({ error: 'Already voted' });
        await answer.increment('votes');
        res.json({ votes: answer.votes + 1 });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /qa/answers/:id/accept — question author marks answer as accepted
router.post('/answers/:id/accept', validateToken, async (req, res) => {
    try {
        const answer = await Answers.findByPk(req.params.id, {
            include: [{ model: Questions, as: undefined }], // raw include for ownership check
        });
        if (!answer) return res.status(404).json({ error: 'Answer not found' });

        const question = await Questions.findByPk(answer.questionId);
        if (!question || question.authorId !== req.user.id) {
            return res.status(403).json({ error: 'Only the question author can accept an answer' });
        }

        // Unaccept only the currently accepted answer — skip if none exists
        await Answers.update({ isAccepted: false }, { where: { questionId: answer.questionId, isAccepted: true } });
        await answer.update({ isAccepted: true });
        await question.update({ isAnswered: true });

        // Re-index so the embedding reflects accepted status and compound chunk is updated
        indexContent('answer', answer.id).catch(err => console.error('Embedding sync error:', err.message));

        res.json({ accepted: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE /qa/answers/:id — delete own answer
router.delete('/answers/:id', validateToken, async (req, res) => {
    try {
        const answer = await Answers.findByPk(req.params.id);
        if (!answer) return res.status(404).json({ error: 'Not found' });
        if (answer.authorId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
        const answerId = answer.id;
        await answer.destroy();
        removeContent('answer', answerId).catch(err => console.error('Embedding sync error:', err.message));
        res.json({ message: 'Deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
