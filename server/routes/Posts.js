const express = require('express');
const router = express.Router();
const { Posts, Users } = require('../models');
const { validateToken } = require('../middlewares/AuthMiddleware');
const { indexContent, removeContent } = require('../services/embeddingSync');

// GET /posts/byAuthor/:id
router.get('/byAuthor/:id', async (req, res) => {
    try {
        const posts = await Posts.findAll({
            where: { authorId: req.params.id },
            order: [['createdAt', 'DESC']],
        });
        res.json(posts);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /posts/:id — single post
router.get('/:id', async (req, res) => {
    try {
        const post = await Posts.findByPk(req.params.id, {
            include: [{ model: Users, as: 'author', attributes: ['id', 'name', 'picture'] }],
        });
        if (!post) return res.status(404).json({ error: 'Post not found' });
        res.json(post);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /posts — create post (auth required)
router.post('/', validateToken, async (req, res) => {
    const { title, content, type } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required.' });
    if (!content || !content.trim()) return res.status(400).json({ error: 'Content is required.' });
    try {
        const post = await Posts.create({ title: title.trim(), content, type, authorId: req.user.id });
        indexContent('post', post.id).catch(err => console.error('Embedding sync error:', err.message));
        res.status(201).json(post);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /posts/:id/like — like a post
router.post('/:id/like', async (req, res) => {
    try {
        const post = await Posts.findByPk(req.params.id);
        if (!post) return res.status(404).json({ error: 'Post not found' });
        await post.increment('likes');
        res.json({ likes: post.likes + 1 });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE /posts/:id/like — unlike a post
router.delete('/:id/like', async (req, res) => {
    try {
        const post = await Posts.findByPk(req.params.id);
        if (!post) return res.status(404).json({ error: 'Post not found' });
        const newLikes = Math.max(0, post.likes - 1);
        await post.update({ likes: newLikes });
        res.json({ likes: newLikes });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE /posts/:id — delete own post (auth required)
router.delete('/:id', validateToken, async (req, res) => {
    try {
        const post = await Posts.findByPk(req.params.id);
        if (!post) return res.status(404).json({ error: 'Post not found' });
        if (post.authorId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
        const postId = post.id;
        await post.destroy();
        removeContent('post', postId).catch(err => console.error('Embedding sync error:', err.message));
        res.json({ message: 'Deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
