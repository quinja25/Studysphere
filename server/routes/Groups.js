const express = require('express');
const router = express.Router();
const { Groups, Users } = require('../models');
const bcrypt = require('bcrypt');
const { validateToken } = require('../middlewares/AuthMiddleware');

// Scrub password field from a group record; add hasPassword flag
const safeGroup = (g) => {
    const { password, ...data } = g.toJSON ? g.toJSON() : g;
    return { ...data, hasPassword: !!password };
};

router.get('/', async (req, res) => {
    try {
        const groupList = await Groups.findAll();
        res.json(groupList.map(safeGroup));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/', validateToken, async (req, res) => {
    try {
        const data = { ...req.body };
        if (data.password) {
            data.password = await bcrypt.hash(data.password, 10);
        }
        const newGroup = await Groups.create(data);
        res.json(safeGroup(newGroup));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/byID/:id', async (req, res) => {
    try {
        const group = await Groups.findByPk(req.params.id);
        if (!group) return res.status(404).json({ error: 'Group not found' });
        res.json(safeGroup(group));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/newest', async (req, res) => {
    try {
        const newestGroup = await Groups.findOne({ order: [['createdAt', 'DESC']], limit: 1 });
        res.json(newestGroup ? safeGroup(newestGroup) : null);
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.get('/byLeader/:name', async (req, res) => {
    try {
        const groups = await Groups.findAll({ where: { leader: req.params.name } });
        res.json(groups.map(safeGroup));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /groups/:id/verify-password — check room password before joining
router.post('/:id/verify-password', async (req, res) => {
    try {
        const group = await Groups.findByPk(req.params.id);
        if (!group) return res.status(404).json({ error: 'Group not found' });
        if (!group.password) return res.json({ ok: true }); // no password set
        const match = await bcrypt.compare(req.body.password || '', group.password);
        if (!match) return res.status(401).json({ error: 'Incorrect password' });
        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/:id', validateToken, async (req, res) => {
    try {
        const group = await Groups.findByPk(req.params.id);
        if (!group) return res.status(404).json({ error: 'Group not found' });

        // Skip ownership check for DM groups (internal naming convention)
        const isDm = group.groupName?.startsWith('__dm_');
        if (!isDm) {
            const user = await Users.findByPk(req.user.id, { attributes: ['name'] });
            if (!user || group.leader !== user.name) {
                return res.status(403).json({ error: 'Only the group leader can delete this room.' });
            }
        }

        await group.destroy();
        res.json({ message: 'Deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
