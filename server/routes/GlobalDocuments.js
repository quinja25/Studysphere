const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../models');
const { GlobalDocuments } = db;
const { validateToken } = require('../middlewares/AuthMiddleware');
const { validateAdmin } = require('../middlewares/AdminMiddleware');
const { processDocument } = require('../services/documentProcessor');
const { indexGlobalDocument, removeGlobalDocument } = require('../services/embeddingSync');

// All routes require auth + admin
router.use(validateToken, validateAdmin);

// PDF only, 20MB limit, memory storage (we write to disk ourselves after getting the ID)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (file.mimetype === 'application/pdf') cb(null, true);
        else cb(new Error('Only PDF files are accepted'));
    },
});

const UPLOAD_DIR = path.join(__dirname, '../uploads/global-docs');

function ensureUploadDir() {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function slugify(str) {
    return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ──────────────────────────────────────────────
// GET /admin/documents — list all global documents
// ──────────────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        const docs = await GlobalDocuments.findAll({
            attributes: ['id', 'title', 'filename', 'subject', 'curriculum', 'docType', 'pageCount', 'chunkCount', 'fileSize', 'createdAt', 'uploadedBy'],
            include: [{ model: db.Users, as: 'uploader', attributes: ['name'] }],
            order: [['createdAt', 'DESC']],
        });
        res.json(docs.map(d => ({
            ...d.toJSON(),
            fileSizeFormatted: formatBytes(d.fileSize),
        })));
    } catch (err) {
        console.error('GlobalDocuments list error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ──────────────────────────────────────────────
// POST /admin/documents — upload a new global document
// ──────────────────────────────────────────────
router.post('/', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'PDF file is required' });

        const { title, subject, curriculum, docType } = req.body;
        if (!title?.trim()) return res.status(400).json({ error: 'title is required' });

        const validCurricula = ['IB', 'A-Level', 'AP', 'GCSE', 'University', 'General'];
        const validTypes = ['textbook', 'past_paper', 'notes', 'other'];
        const curriculumVal = validCurricula.includes(curriculum) ? curriculum : 'General';
        const docTypeVal = validTypes.includes(docType) ? docType : 'other';

        // Process PDF into chunks
        const { chunks, pages } = await processDocument(req.file.buffer, {
            title: title.trim(),
            subject: subject?.trim() || null,
            docType: docTypeVal,
        });

        if (chunks.length === 0) {
            return res.status(422).json({ error: 'Could not extract text from this PDF. Make sure it is not a scanned image.' });
        }

        // Create DB record first to get the ID for filename
        const doc = await GlobalDocuments.create({
            title: title.trim(),
            filename: req.file.originalname,
            subject: subject?.trim() || null,
            curriculum: curriculumVal,
            docType: docTypeVal,
            uploadedBy: req.user.id,
            pageCount: pages,
            chunkCount: 0, // updated after async indexing
            fileSize: req.file.buffer.length,
            chunksJson: JSON.stringify(chunks), // store for reindexAll
        });

        // Save PDF to disk
        ensureUploadDir();
        const diskFilename = `${doc.id}-${slugify(title.trim())}.pdf`;
        const diskPath = path.join(UPLOAD_DIR, diskFilename);
        fs.writeFileSync(diskPath, req.file.buffer);

        // Respond immediately — indexing runs async
        res.status(201).json({
            id: doc.id,
            title: doc.title,
            subject: doc.subject,
            curriculum: doc.curriculum,
            docType: doc.docType,
            pageCount: doc.pageCount,
            chunkCount: doc.chunkCount,
            fileSize: doc.fileSize,
            fileSizeFormatted: formatBytes(doc.fileSize),
            createdAt: doc.createdAt,
            indexing: true,
        });

        // Async embed — updates chunkCount when done
        indexGlobalDocument(doc.id, chunks, subject?.trim() || null).catch(err => {
            console.error(`Failed to index global document ${doc.id}:`, err.message);
        });

    } catch (err) {
        console.error('GlobalDocuments upload error:', err);
        if (err.message === 'Only PDF files are accepted') {
            return res.status(400).json({ error: err.message });
        }
        res.status(500).json({ error: 'Failed to process document' });
    }
});

// ──────────────────────────────────────────────
// DELETE /admin/documents/:id — remove document + embeddings + file
// ──────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
    try {
        const doc = await GlobalDocuments.findByPk(req.params.id);
        if (!doc) return res.status(404).json({ error: 'Document not found' });

        // Remove embeddings
        await removeGlobalDocument(doc.id);

        // Remove file from disk
        const diskFilename = `${doc.id}-${slugify(doc.title)}.pdf`;
        const diskPath = path.join(UPLOAD_DIR, diskFilename);
        if (fs.existsSync(diskPath)) fs.unlinkSync(diskPath);

        await doc.destroy();
        res.json({ message: 'Document deleted' });
    } catch (err) {
        console.error('GlobalDocuments delete error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
