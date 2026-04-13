const express = require('express');
const router = express.Router();
const db = require('../models');
const { SessionRecaps, Groups, Chats, Users } = db;
const { Op } = require('sequelize');
const { validateToken } = require('../middlewares/AuthMiddleware');
const { chatCompletion } = require('../services/openai');

const URL_REGEX = /https?:\/\/[^\s]+/g;

// ──────────────────────────────────────────────
// POST /recaps/generate — Generate a session recap using AI
// ──────────────────────────────────────────────
router.post('/generate', validateToken, async (req, res) => {
    try {
        const { groupId, startedAt, endedAt, durationMinutes, participantIds } = req.body;
        if (!groupId) return res.status(400).json({ error: 'groupId is required' });

        // TODO: uncomment when Stripe billing is implemented (Feature 3 in Business Roadmap)
        // const user = await Users.findByPk(req.user.id);
        // if (!user?.isPro) {
        //     return res.status(403).json({ error: 'Session Recaps require Student Pro.', requiresPro: true });
        // }

        const group = await Groups.findByPk(groupId);
        if (!group) return res.status(404).json({ error: 'Group not found' });

        // Fetch messages from this session window
        const whereClause = { GroupId: groupId };
        if (startedAt && endedAt) {
            whereClause.createdAt = { [Op.between]: [new Date(startedAt), new Date(endedAt)] };
        }

        const chats = await Chats.findAll({
            where: whereClause,
            order: [['createdAt', 'ASC']],
            limit: 200,
        });

        // Extract unique URLs from chat messages
        const allLinks = [];
        chats.forEach(c => {
            const matches = (c.message || '').match(URL_REGEX);
            if (matches) allLinks.push(...matches);
        });
        const linksShared = [...new Set(allLinks)];

        const transcript = chats
            .filter(c => c.message && !c.message.startsWith('[') ) // skip system messages
            .map(c => `${c.author}: ${c.message}`)
            .join('\n');

        const subjectInfo = [group.subject, group.major, group.gradeLevel].filter(Boolean).join(', ');

        const systemPrompt = `You are a study session summarizer for an academic platform. Analyze the session and respond with ONLY valid JSON — no markdown, no explanation.

Required JSON format:
{
  "summary": "2-3 sentence overview of what was studied and accomplished",
  "topicsCovered": ["Topic 1", "Topic 2", "Topic 3"],
  "actionItems": ["Action item 1", "Action item 2"]
}

Rules:
- summary: clear, encouraging, 2-3 sentences
- topicsCovered: 2-6 specific academic topics (e.g. "Chain Rule", "French Revolution", "Organic Chemistry")
- actionItems: 1-4 concrete follow-up tasks (e.g. "Review Chapter 5 exercises", "Complete past paper questions on integration")
- If chat is empty, infer from the room subject: ${subjectInfo || 'general study'}`;

        const userContent = transcript.length > 20
            ? `Study room: "${group.groupName}"${subjectInfo ? ` (${subjectInfo})` : ''}\nSession duration: ${durationMinutes || 0} minutes\n\nChat transcript:\n${transcript.slice(0, 3000)}`
            : `Study room: "${group.groupName}"${subjectInfo ? ` (${subjectInfo})` : ''}\nSession duration: ${durationMinutes || 0} minutes.\nNo chat messages recorded — generate a summary based on the subject.`;

        const aiResponse = await chatCompletion(
            [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userContent },
            ],
            { temperature: 0.4, response_format: { type: 'json_object' } }
        );

        let parsed;
        try {
            parsed = JSON.parse(aiResponse.content);
        } catch {
            parsed = { summary: `Completed a study session on ${subjectInfo || 'general topics'}.`, topicsCovered: [], actionItems: [] };
        }

        const recap = await SessionRecaps.create({
            groupId,
            generatedBy: req.user.id,
            summary: parsed.summary || 'Session completed.',
            topicsCovered: Array.isArray(parsed.topicsCovered) ? parsed.topicsCovered.slice(0, 8) : [],
            linksShared,
            actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems.slice(0, 6) : [],
            participantIds: Array.isArray(participantIds) ? participantIds : [req.user.id],
            durationMinutes: durationMinutes || 0,
            startedAt: startedAt ? new Date(startedAt) : null,
            endedAt: endedAt ? new Date(endedAt) : new Date(),
        });

        res.status(201).json({
            recap,
            group: { groupName: group.groupName, subject: group.subject },
        });
    } catch (error) {
        console.error('Recap generation error:', error);
        if (error.message?.includes('OPENAI_API_KEY')) {
            return res.status(503).json({ error: 'AI service not configured.' });
        }
        res.status(500).json({ error: 'Failed to generate recap' });
    }
});

// ──────────────────────────────────────────────
// GET /recaps/byUser/:userId — paginated recaps for a user
// ──────────────────────────────────────────────
router.get('/byUser/:userId', validateToken, async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(20, parseInt(req.query.limit) || 10);
    try {
        const { rows, count } = await SessionRecaps.findAndCountAll({
            where: { generatedBy: req.params.userId },
            include: [{ model: Groups, as: 'group', attributes: ['id', 'groupName', 'subject'] }],
            order: [['createdAt', 'DESC']],
            limit,
            offset: (page - 1) * limit,
        });
        res.json({
            data: rows,
            total: count,
            page,
            totalPages: Math.ceil(count / limit),
            hasMore: (page - 1) * limit + rows.length < count,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ──────────────────────────────────────────────
// GET /recaps/:id — single recap
// ──────────────────────────────────────────────
router.get('/:id', validateToken, async (req, res) => {
    try {
        const recap = await SessionRecaps.findByPk(req.params.id, {
            include: [
                { model: Groups, as: 'group', attributes: ['id', 'groupName', 'subject'] },
                { model: Users, as: 'generatedByUser', attributes: ['id', 'name'] },
            ],
        });
        if (!recap) return res.status(404).json({ error: 'Recap not found' });
        res.json(recap);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
