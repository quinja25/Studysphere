'use strict';

process.env.JWT_SECRET = 'test-secret-key';

const http = require('http');
const { Server } = require('socket.io');
const { io: ioc } = require('socket.io-client');
const jwt = require('jsonwebtoken');
const { setupSocket } = require('../../socket/handlers');

/** Generate a valid access token for socket auth. */
function makeToken(userId = 1, name = 'TestUser') {
    return jwt.sign({ id: userId, type: 'access', name }, 'test-secret-key', { expiresIn: '15m' });
}

/** Spin up a fresh in-process server for every describe block. */
function createTestServer() {
    const httpServer = http.createServer();
    const ioServer = new Server(httpServer, { cors: { origin: '*' } });
    setupSocket(ioServer);
    return new Promise((resolve) => {
        httpServer.listen(0, () => {
            resolve({ httpServer, ioServer, port: httpServer.address().port });
        });
    });
}

/** Open a client and wait until it is connected. */
function connect(port, opts = {}) {
    return new Promise((resolve, reject) => {
        const client = ioc(`http://localhost:${port}`, {
            forceNew: true,
            transports: ['websocket'],
            auth: { token: makeToken() },
            ...opts,
        });
        client.once('connect', () => resolve(client));
        client.once('connect_error', reject);
    });
}

