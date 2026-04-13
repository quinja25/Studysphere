'use strict';
/**
 * Integration tests — real Sequelize operations against an SQLite in-memory DB.
 *
 * These tests exercise the ORM layer end-to-end: model definitions, constraints,
 * associations, and cascade deletes. No mocking — every query hits a real DB.
 *
 * Why SQLite? It ships with Node.js, requires no external service, syncs in ~ms,
 * and supports the same Sequelize API as MySQL for 95% of operations.
 * Known gap: FULLTEXT indexes and MySQL-specific operators are skipped here.
 */

const db = require('./testDb');

beforeAll(async () => {
    // Build the schema from model definitions (drops and recreates all tables)
    await db.sequelize.sync({ force: true });
});

afterAll(async () => {
    await db.sequelize.close();
});

// ── Users ────────────────────────────────────────────────────────────────────

describe('Users model', () => {
    afterEach(async () => {
        await db.Users.destroy({ where: {}, truncate: true });
    });

    it('creates a user with required fields', async () => {
        const user = await db.Users.create({
            name: 'Alice',
            email: 'alice@test.com',
            username: 'alice',
            password: 'hashed',
            role: 'student',
        });
        expect(user.id).toBeDefined();
        expect(user.name).toBe('Alice');
        expect(user.role).toBe('student');
    });

    it('defaults isVerified to false', async () => {
        const user = await db.Users.create({ name: 'Bob', email: 'bob@test.com', role: 'student' });
        expect(user.isVerified).toBe(false);
    });

    it('defaults xp to 0 and level to 1', async () => {
        const user = await db.Users.create({ name: 'Carol', email: 'carol@test.com', role: 'student' });
        expect(user.xp).toBe(0);
        expect(user.level).toBe(1);
    });

    it('enforces unique email constraint', async () => {
        await db.Users.create({ name: 'Dave', email: 'dup@test.com', role: 'student' });
        await expect(
            db.Users.create({ name: 'Dave2', email: 'dup@test.com', role: 'student' })
        ).rejects.toThrow();
    });

    it('allows null password (Google OAuth users)', async () => {
        const user = await db.Users.create({ name: 'Eve', email: 'eve@test.com', role: 'student', password: null });
        expect(user.password).toBeNull();
    });

    it('findOne retrieves user by email', async () => {
        await db.Users.create({ name: 'Frank', email: 'frank@test.com', role: 'student' });
        const found = await db.Users.findOne({ where: { email: 'frank@test.com' } });
        expect(found).not.toBeNull();
        expect(found.name).toBe('Frank');
    });

    it('update changes user fields', async () => {
        const user = await db.Users.create({ name: 'Grace', email: 'grace@test.com', role: 'student' });
        await user.update({ xp: 150, level: 2 });
        const refreshed = await db.Users.findByPk(user.id);
        expect(refreshed.xp).toBe(150);
        expect(refreshed.level).toBe(2);
    });

    it('destroy removes the user', async () => {
        const user = await db.Users.create({ name: 'Hank', email: 'hank@test.com', role: 'student' });
        await user.destroy();
        const found = await db.Users.findByPk(user.id);
        expect(found).toBeNull();
    });
});

// ── Groups ───────────────────────────────────────────────────────────────────

describe('Groups model', () => {
    afterEach(async () => {
        await db.Groups.destroy({ where: {}, truncate: true });
    });

    it('creates a group with required fields', async () => {
        const group = await db.Groups.create({ groupName: 'Math Study', leader: 'Alice' });
        expect(group.id).toBeDefined();
        expect(group.groupName).toBe('Math Study');
    });

    it('defaults isPublic to true', async () => {
        const group = await db.Groups.create({ groupName: 'Open Room', leader: 'Bob' });
        expect(group.isPublic).toBe(true);
    });

    it('defaults maxParticipants to 10', async () => {
        const group = await db.Groups.create({ groupName: 'Default Size', leader: 'Carol' });
        expect(group.maxParticipants).toBe(10);
    });

    it('stores optional subject and gradeLevel', async () => {
        const group = await db.Groups.create({
            groupName: 'IB Maths',
            leader: 'Dave',
            subject: 'Mathematics',
            gradeLevel: 'IB HL',
        });
        expect(group.subject).toBe('Mathematics');
        expect(group.gradeLevel).toBe('IB HL');
    });
});

