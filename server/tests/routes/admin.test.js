'use strict';
process.env.JWT_SECRET = 'test-secret-key';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const express = require('express');
const { generateAccessToken } = require('../helpers/authHelpers');

// Mock AdminMiddleware — we control isAdmin via Users.findByPk
jest.mock('../../middlewares/AdminMiddleware', () => ({
  validateAdmin: jest.fn((req, res, next) => {
    // Delegate to Users mock to decide admin status
    const { Users } = require('../../models');
    return Users.findByPk(req.user.id).then(user => {
      if (!user || !user.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      return next();
    });
  }),
}));

jest.mock('../../models', () => ({
  Users: {
    count: jest.fn().mockResolvedValue(0),
    findByPk: jest.fn(),
    findAndCountAll: jest.fn(),
    update: jest.fn().mockResolvedValue([1]),
  },
  Reports: {
    count: jest.fn().mockResolvedValue(0),
    findAndCountAll: jest.fn(),
    findByPk: jest.fn(),
    findAll: jest.fn(),
  },
  TrustEvents: {
    findAll: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: 1 }),
  },
  StudySessions: {
    count: jest.fn().mockResolvedValue(0),
  },
}));

const { Users, Reports, TrustEvents } = require('../../models');
const router = require('../../routes/Admin');

const app = express();
app.use(express.json());
app.use('/admin', router);

const adminToken = generateAccessToken(1);
const regularToken = generateAccessToken(99);

const adminUser = { id: 1, isAdmin: true, trustScore: 100, isShadowBanned: false };
const regularUser = { id: 99, isAdmin: false, trustScore: 80, isShadowBanned: false };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /admin/dashboard', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/admin/dashboard');
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    Users.findByPk.mockResolvedValue(regularUser);
    const res = await request(app)
      .get('/admin/dashboard')
      .set('Authorization', `Bearer ${regularToken}`);
    expect(res.status).toBe(403);
  });

  it('returns dashboard stats for admin (200)', async () => {
    Users.findByPk.mockResolvedValue(adminUser);
    Users.count.mockResolvedValue(50);
    Reports.count.mockResolvedValue(3);
    TrustEvents.findAll.mockResolvedValue([]);
    const res = await request(app)
      .get('/admin/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalUsers');
    expect(res.body).toHaveProperty('pendingReports');
    expect(res.body).toHaveProperty('trustDistribution');
  });
});

describe('GET /admin/reports', () => {
  it('returns 403 for non-admin user', async () => {
    Users.findByPk.mockResolvedValue(regularUser);
    const res = await request(app)
      .get('/admin/reports')
      .set('Authorization', `Bearer ${regularToken}`);
    expect(res.status).toBe(403);
  });

  it('returns paginated reports for admin (200)', async () => {
    Users.findByPk.mockResolvedValue(adminUser);
    Reports.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });
    const res = await request(app)
      .get('/admin/reports')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('reports');
    expect(res.body).toHaveProperty('total');
  });
});

describe('PUT /admin/reports/:id', () => {
  it('returns 403 for non-admin user', async () => {
    Users.findByPk.mockResolvedValue(regularUser);
    const res = await request(app)
      .put('/admin/reports/1')
      .set('Authorization', `Bearer ${regularToken}`)
      .send({ status: 'reviewed' });
    expect(res.status).toBe(403);
  });

  it('returns 404 when report not found', async () => {
    Users.findByPk.mockResolvedValue(adminUser);
    Reports.findByPk.mockResolvedValue(null);
    const res = await request(app)
      .put('/admin/reports/999')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'reviewed' });
    expect(res.status).toBe(404);
  });

  it('updates report status for admin (200)', async () => {
    Users.findByPk.mockResolvedValue(adminUser);
    const report = {
      id: 1,
      status: 'pending',
      reportedUserId: 99,
      reporterId: 55,
      type: 'spam',
      update: jest.fn().mockResolvedValue(undefined),
    };
    Reports.findByPk.mockResolvedValue(report);
    const res = await request(app)
      .put('/admin/reports/1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'reviewed', action: 'warning issued' });
    expect(res.status).toBe(200);
    expect(report.update).toHaveBeenCalled();
  });

  it('applies trust penalty and creates TrustEvent when actioned', async () => {
    // findByPk is called multiple times: once for admin check, once for the reported user
    Users.findByPk
      .mockResolvedValueOnce(adminUser) // admin check
      .mockResolvedValueOnce({ id: 99, trustScore: 80, isShadowBanned: false, update: jest.fn() }); // reported user
    const report = {
      id: 1,
      status: 'pending',
      reportedUserId: 99,
      reporterId: 55,
      type: 'harassment',
      update: jest.fn().mockResolvedValue(undefined),
    };
    Reports.findByPk.mockResolvedValue(report);
    TrustEvents.create.mockResolvedValue({ id: 2 });
    const res = await request(app)
      .put('/admin/reports/1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'actioned', action: 'penalty applied', trustPenalty: 10 });
    expect(res.status).toBe(200);
    expect(TrustEvents.create).toHaveBeenCalled();
  });
});

