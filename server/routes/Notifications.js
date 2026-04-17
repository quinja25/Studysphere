const express = require('express');
const router = express.Router();
const { Notifications } = require('../models');
const { validateToken } = require('../middlewares/AuthMiddleware');

// GET /notifications — paginated list (newest first) for the current user
router.get('/', validateToken, async (req, res) => {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 50);
    try {
        const { rows, count } = await Notifications.findAndCountAll({
            where: { userId: req.user.id },
            order: [['createdAt', 'DESC']],
            limit,
            offset: (page - 1) * limit,
        });
        const unreadCount = await Notifications.count({
            where: { userId: req.user.id, isRead: false },
        });
        res.json({ notifications: rows, total: count, unreadCount, page, limit });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /notifications/unread-count — lightweight bell badge refresh
router.get('/unread-count', validateToken, async (req, res) => {
    try {
        const count = await Notifications.count({
            where: { userId: req.user.id, isRead: false },
        });
        res.json({ unreadCount: count });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// PUT /notifications/:id/read — mark a single notification as read
router.put('/:id/read', validateToken, async (req, res) => {
    try {
        const notif = await Notifications.findOne({
            where: { id: req.params.id, userId: req.user.id },
        });
        if (!notif) return res.status(404).json({ error: 'Notification not found' });
        if (!notif.isRead) await notif.update({ isRead: true });
        res.json(notif);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// PUT /notifications/read-all — mark every notification for the user as read
router.put('/read-all', validateToken, async (req, res) => {
    try {
        const [affected] = await Notifications.update(
            { isRead: true },
            { where: { userId: req.user.id, isRead: false } },
        );
        res.json({ updated: affected });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE /notifications/:id — remove a notification
router.delete('/:id', validateToken, async (req, res) => {
    try {
        const notif = await Notifications.findOne({
            where: { id: req.params.id, userId: req.user.id },
        });
        if (!notif) return res.status(404).json({ error: 'Notification not found' });
        await notif.destroy();
        res.json({ message: 'Deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
