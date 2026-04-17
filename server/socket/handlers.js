'use strict';

const { verify } = require('jsonwebtoken');

/**
 * setupSocket — wires all Socket.io room/presence/relay handlers.
 *
 * Extracted from server.js so the logic can be unit-tested without
 * starting the full HTTP server or touching the database.
 *
 * @param {import('socket.io').Server} io
 * @returns {Map} roomUsers — in-memory presence map (exposed for testing)
 */
function setupSocket(io) {
    // roomId -> Map<socketId, { userId, name }>
    const roomUsers = new Map();

    // ── Socket.io authentication middleware ────────────────────────────────
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token;
        if (!token) return next(new Error('Authentication required'));
        try {
            const decoded = verify(token, process.env.JWT_SECRET);
            if (decoded.type !== 'access') return next(new Error('Invalid token type'));
            socket.user = decoded;
            next();
        } catch (err) {
            next(new Error('Authentication failed'));
        }
    });

    io.on('connection', (socket) => {
        // ── Per-user notification room ─────────────────────────────────────
        // Every authenticated socket joins `user_${userId}` on connect so the
        // backend can target real-time pushes (new answer, endorsement, etc.)
        // without knowing which tab the user has open.
        if (socket.user?.id != null) {
            socket.join(`user_${socket.user.id}`);
        }

        // ── Room join ──────────────────────────────────────────────────────
        socket.on('join_room', (room) => {
            const roomId = String(room);
            socket.join(roomId);
            socket._studyRoom = roomId;

            if (!roomUsers.has(roomId)) roomUsers.set(roomId, new Map());
            roomUsers.get(roomId).set(socket.id, { userId: null, name: null });

            const currentUsers = Array.from(roomUsers.get(roomId).entries())
                .filter(([sid, data]) => sid !== socket.id && data.userId !== null)
                .map(([sid, data]) => ({ socketId: sid, userId: data.userId, name: data.name }));
            socket.emit('room_state', currentUsers);
        });

        // ── Presence ───────────────────────────────────────────────────────
        socket.on('presence', (data) => {
            const roomId = String(data.room);
            const userId = socket.user.id;
            const name = socket.user.name;
            socket._studyRoom = roomId;
            socket._userId = userId;
            socket._userName = name;

            if (roomUsers.has(roomId)) {
                roomUsers.get(roomId).set(socket.id, { userId, name });
            }

            socket.to(roomId).emit('user_joined', {
                id: userId,
                name,
                socketId: socket.id,
            });
        });

        // ── Chat ───────────────────────────────────────────────────────────
        socket.on('send_message', (data) => {
            socket.to(String(data.room)).emit('receive_message', data);
        });

        // ── Whiteboard ─────────────────────────────────────────────────────
        socket.on('whiteboard_draw', (data) => {
            socket.to(String(data.room)).emit('whiteboard_draw', data);
        });

        socket.on('whiteboard_clear', (data) => {
            socket.to(String(data.room)).emit('whiteboard_clear', data);
        });

        // ── AI relay ───────────────────────────────────────────────────────
        socket.on('ai_response', (data) => {
            socket.to(String(data.room)).emit('ai_response', data);
        });

        // ── WebRTC signaling (pure relay — server never inspects content) ──
        socket.on('webrtc_offer', ({ targetSocketId, offer }) => {
            io.to(targetSocketId).emit('webrtc_offer', {
                offer,
                fromSocketId: socket.id,
                fromUserId: socket._userId,
                fromName: socket._userName,
            });
        });

        socket.on('webrtc_answer', ({ targetSocketId, answer }) => {
            io.to(targetSocketId).emit('webrtc_answer', {
                answer,
                fromSocketId: socket.id,
            });
        });

        socket.on('webrtc_ice_candidate', ({ targetSocketId, candidate }) => {
            io.to(targetSocketId).emit('webrtc_ice_candidate', {
                candidate,
                fromSocketId: socket.id,
            });
        });

        // ── Disconnect ─────────────────────────────────────────────────────
        socket.on('disconnect', () => {
            const roomId = socket._studyRoom;
            if (roomId) {
                const room = roomUsers.get(roomId);
                if (room) {
                    room.delete(socket.id);
                    if (room.size === 0) roomUsers.delete(roomId);
                }
            }
            if (roomId && socket._userId) {
                socket.to(roomId).emit('user_left', {
                    id: socket._userId,
                    socketId: socket.id,
                });
            }
        });
    });

    return roomUsers;
}

module.exports = { setupSocket };
