const express = require('express');
const router = express.Router();
const { SessionGoals } = require('../models');
const { validateToken } = require('../middlewares/AuthMiddleware');

// POST /session-goals — create a new goal for the current session
router.post('/', validateToken, async (req, res) => {
    const { userId, groupId, goal } = req.body;
    if (!userId || !groupId || !goal) {
        return res.status(400).json({ error: 'userId, groupId, and goal are required.' });
    }
    try {
        const newGoal = await SessionGoals.create({ userId, groupId, goal });
        res.json(newGoal);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /session-goals/byGroup/:groupId — list goals for a group (scoped to requester)
router.get('/byGroup/:groupId', validateToken, async (req, res) => {
    const { groupId } = req.params;
    const userId = req.user.id;
    try {
        const goals = await SessionGoals.findAll({ where: { groupId, userId } });
        res.json(goals);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// PUT /session-goals/:id — update a goal (mark complete, carry forward, etc.)
router.put('/:id', validateToken, async (req, res) => {
    const { id } = req.params;
    const { isCompleted, carriedForward, goal } = req.body;
    try {
        const goalRecord = await SessionGoals.findByPk(id);
        if (!goalRecord) return res.status(404).json({ error: 'Goal not found.' });

        const updates = {};
        if (isCompleted !== undefined) updates.isCompleted = isCompleted;
        if (carriedForward !== undefined) updates.carriedForward = carriedForward;
        if (goal !== undefined) updates.goal = goal;

        await goalRecord.update(updates);
        res.json(goalRecord);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