describe('GET /admin/users', () => {
  it('returns 403 for non-admin user', async () => {
    Users.findByPk.mockResolvedValue(regularUser);
    const res = await request(app)
      .get('/admin/users')
      .set('Authorization', `Bearer ${regularToken}`);
    expect(res.status).toBe(403);
  });

  it('returns user list for admin (200)', async () => {
    Users.findByPk.mockResolvedValue(adminUser);
    Users.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });
    const res = await request(app)
      .get('/admin/users')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('users');
    expect(res.body).toHaveProperty('total');
  });
});

describe('GET /admin/users/:id', () => {
  it('returns 403 for non-admin', async () => {
    Users.findByPk.mockResolvedValue(regularUser);
    const res = await request(app)
      .get('/admin/users/99')
      .set('Authorization', `Bearer ${regularToken}`);
    expect(res.status).toBe(403);
  });

  it('returns 404 when user not found', async () => {
    Users.findByPk
      .mockResolvedValueOnce(adminUser) // admin check
      .mockResolvedValueOnce(null);     // user lookup
    TrustEvents.findAll.mockResolvedValue([]);
    Reports.findAll.mockResolvedValue([]);
    const res = await request(app)
      .get('/admin/users/999')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it('returns user detail with trust/report history (200)', async () => {
    Users.findByPk
      .mockResolvedValueOnce(adminUser)
      .mockResolvedValueOnce({ id: 99, name: 'Test User', email: 'test@test.com' });
    TrustEvents.findAll.mockResolvedValue([]);
    Reports.findAll.mockResolvedValue([]);
    const res = await request(app)
      .get('/admin/users/99')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('user');
    expect(res.body).toHaveProperty('trustHistory');
    expect(res.body).toHaveProperty('reportHistory');
  });
});

describe('PUT /admin/users/:id/ban', () => {
  it('returns 403 for non-admin', async () => {
    Users.findByPk.mockResolvedValue(regularUser);
    const res = await request(app)
      .put('/admin/users/99/ban')
      .set('Authorization', `Bearer ${regularToken}`);
    expect(res.status).toBe(403);
  });

  it('shadow bans user and creates TrustEvent (200)', async () => {
    const targetUser = {
      id: 99,
      trustScore: 60,
      isShadowBanned: false,
      update: jest.fn().mockResolvedValue(undefined),
    };
    Users.findByPk
      .mockResolvedValueOnce(adminUser)
      .mockResolvedValueOnce(targetUser);
    TrustEvents.create.mockResolvedValue({ id: 1 });
    const res = await request(app)
      .put('/admin/users/99/ban')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Repeated violations' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message');
    expect(targetUser.update).toHaveBeenCalledWith(expect.objectContaining({ isShadowBanned: true }));
    expect(TrustEvents.create).toHaveBeenCalled();
  });
});

describe('PUT /admin/users/:id/unban', () => {
  it('returns 403 for non-admin', async () => {
    Users.findByPk.mockResolvedValue(regularUser);
    const res = await request(app)
      .put('/admin/users/99/unban')
      .set('Authorization', `Bearer ${regularToken}`);
    expect(res.status).toBe(403);
  });

  it('removes shadow ban and creates TrustEvent (200)', async () => {
    const targetUser = {
      id: 99,
      trustScore: 25,
      isShadowBanned: true,
      update: jest.fn().mockResolvedValue(undefined),
    };
    Users.findByPk
      .mockResolvedValueOnce(adminUser)
      .mockResolvedValueOnce(targetUser);
    TrustEvents.create.mockResolvedValue({ id: 2 });
    const res = await request(app)
      .put('/admin/users/99/unban')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(targetUser.update).toHaveBeenCalledWith(
      expect.objectContaining({ isShadowBanned: false })
    );
  });
});

describe('PUT /admin/users/:id/make-admin', () => {
  it('returns 403 for non-admin', async () => {
    Users.findByPk.mockResolvedValue(regularUser);
    const res = await request(app)
      .put('/admin/users/99/make-admin')
      .set('Authorization', `Bearer ${regularToken}`);
    expect(res.status).toBe(403);
  });

  it('toggles admin status (200)', async () => {
    const targetUser = {
      id: 99,
      isAdmin: false,
      update: jest.fn().mockResolvedValue(undefined),
    };
    Users.findByPk
      .mockResolvedValueOnce(adminUser)
      .mockResolvedValueOnce(targetUser);
    const res = await request(app)
      .put('/admin/users/99/make-admin')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('isAdmin', true);
    expect(targetUser.update).toHaveBeenCalledWith({ isAdmin: true });
  });
});
