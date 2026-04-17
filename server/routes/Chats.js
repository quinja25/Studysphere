const express = require('express');
const router = express.Router();
const { Chats, Groups, Groups_Users } = require('../models');
const { validateToken } = require('../middlewares/AuthMiddleware');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, unique + path.extname(file.originalname));
    },
});
const ALLOWED_MIME_PREFIXES = ['image/', 'video/', 'audio/'];
const ALLOWED_MIME_EXACT = ['application/pdf', 'text/plain'];

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    fileFilter: (req, file, cb) => {
        const allowed =
            ALLOWED_MIME_PREFIXES.some(p => file.mimetype.startsWith(p)) ||
            ALLOWED_MIME_EXACT.includes(file.mimetype);
        if (!allowed) {
            return cb(new Error(`File type "${file.mimetype}" is not allowed. Only images, videos, audio, PDFs, and plain text are permitted.`));
        }
        cb(null, true);
    },
});

router.get('/', async (req, res) => {
    const chatList = await Chats.findAll();
    res.json(chatList);
});

router.get('/:groupId', async (req, res) => {
    const groupId = req.params.groupId;
    try {
        const chatList = await Chats.findAll({ where: { GroupId: groupId } });
        res.json(chatList);
    } catch (error) {
        res.status(500).send(error.message);
    }
});

router.post('/upload', validateToken, (req, res, next) => {
    upload.single('file')(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message });
        next();
    });
}, (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const url = `/uploads/${req.file.filename}`;
    res.json({ url, name: req.file.originalname, type: req.file.mimetype });
});

router.post('/', validateToken, async (req, res) => {
    try {
        const { message, GroupId } = req.body;
        if (!message || !GroupId) return res.status(400).json({ error: 'message and GroupId are required.' });
        const newChat = await Chats.create({ author: req.user.name, message, GroupId });
        res.json(newChat);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/pin/:id', validateToken, async (req, res) => {
    const id = req.params.id;
    try {
        const chat = await Chats.findByPk(id);
        if (!chat) return res.status(404).json({ error: "Chat not found" });

        // Check membership: user must be the group leader or a member
        const group = await Groups.findByPk(chat.GroupId);
        const membership = await Groups_Users.findOne({ where: { UserId: req.user.id, GroupId: chat.GroupId } });
        const isLeader = group && String(group.leader) === String(req.user.id);
        if (!isLeader && !membership) {
            return res.status(403).json({ error: 'Only group members can pin messages.' });
        }

        const newPinnedStatus = !chat.isPinned;
        chat.isPinned = newPinnedStatus;
        await chat.save();
        const chatData = chat.toJSON();
        chatData.isPinned = newPinnedStatus;
        res.json(chatData);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/:id', validateToken, async (req, res) => {
    const id = req.params.id;
    try {
        const chat = await Chats.findByPk(id);
        if (!chat) return res.status(404).json({ error: 'Chat not found' });
        if (chat.author !== req.user.name) {
            return res.status(403).json({ error: 'You can only delete your own messages.' });
        }
        await chat.destroy();
        res.json({ message: "Deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
