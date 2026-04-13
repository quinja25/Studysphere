const express = require('express');
const router = express.Router();
const db = require('../models');
const { Groups_Users } = require('../models');
const { validateToken } = require('../middlewares/AuthMiddleware');

// Add user to group (requires auth)
router.post('/user/:userId/group/:groupId', validateToken, async (req, res) => {
    const { userId, groupId } = req.params;
    try {
        await db.Groups_Users.create({ UserId: userId, GroupId: groupId });
        res.status(201).json({ message: 'User added to group successfully.' });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Remove user from group (requires auth)
router.delete('/user/:userId/group/:groupId', validateToken, async (req, res) => {
    const { userId, groupId } = req.params;
    try {
        await db.Groups_Users.destroy({ where: { UserId: userId, GroupId: groupId } });
        res.status(200).json({ message: 'User removed from group successfully.' });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/byUser/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const groupIds = await Groups_Users.findAll({
            where: { UserId: userId },
            attributes: ['GroupId'],
        });

        if (groupIds.length === 0) return res.status(200).json([]);

        const groupIdsArray = groupIds.map(g => g.GroupId);
        const groups = await db.Groups.findAll({ where: { id: groupIdsArray } });
        res.status(200).json(groups);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/byGroup/:groupId', async (req, res) => {
    const { groupId } = req.params;
    try {
        const userIds = await Groups_Users.findAll({
            where: { GroupId: groupId },
            attributes: ['UserId'],
        });

        if (userIds.length === 0) return res.status(200).json([]);

        const userIdsArray = userIds.map(u => u.UserId);
        const users = await db.Users.findAll({ where: { id: userIdsArray } });
        res.status(200).json(users);
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
