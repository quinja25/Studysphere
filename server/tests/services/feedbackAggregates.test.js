'use strict';
process.env.NODE_ENV = 'test';

const { Op } = require('sequelize');

jest.mock('../../models', () => ({
    AiFeedback: {
        findAll: jest.fn(),
    },
}));

const { AiFeedback } = require('../../models');
const { sourceTypeStats, sourcePerformance } = require('../../services/feedbackAggregates');

beforeEach(() => { jest.clearAllMocks(); });

// ── sourceTypeStats ───────────────────────────────────────────────────────────

describe('sourceTypeStats', () => {
    it('aggregates up/down counts and ctr per source type', async () => {
        AiFeedback.findAll.mockResolvedValue([
            { rating: 'up',   clickedSources: JSON.stringify([{ source: 'wiki', sourceId: 1 }]) },
            { rating: 'up',   clickedSources: JSON.stringify([{ source: 'wiki', sourceId: 2 }]) },
            { rating: 'down', clickedSources: JSON.stringify([{ source: 'wiki', sourceId: 1 }]) },
            { rating: 'up',   clickedSources: JSON.stringify([{ source: 'post', sourceId: 5 }]) },
        ]);

        const result = await sourceTypeStats();

        expect(result.wiki.upCount).toBe(2);
        expect(result.wiki.downCount).toBe(1);
        expect(result.wiki.ctr).toBeCloseTo(2 / 3);
        expect(result.post.upCount).toBe(1);
        expect(result.post.downCount).toBe(0);
        expect(result.post.ctr).toBe(1);
    });

    it('skips rows with malformed JSON without throwing', async () => {
        AiFeedback.findAll.mockResolvedValue([
            { rating: 'up', clickedSources: 'NOT_JSON' },
            { rating: 'up', clickedSources: JSON.stringify([{ source: 'wiki', sourceId: 1 }]) },
        ]);

        await expect(sourceTypeStats()).resolves.not.toThrow();
        const result = await sourceTypeStats();
        expect(result.wiki).toBeDefined();
    });

    it('returns empty object when no feedback exists', async () => {
        AiFeedback.findAll.mockResolvedValue([]);
        const result = await sourceTypeStats();
        expect(result).toEqual({});
    });
});

// ── sourcePerformance ─────────────────────────────────────────────────────────

describe('sourcePerformance', () => {
    it('filters by sinceDays using Op.gte on createdAt', async () => {
        AiFeedback.findAll.mockResolvedValue([]);
        await sourcePerformance({ sinceDays: 7 });

        const where = AiFeedback.findAll.mock.calls[0][0].where;
        expect(where.createdAt).toBeDefined();
        expect(where.createdAt[Op.gte]).toBeInstanceOf(Date);

        // The cutoff should be within ~1 second of 7 days ago
        const expected = Date.now() - 7 * 24 * 60 * 60 * 1000;
        expect(Math.abs(where.createdAt[Op.gte].getTime() - expected)).toBeLessThan(1000);
    });

    it('aggregates per source+sourceId pair', async () => {
        AiFeedback.findAll.mockResolvedValue([
            { rating: 'up',   clickedSources: JSON.stringify([{ source: 'wiki', sourceId: 1 }]) },
            { rating: 'down', clickedSources: JSON.stringify([{ source: 'wiki', sourceId: 1 }]) },
            { rating: 'up',   clickedSources: JSON.stringify([{ source: 'wiki', sourceId: 2 }]) },
        ]);

        const result = await sourcePerformance();
        const wiki1 = result.find(r => r.source === 'wiki' && r.sourceId === 1);
        const wiki2 = result.find(r => r.source === 'wiki' && r.sourceId === 2);

        expect(wiki1).toBeDefined();
        expect(wiki1.upCount).toBe(1);
        expect(wiki1.downCount).toBe(1);
        expect(wiki2.upCount).toBe(1);
        expect(wiki2.downCount).toBe(0);
    });

    it('skips malformed JSON silently', async () => {
        AiFeedback.findAll.mockResolvedValue([
            { rating: 'up', clickedSources: '{bad json' },
            { rating: 'up', clickedSources: JSON.stringify([{ source: 'qa', sourceId: 9 }]) },
        ]);

        await expect(sourcePerformance()).resolves.not.toThrow();
        const result = await sourcePerformance();
        expect(result.some(r => r.source === 'qa')).toBe(true);
    });

    it('uses default sinceDays of 30', async () => {
        AiFeedback.findAll.mockResolvedValue([]);
        await sourcePerformance();

        const where = AiFeedback.findAll.mock.calls[0][0].where;
        const expected = Date.now() - 30 * 24 * 60 * 60 * 1000;
        expect(Math.abs(where.createdAt[Op.gte].getTime() - expected)).toBeLessThan(1000);
    });
});
