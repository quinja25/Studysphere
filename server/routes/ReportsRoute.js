const express = require('express');
const router = express.Router();
const { Reports, Users } = require('../models');
const { validateToken } = require('../middlewares/AuthMiddleware');

// POST /reports — submit a report (any authenticated user)
router.post('/', validateToken, async (req, res) => {
    const { reportedUserId, type, description } = req.body;
    try {
        if (!reportedUserId || !type) {
            return res.status(400).json({ error: 'reportedUserId and type are required' });
        }
        if (String(req.user.id) === String(reportedUserId)) {
            return res.status(400).json({ error: 'Cannot report yourself' });
        }

        const report = await Reports.create({
            reporterId: req.user.id,
            reportedUserId,
            type,
            description,
        });
        res.json(report);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
