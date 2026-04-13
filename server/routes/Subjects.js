const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { IbSubjects } = require('../models');

// GET /subjects?q=query — search IB subjects (no auth required)
router.get('/', async (req, res) => {
    try {
        const { q } = req.query;
        const where = q?.trim()
            ? { subjectName: { [Op.like]: `%${q.trim()}%` } }
            : {};
        const subjects = await IbSubjects.findAll({
            where,
            order: [['groupNumber', 'ASC'], ['subjectName', 'ASC']],
            attributes: ['id', 'groupNumber', 'groupName', 'subjectName'],
        });
        res.json(subjects);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
