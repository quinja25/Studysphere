const express = require('express');
const router = express.Router();
const { Users, Reports, TrustEvents, StudySessions } = require('../models');
const { validateToken } = require('../middlewares/AuthMiddleware');
const { validateAdmin } = require('../middlewares/AdminMiddleware');
const { createAndEmit } = require('../services/notificationService');
const { Op } = require('sequelize');

// All admin routes require auth + admin
router.use(validateToken, validateAdmin);

// GET /admin/dashboard — overview stats
router.get('/dashboard', async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Run all count queries in parallel instead of sequentially
        const [
            totalUsers,
            activeToday,
            pendingReports,
            shadowBannedCount,
            trustCritical,
            trustLow,
            trustMedium,
            trustHigh,
        ] = await Promise.all([
            Users.count(),
            StudySessions.count({ where: { createdAt: { [Op.gte]: today } }, distinct: true, col: 'userId' }),
            Reports.count({ where: { status: 'pending' } }),
            Users.count({ where: { isShadowBanned: true } }),
            Users.count({ where: { trustScore: { [Op.lt]: 20 } } }),
            Users.count({ where: { trustScore: { [Op.gte]: 20, [Op.lt]: 50 } } }),
            Users.count({ where: { trustScore: { [Op.gte]: 50, [Op.lt]: 80 } } }),
            Users.count({ where: { trustScore: { [Op.gte]: 80 } } }),
        ]);

        const trustDistribution = { critical: trustCritical, low: trustLow, medium: trustMedium, high: trustHigh };

        // Recent trust events
        const recentEvents = await TrustEvents.findAll({
            order: [['createdAt', 'DESC']],
            limit: 10,
            include: [
                { model: Users, as: 'user', attributes: ['id', 'name', 'picture'] },
            ],
        });

        res.json({
            totalUsers,
            activeToday,
            pendingReports,
            shadowBannedCount,
            trustDistribution,
            recentEvents,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /admin/reports — paginated reports
router.get('/reports', async (req, res) => {
    const { status, page = 1, limit = 20 } = req.query;
    const where = {};
    if (status) where.status = status;

    try {
        const reports = await Reports.findAndCountAll({
            where,
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit),
            offset: (parseInt(page) - 1) * parseInt(limit),
            include: [
                { model: Users, as: 'reporter', attributes: ['id', 'name', 'picture'] },
                { model: Users, as: 'reportedUser', attributes: ['id', 'name', 'picture', 'trustScore', 'isShadowBanned'] },
            ],
        });
        res.json({ reports: reports.rows, total: reports.count });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// PUT /admin/reports/:id — review a report
router.put('/reports/:id', async (req, res) => {
    const { status, action, trustPenalty } = req.body;
    try {
        const report = await Reports.findByPk(req.params.id);
        if (!report) return res.status(404).json({ error: 'Report not found' });

        await report.update({
            status,
            action,
            reviewedBy: req.user.id,
            reviewedAt: new Date(),
        });

        // Apply trust penalty if actioned
        if (status === 'actioned' && trustPenalty) {
            const user = await Users.findByPk(report.reportedUserId);
            if (user) {
                const newScore = Math.max(0, user.trustScore - trustPenalty);
                await user.update({ trustScore: newScore });

                await TrustEvents.create({
                    userId: user.id,
                    reportedBy: report.reporterId,
                    type: 'trust_decrease',
                    reason: action || report.type,
                    trustDelta: -trustPenalty,
                    newTrustScore: newScore,
                });

                // Auto shadow-ban if trust drops below 20
                if (newScore < 20 && !user.isShadowBanned) {
                    await user.update({
                        isShadowBanned: true,
                        bannedAt: new Date(),
                        banReason: 'Auto-banned: trust score below threshold',
                    });
                    await TrustEvents.create({
                        userId: user.id,
                        reportedBy: req.user.id,
                        type: 'ban',
                        reason: 'Auto-banned: trust score dropped below 20',
                        trustDelta: 0,
                        newTrustScore: newScore,
                    });
                }
            }
        }

        // Tell the original reporter what happened with their report
        if (report.reporterId && (status === 'actioned' || status === 'dismissed' || status === 'reviewed')) {
            const verb = status === 'actioned' ? 'actioned' : status === 'dismissed' ? 'dismissed' : 'reviewed';
            createAndEmit({
                userId: report.reporterId,
                type: 'report_actioned',
                relatedType: 'report',
                relatedId: report.id,
                content: `Your report was ${verb} by moderators`,
                link: `/dashboard`,
            }, req.app.get('io')).catch(err => console.error('Notification error:', err.message));
        }

        res.json(report);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /admin/users — user list with trust scores
const ALLOWED_SORT = ['trustScore', 'name', 'email', 'createdAt', 'level'];
const ALLOWED_ORDER = ['ASC', 'DESC'];

router.get('/users', async (req, res) => {
    const { search, sort = 'trustScore', order = 'ASC', page = 1, limit = 20 } = req.query;

    const safeSort = ALLOWED_SORT.includes(sort) ? sort : 'trustScore';
    const safeOrder = ALLOWED_ORDER.includes(order.toUpperCase()) ? order.toUpperCase() : 'ASC';

    const where = {};
    if (search) {
        where[Op.or] = [
            { name: { [Op.like]: `%${search}%` } },
            { email: { [Op.like]: `%${search}%` } },
        ];
    }
    try {
        const users = await Users.findAndCountAll({
            where,
            attributes: ['id', 'name', 'email', 'picture', 'role', 'trustScore',
                'isShadowBanned', 'bannedAt', 'banReason', 'isAdmin',
                'currentStreak', 'totalStudyMinutes', 'totalSessions', 'level', 'createdAt'],
            order: [[safeSort, safeOrder]],
            limit: parseInt(limit),
            offset: (parseInt(page) - 1) * parseInt(limit),
        });
        res.json({ users: users.rows, total: users.count });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /admin/users/:id — detailed user with trust history
router.get('/users/:id', async (req, res) => {
    try {
        const user = await Users.findByPk(req.params.id, {
            attributes: { exclude: ['password'] },
        });
        if (!user) return res.status(404).json({ error: 'User not found' });

        const trustHistory = await TrustEvents.findAll({
            where: { userId: req.params.id },
            order: [['createdAt', 'DESC']],
            limit: 50,
        });

        const reportHistory = await Reports.findAll({
            where: { reportedUserId: req.params.id },
            order: [['createdAt', 'DESC']],
            limit: 20,
            include: [
                { model: Users, as: 'reporter', attributes: ['id', 'name'] },
            ],
        });

        res.json({ user, trustHistory, reportHistory });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// PUT /admin/users/:id/ban — shadow ban a user
router.put('/users/:id/ban', async (req, res) => {
    const { reason } = req.body;
    try {
        const user = await Users.findByPk(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        await user.update({
            isShadowBanned: true,
            bannedAt: new Date(),
            banReason: reason || 'Banned by admin',
        });

        await TrustEvents.create({
            userId: user.id,
            reportedBy: req.user.id,
            type: 'ban',
            reason: reason || 'Banned by admin',
            trustDelta: 0,
            newTrustScore: user.trustScore,
        });

        res.json({ message: 'User shadow banned' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// PUT /admin/users/:id/unban — remove shadow ban
router.put('/users/:id/unban', async (req, res) => {
    try {
        const user = await Users.findByPk(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        await user.update({
            isShadowBanned: false,
            bannedAt: null,
            banReason: null,
        });

        await TrustEvents.create({
            userId: user.id,
            reportedBy: req.user.id,
            type: 'unban',
            reason: 'Unbanned by admin',
            trustDelta: 0,
            newTrustScore: user.trustScore,
        });

        res.json({ message: 'User unbanned' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// PUT /admin/users/:id/make-admin — toggle admin status
router.put('/users/:id/make-admin', async (req, res) => {
    try {
        const user = await Users.findByPk(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        await user.update({ isAdmin: !user.isAdmin });
        res.json({ isAdmin: !user.isAdmin });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
