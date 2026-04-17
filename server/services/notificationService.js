'use strict';

const db = require('../models');

/**
 * Create a persisted notification and, if an io instance is provided,
 * push it over the `user_${userId}` socket room in real time.
 *
 * @param {object} params
 * @param {number} params.userId       recipient
 * @param {string} params.type         'answer' | 'endorsement' | 'report_actioned'
 * @param {string} [params.relatedType] e.g. 'question', 'alumni', 'report'
 * @param {number} [params.relatedId]
 * @param {string} params.content     human-readable line shown in the bell
 * @param {string} [params.link]      client-side path to open when clicked
 * @param {import('socket.io').Server} [io]  emits 'notification:new' if passed
 * @returns {Promise<object>} the created Notifications row
 */
async function createAndEmit({ userId, type, relatedType, relatedId, content, link }, io) {
    if (!userId || !type || !content) {
        throw new Error('userId, type, and content are required');
    }

    const notif = await db.Notifications.create({
        userId,
        type,
        relatedType: relatedType || null,
        relatedId: relatedId || null,
        content,
        link: link || null,
    });

    if (io) {
        io.to(`user_${userId}`).emit('notification:new', notif.toJSON());
    }

    return notif;
}

module.exports = { createAndEmit };
