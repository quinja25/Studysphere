const express = require('express');
const router = express.Router();
const https = require('https');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { Users, StudySessions } = require('../models');
const bcrypt = require('bcrypt');
const { sign, verify } = require('jsonwebtoken');
const { validateToken } = require('../middlewares/AuthMiddleware');
const nodemailer = require('nodemailer');

const PROFILE_PICS_DIR = path.join(__dirname, '../uploads/profile-pics');

const profileUpload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => {
            fs.mkdirSync(PROFILE_PICS_DIR, { recursive: true });
            cb(null, PROFILE_PICS_DIR);
        },
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
            cb(null, `user-${req.user.id}-${Date.now()}${ext}`);
        },
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (/^image\/(jpeg|jpg|png|gif|webp)$/.test(file.mimetype)) cb(null, true);
        else cb(new Error('Only image files (jpg, png, gif, webp) are allowed'));
    },
});

// Lazy email transporter — only created when SMTP_HOST is set
const getMailTransporter = () => {
    if (!process.env.SMTP_HOST) return null;
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
};

// Helper: fetch Google userinfo using the access_token
const getGoogleUser = (accessToken) => new Promise((resolve, reject) => {
    const req = https.request({
        hostname: 'www.googleapis.com',
        path: `/oauth2/v1/userinfo?access_token=${accessToken}`,
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
    }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            try { resolve(JSON.parse(data)); }
            catch (e) { reject(e); }
        });
    });
    req.on('error', reject);
    req.end();
});

// Issue a short-lived access token + long-lived refresh token
const issueTokens = (userId) => ({
    token: sign({ id: userId, type: 'access' }, process.env.JWT_SECRET, { expiresIn: '15m' }),
    refreshToken: sign({ id: userId, type: 'refresh' }, process.env.JWT_SECRET, { expiresIn: '30d' }),
});

// Fields safe to return to any caller — never include password
const PUBLIC_ATTRIBUTES = [
    'id', 'name', 'email', 'username', 'university', 'major', 'gradeLevel',
    'role', 'isVerified', 'xp', 'level', 'curriculum', 'subject', 'targetUniversity',
    'openHours', 'isPublic', 'picture', 'bio', 'linkedinUrl', 'githubUrl', 'website', 'createdAt', 'updatedAt',
    'currentStreak', 'longestStreak', 'lastStudyDate', 'weeklyGoalMinutes',
    'weeklyStudiedMinutes', 'totalStudyMinutes', 'totalSessions',
    'trustScore', 'isAdmin',
];

