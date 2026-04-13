const express = require('express');
const router = express.Router();
const { WikiArticles, Users } = require('../models');
const { Op } = require('sequelize');
const { validateToken } = require('../middlewares/AuthMiddleware');
const { indexContent, removeContent } = require('../services/embeddingSync');

// GET /wiki — list all articles (with optional ?subject= filter and ?search= query)

// researched into ANNOY and HNSW for more efficient similarity search, but for now we'll do a brute-force approach since 
// we don't expect a huge number of wiki articles; can optimize later if needed

router.get('/', async (req, res) => {
    try {
        const where = {};
        if (req.query.subject) where.subject = req.query.subject; // exact match — subject is a dropdown value
        if (req.query.search)  where.title   = { [Op.like]: `%${req.query.search}%` };

        const page  = Math.max(1, parseInt(req.query.page)  || 1);
        const limit = Math.min(50, parseInt(req.query.limit) || 20);
        const offset = (page - 1) * limit;

        const { rows, count } = await WikiArticles.findAndCountAll({
            where,
            include: [{ model: Users, as: 'author', attributes: ['id', 'name', 'picture'] }],
            order: [['createdAt', 'DESC']],
            attributes: { exclude: ['content'] },
            limit,
            offset,
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

// GET /wiki/:id — single article (increments view count)
router.get('/:id', async (req, res) => {
    try {
        const article = await WikiArticles.findByPk(req.params.id, {
            include: [{ model: Users, as: 'author', attributes: ['id', 'name', 'picture'] }],
        });
        if (!article) return res.status(404).json({ error: 'Article not found' });
        await article.increment('views');
        res.json(article);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /wiki — create article (auth required)
router.post('/', validateToken, async (req, res) => {
    const { title, content, subject, tags } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required.' });
    if (!content || !content.trim()) return res.status(400).json({ error: 'Content is required.' });
    const tagsStr = Array.isArray(tags) ? tags.join(',') : (tags || null);
    try {
        const article = await WikiArticles.create({
            title: title.trim(), content, subject, tags: tagsStr, authorId: req.user.id,
        });
        indexContent('wiki', article.id).catch(err => console.error('Embedding sync error:', err.message));
        res.status(201).json(article);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// PUT /wiki/:id — update own article (auth required)
router.put('/:id', validateToken, async (req, res) => {
    try {
        const article = await WikiArticles.findByPk(req.params.id);
        if (!article) return res.status(404).json({ error: 'Article not found' });
        if (article.authorId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
        const { title, content, subject, tags } = req.body;
        if (title !== undefined && !title.trim()) return res.status(400).json({ error: 'Title cannot be empty.' });
        if (content !== undefined && !content.trim()) return res.status(400).json({ error: 'Content cannot be empty.' });
        const tagsStr = Array.isArray(tags) ? tags.join(',') : (tags || null);
        await article.update({ title: title?.trim() ?? article.title, content, subject, tags: tagsStr });
        indexContent('wiki', article.id).catch(err => console.error('Embedding sync error:', err.message));
        res.json(article);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE /wiki/:id — delete own article (auth required)
router.delete('/:id', validateToken, async (req, res) => {
    try {
        const article = await WikiArticles.findByPk(req.params.id);
        if (!article) return res.status(404).json({ error: 'Article not found' });
        if (article.authorId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
        const articleId = article.id;
        await article.destroy();
        removeContent('wiki', articleId).catch(err => console.error('Embedding sync error:', err.message));
        res.json({ message: 'Deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
