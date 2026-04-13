const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const db = require('../models');
const { Resources, UserResources, Users } = require('../models');
const { validateToken } = require('../middlewares/AuthMiddleware');
const { indexContent } = require('../services/embeddingSync');

// GET /resources — paginated resource list with owned flag (?page=, ?limit=, ?type=)
// Auth is required to know which resources the user owns
router.get('/', validateToken, async (req, res) => {
    try {
        const page  = Math.max(1, parseInt(req.query.page)  || 1);
        const limit = Math.min(50, parseInt(req.query.limit) || 20);
        const offset = (page - 1) * limit;

        const where = {};
        if (req.query.type && req.query.type !== 'all') where.type = req.query.type;

        const [{ rows, count }, owned] = await Promise.all([
            Resources.findAndCountAll({
                where,
                include: [{ model: Users, as: 'author', attributes: ['id', 'name'] }],
                order: [['createdAt', 'DESC']],
                attributes: { exclude: ['content'] },
                limit,
                offset,
            }),
            UserResources.findAll({
                where: { userId: req.user.id },
                attributes: ['resourceId'],
            }),
        ]);

        const ownedSet = new Set(owned.map(r => r.resourceId));
        res.json({
            data: rows.map(r => ({ ...r.toJSON(), owned: ownedSet.has(r.id) })),
            total: count,
            page,
            totalPages: Math.ceil(count / limit),
            hasMore: offset + rows.length < count,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /resources/:id — full content if owned or free
router.get('/:id', validateToken, async (req, res) => {
    try {
        const resource = await Resources.findByPk(req.params.id, {
            include: [{ model: Users, as: 'author', attributes: ['id', 'name'] }],
        });
        if (!resource) return res.status(404).json({ error: 'Resource not found' });

        const isOwned = resource.price === 0 ||
            resource.authorId === req.user.id ||
            !!(await UserResources.findOne({ where: { userId: req.user.id, resourceId: resource.id } }));

        const data = resource.toJSON();
        if (!isOwned) {
            delete data.content;
            data.locked = true;
        }
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /resources — create a new resource listing (auth required)
router.post('/', validateToken, async (req, res) => {
    const { title, description, content, price, type } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required.' });
    if (!content || !content.trim()) return res.status(400).json({ error: 'Content is required.' });
    const parsedPrice = parseInt(price) || 0;
    if (parsedPrice < 0) return res.status(400).json({ error: 'Price cannot be negative.' });
    try {
        const resource = await Resources.create({
            title: title.trim(), description, content,
            price: parsedPrice,
            type: type || 'other',
            authorId: req.user.id,
        });
        indexContent('resource', resource.id).catch(err => console.error('Embedding sync error:', err.message));
        res.status(201).json(resource);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /resources/:id/unlock — spend XP to unlock a resource
router.post('/:id/unlock', validateToken, async (req, res) => {
    const t = await db.sequelize.transaction();
    try {
        const [resource, user] = await Promise.all([
            Resources.findByPk(req.params.id, { transaction: t }),
            Users.findByPk(req.user.id, { transaction: t }),
        ]);

        if (!resource) { await t.rollback(); return res.status(404).json({ error: 'Resource not found' }); }
        if (!user)     { await t.rollback(); return res.status(404).json({ error: 'User not found' }); }

        // Already owned?
        const existing = await UserResources.findOne({
            where: { userId: user.id, resourceId: resource.id },
            transaction: t,
        });
        if (existing) {
            await t.rollback();
            return res.status(409).json({ error: 'Already unlocked' });
        }

        // Free resource — just grant access
        if (resource.price === 0) {
            await UserResources.create({ userId: user.id, resourceId: resource.id }, { transaction: t });
            await Resources.increment('downloads', { where: { id: resource.id }, transaction: t });
            await t.commit();
            return res.json({ newXp: user.xp, resource });
        }

        // Check debt floor — allow borrowing up to MAX_XP_DEBT
        const MAX_XP_DEBT = parseInt(process.env.MAX_XP_DEBT || '-100');
        const newXp = user.xp - resource.price;
        if (newXp < MAX_XP_DEBT) {
            await t.rollback();
            return res.status(400).json({
                error: `XP debt limit reached. You can borrow up to ${Math.abs(MAX_XP_DEBT)} XP, but this would take you to ${newXp} XP.`,
                canBorrow: false,
            });
        }

        const borrowed = user.xp < resource.price;
        await Users.update({ xp: newXp }, { where: { id: user.id }, transaction: t });
        await UserResources.create({ userId: user.id, resourceId: resource.id }, { transaction: t });
        await Resources.increment('downloads', { where: { id: resource.id }, transaction: t });

        await t.commit();
        res.json({ newXp, resource, borrowed });
    } catch (error) {
        await t.rollback();
        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(409).json({ error: 'Already unlocked' });
        }
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