// GET /users — all users, no passwords
router.get('/', async (req, res) => {
    try {
        const userList = await Users.findAll({ attributes: PUBLIC_ATTRIBUTES });
        res.json(userList);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /users/public — only isPublic=true users (for SearchAlumni)
router.get('/public', async (req, res) => {
    try {
        const userList = await Users.findAll({
            where: { isPublic: true },
            attributes: PUBLIC_ATTRIBUTES,
        });
        res.json(userList);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/byEmail/:email', async (req, res) => {
    try {
        const user = await Users.findOne({
            where: { email: req.params.email },
            attributes: PUBLIC_ATTRIBUTES,
        });
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /users/google-login — verify Google access_token server-side, return JWT
router.post('/google-login', async (req, res) => {
    const { googleAccessToken } = req.body;
    if (!googleAccessToken) return res.status(400).json({ error: 'Missing Google token' });

    try {
        const googleUser = await getGoogleUser(googleAccessToken);
        if (!googleUser.email) return res.status(401).json({ error: 'Invalid Google token' });

        const user = await Users.findOne({ where: { email: googleUser.email } });
        if (!user) return res.status(404).json({ error: 'User not found' });

        // Update picture from Google if it changed
        if (googleUser.picture && user.picture !== googleUser.picture) {
            await user.update({ picture: googleUser.picture });
        }

        const tokens = issueTokens(user.id);
        const safeUser = PUBLIC_ATTRIBUTES.reduce((acc, key) => {
            acc[key] = user.dataValues[key];
            return acc;
        }, {});
        res.json({ ...safeUser, ...tokens });
    } catch (e) {
        res.status(401).json({ error: 'Google authentication failed' });
    }
});

router.post('/login', async (req, res) => {
    const { password, email } = req.body;
    try {
        let user = await Users.findOne({ where: { email } });
        if (!user) {
            user = await Users.findOne({ where: { username: email } });
        }
        if (!user) return res.status(400).json({ error: "Invalid email or username. Please sign up." });

        if (!user.password) return res.status(400).json({ error: "Please use Google Login" });

        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(400).json({ error: "Wrong password" });

        const tokens = issueTokens(user.id);
        const safeUser = PUBLIC_ATTRIBUTES.reduce((acc, key) => {
            acc[key] = user.dataValues[key];
            return acc;
        }, {});
        res.json({ ...safeUser, ...tokens });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/register', async (req, res) => {
    const { name, email, password, role, curriculum, subject, targetUniversity, username, major, openHours, isPublic, picture } = req.body;
    try {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email || !emailRegex.test(email)) return res.status(400).json({ error: "Invalid email address." });

        const existing = await Users.findOne({ where: { email } });
        if (existing) return res.status(400).json({ error: "Email already exists" });

        let hashedPassword = null;
        if (password) {
            hashedPassword = await bcrypt.hash(password, 10);
        }

        const newUser = await Users.create({
            name, email, password: hashedPassword, role, curriculum, subject,
            targetUniversity, username, major, openHours, isPublic, picture,
        });

        const tokens = issueTokens(newUser.id);
        const safeUser = PUBLIC_ATTRIBUTES.reduce((acc, key) => {
            acc[key] = newUser.dataValues[key];
            return acc;
        }, {});
        res.json({ ...safeUser, ...tokens });

        // Send verification email (fire-and-forget, don't block response)
        try {
            const transporter = getMailTransporter();
            if (transporter) {
                const verifyToken = sign(
                    { id: newUser.id, type: 'email-verify' },
                    process.env.JWT_SECRET,
                    { expiresIn: '24h' }
                );
                const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
                const verifyLink = `${clientUrl}/verify-email?token=${verifyToken}`;
                transporter.sendMail({
                    from: process.env.SMTP_FROM || process.env.SMTP_USER,
                    to: email,
                    subject: 'Verify your StudySphere account',
                    html: `<p>Welcome to StudySphere! Please verify your email address.</p>
                           <p><a href="${verifyLink}">Click here to verify your account</a></p>
                           <p>This link expires in 24 hours.</p>`,
                }).catch(err => console.error('[Email] Failed to send verification email:', err));
            } else {
                const verifyToken = sign({ id: newUser.id, type: 'email-verify' }, process.env.JWT_SECRET, { expiresIn: '24h' });
                const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
                console.log(`[DEV] Email verification link for ${email}: ${clientUrl}/verify-email?token=${verifyToken}`);
            }
        } catch (e) { console.error('[Email] Verification email error:', e); }
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// PUT or POST /users/updateXP/:id — award XP after study session (requires auth)
// POST is needed because navigator.sendBeacon (used on tab close) only sends POST
// Also records StudySession and updates streak/weekly/total stats
const updateXPHandler = async (req, res) => {
    const id = req.params.id;
    const { xpGained, groupId, startedAt, durationMinutes, clientDate } = req.body;
    try {
        const user = await Users.findByPk(id);
        if (!user) return res.status(404).json({ error: "User not found" });

        // XP + Level calculation
        let newXp = user.xp + (xpGained || 0);
        let newLevel = user.level;
        let leveledUp = false;

        while (newXp >= newLevel * 100) {
            newXp -= newLevel * 100;
            newLevel++;
            leveledUp = true;
        }

        // Streak calculation
        // Prefer clientDate (YYYY-MM-DD in the user's local timezone) sent by the frontend.
        // Fall back to UTC server date. Without clientDate, users in UTC-N timezones who
        // study past midnight UTC would have their lastStudyDate recorded as tomorrow from
        // their perspective, causing the Lobby streak banner to misfire.
        const today = (clientDate && /^\d{4}-\d{2}-\d{2}$/.test(clientDate))
            ? clientDate
            : new Date().toISOString().split('T')[0];
        const lastDate = user.lastStudyDate;
        let newStreak = user.currentStreak || 0;
        let newLongest = user.longestStreak || 0;

        if (lastDate !== today) {
            // Check if yesterday
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split('T')[0];

            if (lastDate === yesterdayStr) {
                newStreak += 1;
            } else if (!lastDate) {
                newStreak = 1;
            } else {
                newStreak = 1; // streak broken
            }
            newLongest = Math.max(newLongest, newStreak);
        }

        // Weekly reset check (lazy reset: if more than 7 days since last reset)
        let weeklyMinutes = user.weeklyStudiedMinutes || 0;
        const resetAt = user.weeklyGoalResetAt ? new Date(user.weeklyGoalResetAt) : null;
        const now = new Date();
        if (!resetAt || (now - resetAt) > 7 * 24 * 60 * 60 * 1000) {
            weeklyMinutes = 0;
        }
        const mins = durationMinutes || Math.floor((xpGained || 0) / 10);
        weeklyMinutes += mins;

        const updateData = {
            xp: newXp,
            level: newLevel,
            currentStreak: newStreak,
            longestStreak: newLongest,
            lastStudyDate: today,
            weeklyStudiedMinutes: weeklyMinutes,
            weeklyGoalResetAt: (!resetAt || (now - resetAt) > 7 * 24 * 60 * 60 * 1000) ? now : resetAt,
            totalStudyMinutes: (user.totalStudyMinutes || 0) + mins,
            totalSessions: (user.totalSessions || 0) + 1,
        };

        await Users.update(updateData, { where: { id } });

        // Record StudySession
        if (groupId) {
            await StudySessions.create({
                userId: id,
                groupId,
                startedAt: startedAt ? new Date(startedAt) : new Date(Date.now() - mins * 60000),
                endedAt: new Date(),
                durationMinutes: mins,
                xpEarned: xpGained || 0,
            }).catch(() => {}); // non-critical
        }

        res.json({
            newXp, newLevel, leveledUp,
            currentStreak: newStreak,
            longestStreak: newLongest,
            weeklyStudiedMinutes: weeklyMinutes,
            weeklyGoalMinutes: user.weeklyGoalMinutes,
            totalStudyMinutes: updateData.totalStudyMinutes,
            totalSessions: updateData.totalSessions,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
router.put('/updateXP/:id', validateToken, updateXPHandler);
router.post('/updateXP/:id', validateToken, updateXPHandler);

// GET /users/verify-email?token=... — verify email address
// Must be defined BEFORE /:id to avoid "verify-email" being treated as an ID
router.get('/verify-email', async (req, res) => {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'Missing token.' });
    try {
        const decoded = verify(token, process.env.JWT_SECRET);
        if (decoded.type !== 'email-verify') return res.status(400).json({ error: 'Invalid token type.' });

        const user = await Users.findByPk(decoded.id);
        if (!user) return res.status(404).json({ error: 'User not found.' });
        if (user.isVerified) return res.json({ message: 'Email already verified.' });

        await user.update({ isVerified: true });
        res.json({ message: 'Email verified successfully!' });
    } catch (error) {
        res.status(400).json({ error: 'Invalid or expired verification token.' });
    }
});

// POST /users/upload-picture — upload profile photo (jpg/png/gif/webp, max 5 MB)
router.post('/upload-picture', validateToken, profileUpload.single('picture'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No image file provided' });
        const serverUrl = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3001}`;
        const pictureUrl = `${serverUrl}/uploads/profile-pics/${req.file.filename}`;
        await Users.update({ picture: pictureUrl }, { where: { id: req.user.id } });
        res.json({ picture: pictureUrl });
    } catch (err) {
        if (err.message.includes('Only image files')) return res.status(400).json({ error: err.message });
        res.status(500).json({ error: err.message });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const user = await Users.findByPk(req.params.id, { attributes: PUBLIC_ATTRIBUTES });
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// PUT /users/:id — update own profile (requires auth)
// Must be defined AFTER all specific PUT paths to avoid /:id swallowing them
router.put('/:id', validateToken, async (req, res) => {
    const { id } = req.params;
    const { name, curriculum, subject, targetUniversity, major, openHours, isPublic, username, picture, bio, linkedinUrl, githubUrl, website } = req.body;
    try {
        const user = await Users.findByPk(id);
        if (!user) return res.status(404).json({ error: "User not found" });

        await user.update({ name, curriculum, subject, targetUniversity, major, openHours, isPublic, username, picture, bio, linkedinUrl, githubUrl, website });

        const safeUser = PUBLIC_ATTRIBUTES.reduce((acc, key) => {
            acc[key] = user.dataValues[key];
            return acc;
        }, {});
        res.json(safeUser);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /users/forgot-password — send a password reset link to the user's email
router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    // Always return 200 to avoid leaking which emails are registered
    if (!email) return res.status(200).json({ message: 'If that email exists, a reset link has been sent.' });

    try {
        const user = await Users.findOne({ where: { email } });
        if (!user || !user.password) {
            // No account or Google-only account — silently succeed
            return res.status(200).json({ message: 'If that email exists, a reset link has been sent.' });
        }

        // Short-lived reset token (15 min), type 'reset' so it cannot be used as an access token
        const resetToken = sign(
            { id: user.id, type: 'reset' },
            process.env.JWT_SECRET,
            { expiresIn: '15m' }
        );

        const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
        const resetLink = `${clientUrl}/reset-password?token=${resetToken}`;

        const transporter = getMailTransporter();
        if (transporter) {
            await transporter.sendMail({
                from: process.env.SMTP_FROM || process.env.SMTP_USER,
                to: user.email,
                subject: 'StudySphere — Reset your password',
                html: `
                    <p>Hi ${user.name},</p>
                    <p>You requested a password reset. Click the link below to set a new password.
                    This link expires in 15 minutes.</p>
                    <p><a href="${resetLink}">${resetLink}</a></p>
                    <p>If you did not request this, you can safely ignore this email.</p>
                `,
            });
        } else {
            // Dev fallback — log to console when SMTP is not configured
            console.log(`[DEV] Password reset link for ${email}: ${resetLink}`);
        }

        res.status(200).json({ message: 'If that email exists, a reset link has been sent.' });
    } catch (err) {
        console.error('Forgot password error:', err.message);
        res.status(500).json({ error: 'Failed to send reset email. Please try again.' });
    }
});

// POST /users/reset-password — verify reset token and update password
router.post('/reset-password', async (req, res) => {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token and new password are required.' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

    try {
        const decoded = verify(token, process.env.JWT_SECRET);
        if (decoded.type !== 'reset') return res.status(400).json({ error: 'Invalid reset token.' });

        const user = await Users.findByPk(decoded.id);
        if (!user) return res.status(404).json({ error: 'User not found.' });

        const hashed = await bcrypt.hash(password, 10);
        await user.update({ password: hashed });

        res.json({ message: 'Password updated successfully. You can now log in.' });
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(400).json({ error: 'Reset link has expired. Please request a new one.' });
        }
        return res.status(400).json({ error: 'Invalid reset token.' });
    }
});

// POST /users/send-verification — resend email verification link
router.post('/send-verification', validateToken, async (req, res) => {
    try {
        const user = await Users.findByPk(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found.' });
        if (user.isVerified) return res.status(400).json({ error: 'Email already verified.' });

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!user.email || !emailRegex.test(user.email)) return res.status(400).json({ error: 'Invalid email address on account.' });

        const verifyToken = sign(
            { id: user.id, type: 'email-verify' },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );
        const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
        const verifyLink = `${clientUrl}/verify-email?token=${verifyToken}`;

        const transporter = getMailTransporter();
        if (transporter) {
            await transporter.sendMail({
                from: process.env.SMTP_FROM || process.env.SMTP_USER,
                to: user.email,
                subject: 'Verify your StudySphere account',
                html: `<p>Please verify your StudySphere email address.</p>
                       <p><a href="${verifyLink}">Click here to verify your account</a></p>
                       <p>This link expires in 24 hours.</p>`,
            });
        } else {
            console.log(`[DEV] Email verification link for ${user.email}: ${verifyLink}`);
        }
        res.json({ message: 'Verification email sent.' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to send verification email.' });
    }
});

// POST /users/refresh — exchange a valid refresh token for a new access token
router.post('/refresh', (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'Missing refresh token' });
    try {
        const decoded = verify(refreshToken, process.env.JWT_SECRET);
        if (decoded.type !== 'refresh') return res.status(401).json({ error: 'Invalid token type' });
        const accessToken = sign({ id: decoded.id, type: 'access' }, process.env.JWT_SECRET, { expiresIn: '15m' });
        res.json({ accessToken });
    } catch {
        res.status(401).json({ error: 'Refresh token expired or invalid. Please log in again.' });
    }
});

module.exports = router;
