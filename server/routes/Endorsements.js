const express = require('express');
const router = express.Router();
const { Endorsements, Users } = require('../models');
const { validateToken } = require('../middlewares/AuthMiddleware');

// POST /endorsements — endorse an alumni (auth required)
router.post('/', validateToken, async (req, res) => {
    const { alumniId, message } = req.body;
    const studentId = req.user.id;
    try {
        const [endorsement, created] = await Endorsements.findOrCreate({
            where: { studentId, alumniId },
            defaults: { message },
        });
        res.status(created ? 201 : 200).json({ endorsement, created });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /endorsements/byAlumni/:id — endorsements received by an alumni
router.get('/byAlumni/:id', async (req, res) => {
    try {
        const endorsements = await Endorsements.findAll({
            where: { alumniId: req.params.id },
            include: [{ model: Users, as: 'student', attributes: ['id', 'name', 'picture'] }],
            order: [['createdAt', 'DESC']],
        });
        res.json(endorsements);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /endorsements/count/:id — count endorsements for an alumni
router.get('/count/:id', async (req, res) => {
    try {
        const count = await Endorsements.count({ where: { alumniId: req.params.id } });
        res.json({ count });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /endorsements/check/:alumniId — has current user endorsed this alumni?
router.get('/check/:alumniId', validateToken, async (req, res) => {
    try {
        const existing = await Endorsements.findOne({
            where: { studentId: req.user.id, alumniId: req.params.alumniId },
        });
        res.json({ hasEndorsed: !!existing });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