// ── Chats ────────────────────────────────────────────────────────────────────

describe('Chats model', () => {
    let group;

    beforeEach(async () => {
        group = await db.Groups.create({ groupName: 'Chat Room', leader: 'Alice' });
    });

    afterEach(async () => {
        await db.Chats.destroy({ where: {}, truncate: true });
        await db.Groups.destroy({ where: {}, truncate: true });
    });

    it('creates a chat message linked to a group', async () => {
        const chat = await db.Chats.create({
            author: 'Alice',
            message: 'Hello everyone!',
            time: new Date().toISOString(),
            GroupId: group.id,
        });
        expect(chat.id).toBeDefined();
        expect(chat.message).toBe('Hello everyone!');
        expect(chat.GroupId).toBe(group.id);
    });

    it('defaults isPinned to false', async () => {
        const chat = await db.Chats.create({
            author: 'Bob',
            message: 'Unpinned msg',
            time: new Date().toISOString(),
            GroupId: group.id,
        });
        expect(chat.isPinned).toBe(false);
    });

    it('can toggle isPinned to true', async () => {
        const chat = await db.Chats.create({
            author: 'Carol',
            message: 'Pin this',
            time: new Date().toISOString(),
            GroupId: group.id,
        });
        chat.isPinned = true;
        await chat.save();
        const refreshed = await db.Chats.findByPk(chat.id);
        expect(refreshed.isPinned).toBe(true);
    });

    it('findAll retrieves messages for a specific group', async () => {
        const g2 = await db.Groups.create({ groupName: 'Room 2', leader: 'Bob' });
        await db.Chats.create({ author: 'Alice', message: 'Msg A', time: '', GroupId: group.id });
        await db.Chats.create({ author: 'Bob',   message: 'Msg B', time: '', GroupId: group.id });
        await db.Chats.create({ author: 'Carol', message: 'Msg C', time: '', GroupId: g2.id });

        const msgs = await db.Chats.findAll({ where: { GroupId: group.id } });
        expect(msgs).toHaveLength(2);
        msgs.forEach(m => expect(m.GroupId).toBe(group.id));
    });
});

// ── WikiArticles ──────────────────────────────────────────────────────────────

describe('WikiArticles model', () => {
    let author;

    beforeAll(async () => {
        author = await db.Users.create({ name: 'Tutor', email: 'tutor@test.com', role: 'alumni' });
    });

    afterEach(async () => {
        await db.WikiArticles.destroy({ where: {}, truncate: true });
    });

    it('creates an article with required fields', async () => {
        const article = await db.WikiArticles.create({
            title: 'Integration by Parts',
            content: 'IBP is a technique...',
            subject: 'Mathematics',
            authorId: author.id,
        });
        expect(article.id).toBeDefined();
        expect(article.title).toBe('Integration by Parts');
        expect(article.views).toBe(0);
    });

    it('increments view count', async () => {
        const article = await db.WikiArticles.create({
            title: 'Chain Rule',
            content: 'The chain rule...',
            authorId: author.id,
        });
        await article.increment('views');
        await article.reload();
        expect(article.views).toBe(1);
    });

    it('supports comma-separated tags field', async () => {
        const article = await db.WikiArticles.create({
            title: 'Calculus Overview',
            content: 'Introduction...',
            authorId: author.id,
            tags: 'calculus,integration,derivatives',
        });
        expect(article.tags).toContain('calculus');
    });

    it('destroys an article permanently', async () => {
        const article = await db.WikiArticles.create({
            title: 'Temp Article',
            content: 'Delete me',
            authorId: author.id,
        });
        const id = article.id;
        await article.destroy();
        const found = await db.WikiArticles.findByPk(id);
        expect(found).toBeNull();
    });
});

// ── Questions & Answers ───────────────────────────────────────────────────────