/** Wait for a specific event on a socket with a timeout. */
function waitFor(socket, event, timeout = 2000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timeout waiting for '${event}'`)), timeout);
        socket.once(event, (data) => {
            clearTimeout(timer);
            resolve(data);
        });
    });
}

// ─── Test suite ──────────────────────────────────────────────────────────────

describe('Socket.io handlers', () => {
    let httpServer, ioServer, port;

    beforeAll(async () => {
        ({ httpServer, ioServer, port } = await createTestServer());
    });

    afterAll((done) => {
        ioServer.close();
        httpServer.close(done);
    });

    afterEach(() => {
        // Disconnect all clients after each test
        ioServer.sockets.sockets.forEach(s => s.disconnect(true));
    });

    // ── join_room ────────────────────────────────────────────────────────────

    describe('join_room', () => {
        it('emits room_state with empty array when room is empty', async () => {
            const client = await connect(port);
            const roomStatePromise = waitFor(client, 'room_state');
            client.emit('join_room', 'room-1');
            const state = await roomStatePromise;
            expect(Array.isArray(state)).toBe(true);
            expect(state).toHaveLength(0);
            client.disconnect();
        });

        it('room_state excludes the joining socket itself', async () => {
            const c1 = await connect(port, { auth: { token: makeToken(10, 'Alice') } });
            const c2 = await connect(port, { auth: { token: makeToken(2, 'C2') } });

            // c1 joins and announces presence
            c1.emit('join_room', 'room-2');
            await waitFor(c1, 'room_state');
            c1.emit('presence', { room: 'room-2' });

            // Small delay so presence is processed before c2 joins
            await new Promise(r => setTimeout(r, 50));

            const statePromise = waitFor(c2, 'room_state');
            c2.emit('join_room', 'room-2');
            const state = await statePromise;

            // c2 should see c1 in the state (not itself)
            expect(state.some(u => u.userId === 10)).toBe(true);
            expect(state.every(u => u.userId !== null)).toBe(true);

            c1.disconnect();
            c2.disconnect();
        });
    });

    // ── presence ─────────────────────────────────────────────────────────────

    describe('presence', () => {
        it('broadcasts user_joined to other clients in the room', async () => {
            const c1 = await connect(port, { auth: { token: makeToken(1, 'Alice') } });
            const c2 = await connect(port, { auth: { token: makeToken(42, 'Bob') } });

            c1.emit('join_room', 'room-3');
            await waitFor(c1, 'room_state');
            c2.emit('join_room', 'room-3');
            await waitFor(c2, 'room_state');

            const joinedPromise = waitFor(c1, 'user_joined');
            c2.emit('presence', { room: 'room-3' });
            const joined = await joinedPromise;

            expect(joined.id).toBe(42);
            expect(joined.name).toBe('Bob');
            expect(joined.socketId).toBeDefined();

            c1.disconnect();
            c2.disconnect();
        });

        it('does not echo user_joined back to the sender', async () => {
            const client = await connect(port);
            client.emit('join_room', 'room-solo');
            await waitFor(client, 'room_state');

            let receivedOwnJoin = false;
            client.on('user_joined', () => { receivedOwnJoin = true; });
            client.emit('presence', { room: 'room-solo', userId: 7, name: 'Solo' });

            await new Promise(r => setTimeout(r, 100));
            expect(receivedOwnJoin).toBe(false);
            client.disconnect();
        });
    });

    // ── send_message ─────────────────────────────────────────────────────────

    describe('send_message', () => {
        it('broadcasts receive_message to other room members', async () => {
            const c1 = await connect(port);
            const c2 = await connect(port);

            c1.emit('join_room', 'room-chat');
            await waitFor(c1, 'room_state');
            c2.emit('join_room', 'room-chat');
            await waitFor(c2, 'room_state');

            const msgPromise = waitFor(c2, 'receive_message');
            c1.emit('send_message', { room: 'room-chat', author: 'Alice', message: 'Hello!' });
            const msg = await msgPromise;

            expect(msg.author).toBe('Alice');
            expect(msg.message).toBe('Hello!');

            c1.disconnect();
            c2.disconnect();
        });

        it('does not echo send_message back to sender', async () => {
            const client = await connect(port);
            client.emit('join_room', 'room-echo');
            await waitFor(client, 'room_state');

            let echoed = false;
            client.on('receive_message', () => { echoed = true; });
            client.emit('send_message', { room: 'room-echo', message: 'test' });

            await new Promise(r => setTimeout(r, 100));
            expect(echoed).toBe(false);
            client.disconnect();
        });
    });

    // ── whiteboard ───────────────────────────────────────────────────────────

    describe('whiteboard_draw', () => {
        it('broadcasts whiteboard_draw to other room members', async () => {
            const c1 = await connect(port);
            const c2 = await connect(port);

            c1.emit('join_room', 'room-wb');
            await waitFor(c1, 'room_state');
            c2.emit('join_room', 'room-wb');
            await waitFor(c2, 'room_state');

            const drawPromise = waitFor(c2, 'whiteboard_draw');
            const drawData = { room: 'room-wb', x: 10, y: 20, color: '#fff' };
            c1.emit('whiteboard_draw', drawData);
            const received = await drawPromise;

            expect(received.x).toBe(10);
            expect(received.y).toBe(20);

            c1.disconnect();
            c2.disconnect();
        });

        it('broadcasts whiteboard_clear to other room members', async () => {
            const c1 = await connect(port);
            const c2 = await connect(port);

            c1.emit('join_room', 'room-wbc');
            await waitFor(c1, 'room_state');
            c2.emit('join_room', 'room-wbc');
            await waitFor(c2, 'room_state');

            const clearPromise = waitFor(c2, 'whiteboard_clear');
            c1.emit('whiteboard_clear', { room: 'room-wbc' });
            await clearPromise;

            c1.disconnect();
            c2.disconnect();
        });
    });

    // ── disconnect ───────────────────────────────────────────────────────────

    describe('disconnect', () => {
        it('broadcasts user_left when a user with presence disconnects', async () => {
            const c1 = await connect(port, { auth: { token: makeToken(99, 'Leaver') } });
            const c2 = await connect(port);

            c1.emit('join_room', 'room-dc');
            await waitFor(c1, 'room_state');
            c2.emit('join_room', 'room-dc');
            await waitFor(c2, 'room_state');

            // c1 announces presence so it has a userId
            c1.emit('presence', { room: 'room-dc' });
            await waitFor(c2, 'user_joined'); // wait for user_joined before disconnecting

            const leftPromise = waitFor(c2, 'user_left');
            c1.disconnect();
            const leftData = await leftPromise;

            expect(leftData.id).toBe(99);
            expect(leftData.socketId).toBeDefined();

            c2.disconnect();
        });

        it('does not broadcast user_left when socket had no presence', async () => {
            const c1 = await connect(port);
            const c2 = await connect(port);

            c1.emit('join_room', 'room-nopresence');
            await waitFor(c1, 'room_state');
            c2.emit('join_room', 'room-nopresence');
            await waitFor(c2, 'room_state');

            // c1 never emits 'presence' — no userId
            let gotLeft = false;
            c2.on('user_left', () => { gotLeft = true; });
            c1.disconnect();

            await new Promise(r => setTimeout(r, 150));
            expect(gotLeft).toBe(false);

            c2.disconnect();
        });
    });

    // ── WebRTC signaling ─────────────────────────────────────────────────────

    describe('WebRTC signaling', () => {
        it('routes webrtc_offer point-to-point with sender metadata', async () => {
            const c1 = await connect(port, { auth: { token: makeToken(1, 'Alice') } });
            const c2 = await connect(port);

            c1.emit('join_room', 'room-rtc');
            await waitFor(c1, 'room_state');
            c2.emit('join_room', 'room-rtc');
            await waitFor(c2, 'room_state');
            c1.emit('presence', { room: 'room-rtc' });
            await waitFor(c2, 'user_joined');

            const offerPromise = waitFor(c2, 'webrtc_offer');
            c1.emit('webrtc_offer', { targetSocketId: c2.id, offer: { sdp: 'test-sdp' } });
            const offerData = await offerPromise;

            expect(offerData.offer.sdp).toBe('test-sdp');
            expect(offerData.fromSocketId).toBeDefined();
            expect(offerData.fromUserId).toBe(1);
            expect(offerData.fromName).toBe('Alice');

            c1.disconnect();
            c2.disconnect();
        });

        it('routes webrtc_answer point-to-point', async () => {
            const c1 = await connect(port);
            const c2 = await connect(port);

            c1.emit('join_room', 'room-ans');
            await waitFor(c1, 'room_state');
            c2.emit('join_room', 'room-ans');
            await waitFor(c2, 'room_state');

            const answerPromise = waitFor(c1, 'webrtc_answer');
            c2.emit('webrtc_answer', { targetSocketId: c1.id, answer: { sdp: 'ans-sdp' } });
            const answerData = await answerPromise;

            expect(answerData.answer.sdp).toBe('ans-sdp');

            c1.disconnect();
            c2.disconnect();
        });
    });
});
