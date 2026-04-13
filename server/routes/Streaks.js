const express = require('express');
const router = express.Router();
const { Users, StudySessions } = require('../models');
const { validateToken } = require('../middlewares/AuthMiddleware');

// GET /streaks/me — current user's streak data
router.get('/me', validateToken, async (req, res) => {
    try {
        const user = await Users.findByPk(req.user.id, {
            attributes: ['id', 'currentStreak', 'longestStreak', 'lastStudyDate',
                'weeklyGoalMinutes', 'weeklyStudiedMinutes', 'totalStudyMinutes', 'totalSessions'],
        });
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /streaks/leaderboard — top 20 users by current streak
router.get('/leaderboard', async (req, res) => {
    try {
        const leaders = await Users.findAll({
            where: { isPublic: true },
            attributes: ['id', 'name', 'picture', 'currentStreak', 'longestStreak', 'totalStudyMinutes', 'level'],
            order: [['currentStreak', 'DESC']],
            limit: 20,
        });
        res.json(leaders);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// PUT /streaks/goal — update weekly goal
router.put('/goal', validateToken, async (req, res) => {
    const { weeklyGoalMinutes } = req.body;
    try {
        await Users.update({ weeklyGoalMinutes }, { where: { id: req.user.id } });
        res.json({ weeklyGoalMinutes });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /streaks/history/:userId — paginated study session history
router.get('/history/:userId', async (req, res) => {
    const { page = 1, limit = 20 } = req.query;
    try {
        const sessions = await StudySessions.findAndCountAll({
            where: { userId: req.params.userId },
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit),
            offset: (parseInt(page) - 1) * parseInt(limit),
        });
        res.json({ sessions: sessions.rows, total: sessions.count });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /streaks/:userId — public streak data for any user
router.get('/:userId', async (req, res) => {
    try {
        const user = await Users.findByPk(req.params.userId, {
            attributes: ['id', 'currentStreak', 'longestStreak', 'lastStudyDate',
                'weeklyGoalMinutes', 'weeklyStudiedMinutes', 'totalStudyMinutes', 'totalSessions'],
        });
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