describe('Questions and Answers models', () => {
    let author;

    beforeAll(async () => {
        author = await db.Users.create({ name: 'Questioner', email: 'q@test.com', role: 'student' });
    });

    afterEach(async () => {
        await db.Answers.destroy({ where: {}, truncate: true });
        await db.Questions.destroy({ where: {}, truncate: true });
    });

    it('creates a question with required fields', async () => {
        const q = await db.Questions.create({
            title: 'What is a derivative?',
            body: 'Please explain.',
            authorId: author.id,
        });
        expect(q.id).toBeDefined();
        expect(q.isAnswered).toBe(false);
    });

    it('creates an answer linked to a question', async () => {
        const q = await db.Questions.create({ title: 'Q1', body: 'Body', authorId: author.id });
        const a = await db.Answers.create({ content: 'Answer here', questionId: q.id, authorId: author.id });
        expect(a.id).toBeDefined();
        expect(a.questionId).toBe(q.id);
        expect(a.votes).toBe(0);
        expect(a.isAccepted).toBe(false);
    });

    it('can mark an answer as accepted', async () => {
        const q = await db.Questions.create({ title: 'Q2', body: 'Body', authorId: author.id });
        const a = await db.Answers.create({ content: 'Best answer', questionId: q.id, authorId: author.id });
        await a.update({ isAccepted: true });
        await q.update({ isAnswered: true });

        const refreshedA = await db.Answers.findByPk(a.id);
        const refreshedQ = await db.Questions.findByPk(q.id);
        expect(refreshedA.isAccepted).toBe(true);
        expect(refreshedQ.isAnswered).toBe(true);
    });

    it('increments answer votes', async () => {
        const q = await db.Questions.create({ title: 'Q3', body: 'Body', authorId: author.id });
        const a = await db.Answers.create({ content: 'Good answer', questionId: q.id, authorId: author.id });
        await a.increment('votes');
        await a.reload();
        expect(a.votes).toBe(1);
    });
});

// ── Posts ────────────────────────────────────────────────────────────────────

describe('Posts model', () => {
    let author;

    beforeAll(async () => {
        author = await db.Users.create({ name: 'Blogger', email: 'blog@test.com', role: 'alumni' });
    });

    afterEach(async () => {
        await db.Posts.destroy({ where: {}, truncate: true });
    });

    it('creates a post', async () => {
        const post = await db.Posts.create({
            title: 'My Study Tips',
            content: 'Here are my top tips...',
            type: 'advice',
            authorId: author.id,
        });
        expect(post.id).toBeDefined();
        expect(post.likes).toBe(0);
    });

    it('increments likes', async () => {
        const post = await db.Posts.create({ title: 'Tips', content: 'Content', type: 'blog', authorId: author.id });
        await post.increment('likes');
        await post.reload();
        expect(post.likes).toBe(1);
    });
});

// ── SessionGoals ──────────────────────────────────────────────────────────────

describe('SessionGoals model', () => {
    let user, group;

    beforeAll(async () => {
        user  = await db.Users.create({ name: 'Striver', email: 'strive@test.com', role: 'student' });
        group = await db.Groups.create({ groupName: 'Goal Room', leader: 'Striver' });
    });

    afterEach(async () => {
        await db.SessionGoals.destroy({ where: {}, truncate: true });
    });

    it('creates a goal', async () => {
        const goal = await db.SessionGoals.create({
            userId: user.id,
            groupId: group.id,
            goal: 'Complete 10 practice problems',
        });
        expect(goal.id).toBeDefined();
        expect(goal.isCompleted).toBe(false);
    });

    it('marks goal as completed', async () => {
        const goal = await db.SessionGoals.create({ userId: user.id, groupId: group.id, goal: 'Read notes' });
        await goal.update({ isCompleted: true });
        const refreshed = await db.SessionGoals.findByPk(goal.id);
        expect(refreshed.isCompleted).toBe(true);
    });
});

// ── Endorsements uniqueness ───────────────────────────────────────────────────

describe('Endorsements model', () => {
    let student, alumni;

    beforeAll(async () => {
        student = await db.Users.create({ name: 'Student1', email: 'stu1@test.com', role: 'student' });
        alumni  = await db.Users.create({ name: 'Alumni1',  email: 'alum1@test.com', role: 'alumni' });
    });

    afterEach(async () => {
        await db.Endorsements.destroy({ where: {}, truncate: true });
    });

    it('creates an endorsement', async () => {
        const e = await db.Endorsements.create({ studentId: student.id, alumniId: alumni.id, message: 'Great mentor!' });
        expect(e.id).toBeDefined();
    });

    it('enforces one endorsement per student-alumni pair', async () => {
        await db.Endorsements.create({ studentId: student.id, alumniId: alumni.id, message: 'First' });
        await expect(
            db.Endorsements.create({ studentId: student.id, alumniId: alumni.id, message: 'Duplicate' })
        ).rejects.toThrow();
    });
});
