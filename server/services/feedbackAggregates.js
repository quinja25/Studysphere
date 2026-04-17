const { AiFeedback } = require('../models');
const { Op } = require('sequelize');

// Safe JSON parse — returns [] on malformed input
function parseSources(raw) {
    if (!raw) return [];
    try { return JSON.parse(raw); } catch { return []; }
}

/**
 * Aggregate feedback per source type across all users.
 * @returns {Promise<Record<string, { upCount, downCount, ctr }>>}
 */
async function sourceTypeStats() {
    const rows = await AiFeedback.findAll({ attributes: ['rating', 'clickedSources'] });
    const stats = {};
    for (const row of rows) {
        for (const src of parseSources(row.clickedSources)) {
            if (!src || !src.source) continue;
            if (!stats[src.source]) stats[src.source] = { upCount: 0, downCount: 0, ctr: 0 };
            if (row.rating === 'up') stats[src.source].upCount++;
            else stats[src.source].downCount++;
        }
    }
    for (const key of Object.keys(stats)) {
        const { upCount, downCount } = stats[key];
        const total = upCount + downCount;
        stats[key].ctr = total === 0 ? 0 : upCount / total;
    }
    return stats;
}

/**
 * Aggregate feedback per specific source (source+sourceId key).
 * @returns {Promise<Array<{ source, sourceId, upCount, downCount }>>}
 */
async function sourcePerformance({ sinceDays = 30 } = {}) {
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
    const rows = await AiFeedback.findAll({
        where: { createdAt: { [Op.gte]: since } },
        attributes: ['rating', 'clickedSources'],
    });
    const map = {};
    for (const row of rows) {
        for (const src of parseSources(row.clickedSources)) {
            if (!src || !src.source || src.sourceId == null) continue;
            const key = `${src.source}:${src.sourceId}`;
            if (!map[key]) map[key] = { source: src.source, sourceId: src.sourceId, upCount: 0, downCount: 0 };
            if (row.rating === 'up') map[key].upCount++;
            else map[key].downCount++;
        }
    }
    return Object.values(map);
}

module.exports = { sourceTypeStats, sourcePerformance };
