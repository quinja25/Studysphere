const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const db = require('./models');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
const { setupSocket } = require('./socket/handlers');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";

app.use(cors({
    origin: CLIENT_URL,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
}));
app.use(express.json());

// ── Rate limiting ───────────────────────────────────────────────────────────
// Strict limiter for auth endpoints (10 attempts per 15 min)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many attempts, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});
// General limiter for all other API routes (100 requests per minute)
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: { error: 'Too many requests, please slow down.' },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/users/login', authLimiter);
app.use('/users/register', authLimiter);
app.use('/users/google-login', authLimiter);
app.use(apiLimiter);
app.use('/uploads', express.static(require('path').join(__dirname, 'uploads')));

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: CLIENT_URL,
        methods: ["GET", "POST"]
    }
});

// Wire all Socket.io handlers (extracted to socket/handlers.js for testability)
setupSocket(io);

const setupServer = async () => {
    const groupRouter = require('./routes/Groups');
    const chatRouter = require('./routes/Chats');
    const userRouter = require('./routes/Users');
    const groupUserRouter = require('./routes/GroupsUsers');
    const postsRouter = require('./routes/Posts');
    const endorsementsRouter = require('./routes/Endorsements');
    const resourcesRouter = require('./routes/Resources');
    const wikiRouter = require('./routes/Wiki');
    const qaRouter = require('./routes/QA');
    const aiRouter = require('./routes/Ai');
    const streaksRouter = require('./routes/Streaks');
    const adminRouter = require('./routes/Admin');
    const globalDocsRouter = require('./routes/GlobalDocuments');
    const reportsRouter = require('./routes/ReportsRoute');
    const recapsRouter = require('./routes/Recaps');
    const sessionGoalsRouter = require('./routes/SessionGoals');
    const subjectsRouter = require('./routes/Subjects');

    app.use('/groups', groupRouter);
    app.use('/chats', chatRouter);
    app.use('/users', userRouter);
    app.use('/groupsUsers', groupUserRouter);
    app.use('/posts', postsRouter);
    app.use('/endorsements', endorsementsRouter);
    app.use('/resources', resourcesRouter);
    app.use('/wiki', wikiRouter);
    app.use('/qa', qaRouter);
    app.use('/ai', aiRouter);
    app.use('/streaks', streaksRouter);
    app.use('/admin', adminRouter);
    app.use('/admin/documents', globalDocsRouter);
    app.use('/reports', reportsRouter);
    app.use('/recaps', recapsRouter);
    app.use('/session-goals', sessionGoalsRouter);
    app.use('/subjects', subjectsRouter);

    app.get('/', (req, res) => res.send('Main page'));

    app.use((err, req, res, next) => {
        console.error(err.stack);
        res.status(500).send('Something broke!');
    });

    try {
        await db.sequelize.sync();

        // ── IB Subjects seed ───────────────────────────────────────────────
        // Uses force-recreate if hasSL column is missing (handles schema additions).
        // IbSubjects is a static reference table so dropping + reseeding is safe.
        if (db.IbSubjects) {
            db.IbSubjects.describe().then(attrs => {
                const IB_SUBJECTS = require('./data/ibSubjects');
                const needsMigration = !attrs.hasSL;
                if (needsMigration) {
                    return db.IbSubjects.sync({ force: true })
                        .then(() => db.IbSubjects.bulkCreate(IB_SUBJECTS))
                        .then(() => console.log(`IbSubjects recreated and seeded: ${IB_SUBJECTS.length} subjects`));
                }
                return db.IbSubjects.count().then(count => {
                    if (count === 0) {
                        return db.IbSubjects.bulkCreate(IB_SUBJECTS, { ignoreDuplicates: true })
                            .then(() => console.log(`IbSubjects seeded: ${IB_SUBJECTS.length} subjects`));
                    }
                });
            }).catch(err => console.error('IbSubjects seed failed:', err.message));
        }

        // ── Embedding cold-start fix ────────────────────────────────────────
        // If ContentEmbeddings is empty and OpenAI is configured, reindex now.
        if (process.env.OPENAI_API_KEY && db.ContentEmbeddings) {
            db.ContentEmbeddings.count().then(count => {
                if (count === 0) {
                    console.log('ContentEmbeddings is empty — triggering background reindex...');
                    const { reindexAll } = require('./services/embeddingSync');
                    reindexAll().then(({ indexed, errors }) => {
                        console.log(`Auto-reindex complete: ${indexed} indexed, ${errors} errors`);
                    }).catch(err => console.error('Auto-reindex failed:', err.message));
                }
            }).catch(() => {}); // table may not exist yet on first run
        }

        // ── Weekly goal reset cron ─────────────────────────────────────────
        // Every Monday at 00:00 — reset weekly study minutes for all users.
        // The lazy reset in updateXP remains as a fallback.
        cron.schedule('0 0 * * 1', async () => {
            try {
                const now = new Date();
                await db.Users.update(
                    { weeklyStudiedMinutes: 0, weeklyGoalResetAt: now },
                    { where: {} }
                );
                console.log('Weekly study minutes reset');
            } catch (err) {
                console.error('Weekly cron error:', err.message);
            }
        });

        server.listen(PORT, () => {
            console.log(`Server running on port ${PORT}...`);
        });
    } catch (error) {
        console.error('Error synchronizing Sequelize models:', error);
    }
};

setupServer();
