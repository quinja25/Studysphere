import { useState, useRef, useEffect } from 'react';
import io from 'socket.io-client';
import api from '../api';

// ── Constants ──────────────────────────────────────────────────────────────────

const QUALITY_MAP = {
    high:   { width: 1280, height: 720,  frameRate: 30 },
    medium: { width: 640,  height: 480,  frameRate: 15 },
    low:    { width: 320,  height: 240,  frameRate: 10 },
};

const getQualityLevel = (conn) => {
    if (!conn) return 'high';
    const { effectiveType, downlink = 10, rtt = 0 } = conn;
    if (effectiveType === '4g' && downlink >= 2 && rtt < 200) return 'high';
    if (effectiveType === '3g' || downlink < 2) return 'medium';
    return 'low';
};

const ICE_SERVERS = {
    iceServers: [
        { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
        ...(process.env.REACT_APP_TURN_URL ? [{
            urls: process.env.REACT_APP_TURN_URL,
            username: process.env.REACT_APP_TURN_USERNAME,
            credential: process.env.REACT_APP_TURN_CREDENTIAL,
        }] : []),
    ],
};

// ── useWebRTC ──────────────────────────────────────────────────────────────────
// Manages the WebRTC peer mesh, local media, and socket connection for a room.
//
// socketRef    — caller-owned ref; this hook populates socketRef.current so that
//                sibling hooks (usePomodoro, useChatRoom) share the same socket.
// localVideoRef — caller-owned DOM ref wired to the <video> element for local preview.
// callbacks    — side-effect hooks for non-WebRTC events that Group.js manages:
//   onJoin(joinTime)          — socket connected + room joined
//   onUserResolved(userId)    — local user ID resolved from the API
//   onGroupLoaded(group)      — group record loaded
//   onUserListUpdate(users)   — full user list refreshed
//   onUserJoined(user)        — incremental: single user joined
//   onUserLeft(userId)        — incremental: single user left
//   onGoalLoaded(goal, showModal) — session goal state initialised
//   onMessagesLoaded(msgs)    — initial chat history loaded
//   onMessage(data)           — new socket message (chat + timer)

export const useWebRTC = (roomId, socketRef, localVideoRef, {
    onJoin,
    onUserResolved,
    onGroupLoaded,
    onUserListUpdate,
    onUserJoined,
    onUserLeft,
    onGoalLoaded,
    onMessagesLoaded,
    onMessage,
}) => {
    const [remoteStreams, setRemoteStreams]   = useState({});
    const [videoQuality, setVideoQuality]    = useState('high');
    const [micOn, setMicOn]                  = useState(true);
    const [cameraOn, setCameraOn]            = useState(true);
    const [screenShareOn, setScreenShareOn]  = useState(false);
    const [screenStream, setScreenStream]    = useState(null);

    const localStreamRef     = useRef(null);
    const peerConnectionsRef = useRef({});

    // ── Network-adaptive quality ───────────────────────────────────────────────
    useEffect(() => {
        const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (!conn) return;
        setVideoQuality(getQualityLevel(conn));
        const handleChange = () => setVideoQuality(getQualityLevel(conn));
        conn.addEventListener('change', handleChange);
        return () => conn.removeEventListener('change', handleChange);
    }, []);

    // ── Room initialisation ────────────────────────────────────────────────────
    useEffect(() => {
        let isMounted = true;

        const createPeerConnection = (remoteSocketId, remoteUserId, remoteName) => {
            const pc = new RTCPeerConnection(ICE_SERVERS);

            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach(track => {
                    pc.addTrack(track, localStreamRef.current);
                });
            }

            pc.ontrack = (event) => {
                if (!isMounted) return;
                setRemoteStreams(prev => ({
                    ...prev,
                    [remoteSocketId]: { stream: event.streams[0], userId: remoteUserId, name: remoteName },
                }));
            };

            pc.onicecandidate = (event) => {
                if (event.candidate && socketRef.current) {
                    socketRef.current.emit('webrtc_ice_candidate', {
                        targetSocketId: remoteSocketId,
                        candidate: event.candidate,
                    });
                }
            };

            pc.onconnectionstatechange = () => {
                if (['failed', 'closed'].includes(pc.connectionState)) {
                    if (isMounted) {
                        setRemoteStreams(prev => {
                            const n = { ...prev };
                            delete n[remoteSocketId];
                            return n;
                        });
                    }
                    delete peerConnectionsRef.current[remoteSocketId];
                }
            };

            peerConnectionsRef.current[remoteSocketId] = pc;
            return pc;
        };

        const initRoom = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: QUALITY_MAP[videoQuality],
                    audio: true,
                });
                if (!isMounted) { stream.getTracks().forEach(t => t.stop()); return; }
                localStreamRef.current = stream;
                if (localVideoRef.current) localVideoRef.current.srcObject = stream;
            } catch (err) {
                console.warn('Camera/mic unavailable — joining without media:', err.message);
                localStreamRef.current = new MediaStream();
            }

            socketRef.current = io(process.env.REACT_APP_API_URL);
            const socket = socketRef.current;

            const localUser = (() => {
                const raw = localStorage.getItem('userData');
                return raw ? JSON.parse(raw) : null;
            })();

            onJoin?.(Date.now());
            socket.emit('join_room', roomId);

            if (localUser?.email) {
                api.get(`/users/byEmail/${localUser.email}`).then((res) => {
                    if (!isMounted) return;
                    const uid = res.data.id;
                    onUserResolved?.(uid);
                    socket.emit('presence', { room: roomId, userId: uid, name: res.data.name });

                    api.get(`/groupsUsers/byGroup/${roomId}`).then((r) => {
                        if (!isMounted) return;
                        onUserListUpdate?.(r.data);
                        const alreadyMember = r.data.some(u => String(u.id) === String(uid));
                        if (!alreadyMember) {
                            api.post(`/groupsUsers/user/${uid}/group/${roomId}`)
                                .then(() => api.get(`/groupsUsers/byGroup/${roomId}`))
                                .then(r2 => { if (isMounted) onUserListUpdate?.(r2.data); })
                                .catch(() => {});
                        }
                    });
                });
            } else {
                api.get(`/groupsUsers/byGroup/${roomId}`).then((r) => {
                    if (isMounted) onUserListUpdate?.(r.data);
                });
            }

            api.get(`/groups/byID/${roomId}`).then((res) => {
                if (isMounted) onGroupLoaded?.(res.data);
            });

            api.get(`/session-goals/byGroup/${roomId}`).then((goalsRes) => {
                if (!isMounted) return;
                const incomplete = goalsRes.data.find(g => !g.isCompleted && !g.carriedForward);
                onGoalLoaded?.(
                    incomplete ? { id: incomplete.id, goal: incomplete.goal } : null,
                    !incomplete, // showModal
                );
            }).catch(() => {});

            api.get(`/chats/${roomId}`).then((res) => {
                if (isMounted) onMessagesLoaded?.(res.data);
            });

            // ── Socket events ────────────────────────────────────────────────

            socket.on('receive_message', (data) => {
                if (String(data.room) !== String(roomId)) return;
                onMessage?.(data);
            });

            socket.on('room_state', async (users) => {
                for (const user of users) {
                    if (!user.userId || !isMounted) continue;
                    try {
                        const pc = createPeerConnection(user.socketId, user.userId, user.name);
                        const offer = await pc.createOffer();
                        await pc.setLocalDescription(offer);
                        socket.emit('webrtc_offer', { targetSocketId: user.socketId, offer });
                    } catch (err) {
                        console.error('Error creating WebRTC offer:', err);
                    }
                }
            });

            socket.on('user_joined', (user) => {
                if (isMounted) onUserJoined?.(user);
            });

            socket.on('webrtc_offer', async ({ offer, fromSocketId, fromUserId, fromName }) => {
                if (!isMounted) return;
                try {
                    const pc = createPeerConnection(fromSocketId, fromUserId, fromName);
                    await pc.setRemoteDescription(new RTCSessionDescription(offer));
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    socket.emit('webrtc_answer', { targetSocketId: fromSocketId, answer });
                } catch (err) {
                    console.error('Error handling WebRTC offer:', err);
                }
            });

            socket.on('webrtc_answer', async ({ answer, fromSocketId }) => {
                const pc = peerConnectionsRef.current[fromSocketId];
                if (!pc) return;
                try {
                    await pc.setRemoteDescription(new RTCSessionDescription(answer));
                } catch (err) {
                    console.error('Error setting remote description:', err);
                }
            });

            socket.on('webrtc_ice_candidate', async ({ candidate, fromSocketId }) => {
                const pc = peerConnectionsRef.current[fromSocketId];
                if (!pc || !candidate) return;
                try {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                } catch { /* safe to ignore during teardown */ }
            });

            socket.on('user_left', ({ id: leftId, socketId: leftSocketId }) => {
                if (!isMounted) return;
                const pc = peerConnectionsRef.current[leftSocketId];
                if (pc) { pc.close(); delete peerConnectionsRef.current[leftSocketId]; }
                setRemoteStreams(prev => { const n = { ...prev }; delete n[leftSocketId]; return n; });
                onUserLeft?.(leftId);
            });
        };

        initRoom();

        return () => {
            isMounted = false;
            Object.values(peerConnectionsRef.current).forEach(pc => pc.close());
            peerConnectionsRef.current = {};
            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach(t => t.stop());
                localStreamRef.current = null;
            }
            const socket = socketRef.current;
            if (socket) {
                socket.off('receive_message');
                socket.off('room_state');
                socket.off('user_joined');
                socket.off('user_left');
                socket.off('webrtc_offer');
                socket.off('webrtc_answer');
                socket.off('webrtc_ice_candidate');
                socket.disconnect();
            }
        };
    }, [roomId]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Media controls ─────────────────────────────────────────────────────────

    const toggleMic = () => {
        localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !micOn; });
        setMicOn(prev => !prev);
    };

    const toggleCamera = () => {
        localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !cameraOn; });
        setCameraOn(prev => !prev);
    };

    const toggleScreenShare = async () => {
        if (screenShareOn) {
            screenStream?.getTracks().forEach(t => t.stop());
            const cameraTrack = localStreamRef.current?.getVideoTracks()[0] || null;
            Object.values(peerConnectionsRef.current).forEach(pc => {
                const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                if (sender) sender.replaceTrack(cameraTrack);
            });
            if (localVideoRef.current && localStreamRef.current) {
                localVideoRef.current.srcObject = localStreamRef.current;
            }
            setScreenShareOn(false);
            setScreenStream(null);
        } else {
            try {
                const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
                const screenTrack = stream.getVideoTracks()[0];
                Object.values(peerConnectionsRef.current).forEach(pc => {
                    const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                    if (sender) sender.replaceTrack(screenTrack);
                });
                if (localVideoRef.current) localVideoRef.current.srcObject = stream;
                screenTrack.onended = () => {
                    const cameraTrack = localStreamRef.current?.getVideoTracks()[0] || null;
                    Object.values(peerConnectionsRef.current).forEach(pc => {
                        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                        if (sender) sender.replaceTrack(cameraTrack);
                    });
                    if (localVideoRef.current && localStreamRef.current) {
                        localVideoRef.current.srcObject = localStreamRef.current;
                    }
                    setScreenShareOn(false);
                    setScreenStream(null);
                };
                setScreenStream(stream);
                setScreenShareOn(true);
            } catch (err) {
                console.error('Error sharing screen:', err);
            }
        }
    };

    return {
        remoteStreams,
        videoQuality,
        micOn,
        cameraOn,
        screenShareOn,
        toggleMic,
        toggleCamera,
        toggleScreenShare,
    };
};
