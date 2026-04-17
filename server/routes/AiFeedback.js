const express = require('express');
const router = express.Router();
const { AiFeedback } = require('../models');
const { validateToken } = require('../middlewares/AuthMiddleware');

// POST / — submit feedback for an AI response
router.post('/', validateToken, async (req, res) => {
    const { messageId, queryText, rating, comment, clickedSources } = req.body;
    if (!queryText) return res.status(400).json({ error: 'queryText is required' });
    if (!rating || !['up', 'down'].includes(rating)) {
        return res.status(400).json({ error: "rating must be 'up' or 'down'" });
    }
    try {
        const row = await AiFeedback.create({
            userId: req.user.id,
            messageId: messageId || null,
            queryText,
            rating,
            comment: comment || null,
            clickedSources: clickedSources ? JSON.stringify(clickedSources) : null,
        });
        res.status(201).json(row);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /my — last 50 feedback rows for the current user
router.get('/my', validateToken, async (req, res) => {
    try {
        const rows = await AiFeedback.findAll({
            where: { userId: req.user.id },
            order: [['createdAt', 'DESC']],
            limit: 50,
        });
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /stats/mine — aggregate stats for the current user
router.get('/stats/mine', validateToken, async (req, res) => {
    try {
        const rows = await AiFeedback.findAll({
            where: { userId: req.user.id },
            attributes: ['rating'],
        });
        const total = rows.length;
        const upCount = rows.filter(r => r.rating === 'up').length;
        const downCount = total - upCount;
        res.json({ total, upCount, downCount, upRate: total === 0 ? 0 : upCount / total });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
