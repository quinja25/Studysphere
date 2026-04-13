import React, { useEffect, useState, useRef } from 'react';
import { NavBar } from "../components/NavBar";
import { useParams, useNavigate } from 'react-router-dom';
import './Group.css';
import api from '../api';
import io from 'socket.io-client';
import ChatBody from '../components/ChatBody';
import ChatFooter from '../components/ChatFooter';
import { SlMicrophone, SlCamrecorder, SlBubble, SlClose, SlLogout, SlSizeFullscreen, SlClock, SlControlPlay, SlControlPause, SlScreenDesktop, SlPencil, SlMagicWand, SlEarphones } from "react-icons/sl";
import Whiteboard from '../components/Whiteboard';
import AiAssistant from '../components/AiAssistant';
import AmbientSound from '../components/AmbientSound';
import { usePomodoro } from '../hooks/usePomodoro';
import { useSessionSave } from '../hooks/useSessionSave';
import { useChatRoom } from '../hooks/useChatRoom';

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

// ICE server config — reads TURN credentials from env vars when available.
// Without a TURN server, peers behind symmetric NAT (school/corporate networks) may fail.
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

// ── RemoteVideo ────────────────────────────────────────────────────────────────
// Separate component so each remote stream gets its own stable ref.

const RemoteVideo = React.memo(({ stream, name }) => {
    const videoRef = useRef(null);
    useEffect(() => {
        if (videoRef.current && stream) videoRef.current.srcObject = stream;
    }, [stream]);
    return (
        <div className="video-tile">
            <video ref={videoRef} autoPlay playsInline className="video-feed" />
            <span className="video-name-label">{name}</span>
        </div>
    );
});

// ── Group ──────────────────────────────────────────────────────────────────────

export const Group = () => {
    const { id } = useParams();
    const navigate = useNavigate();

    // DOM refs
    const videoWrapperRef = useRef(null);
    const localVideoRef   = useRef(null);
    const socketRef       = useRef(null);

    // WebRTC refs — kept as refs because updates shouldn't cause re-renders
    const localStreamRef     = useRef(null);
    const peerConnectionsRef = useRef({});

    // Room state
    const [userId, setUserId]               = useState(null);
    const [group, setGroup]                 = useState(null);
    const [userList, setUserList]           = useState([]);
    const [joinTime, setJoinTime]           = useState(null);
    const [videoQuality, setVideoQuality]   = useState('high');
    const [remoteStreams, setRemoteStreams]  = useState({});

    // Media controls
    const [micOn, setMicOn]               = useState(true);
    const [cameraOn, setCameraOn]         = useState(true);
    const [screenShareOn, setScreenShareOn] = useState(false);
    const [screenStream, setScreenStream] = useState(null);

    // Sidebar visibility
    const [showChat, setShowChat]           = useState(false);
    const [showWhiteboard, setShowWhiteboard] = useState(false);
    const [showAI, setShowAI]               = useState(false);
    const [showAmbient, setShowAmbient]     = useState(false);

    // Session goals
    const [showGoalModal, setShowGoalModal] = useState(false);
    const [goalInput, setGoalInput]         = useState('');
    const [currentGoal, setCurrentGoal]     = useState(null);
    const [goalCompleted, setGoalCompleted] = useState(false);

    // ── Custom hooks ───────────────────────────────────────────────────────────
    const {
        timerTime, timerActive, timerMode,
        sessionDuration, setSessionDuration,
        startTimer, stopTimer, formatTime, handleTimerMessage,
    } = usePomodoro(id, socketRef);

    const {
        showExitModal,
        sessionStats, recap, recapLoading,
        saveStudyTime, closeExitModal,
    } = useSessionSave(id, userId, joinTime, goalCompleted);

    const {
        messages, chatError,
        loadMessages, addMessage,
        handleSendMessage, handlePinMessage, handleDeleteMessage,
    } = useChatRoom(id, socketRef);

    const isFocusMode = timerActive && timerMode === 'focus';

    // ── Main room initialisation (WebRTC + socket) ─────────────────────────────
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
                        setRemoteStreams(prev => { const n = { ...prev }; delete n[remoteSocketId]; return n; });
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

            setJoinTime(Date.now());
            socket.emit('join_room', id);

            if (localUser?.email) {
                api.get(`/users/byEmail/${localUser.email}`).then((res) => {
                    if (!isMounted) return;
                    const uid = res.data.id;
                    setUserId(uid);
                    socket.emit('presence', { room: id, userId: uid, name: res.data.name });

                    api.get(`/groupsUsers/byGroup/${id}`).then((r) => {
                        if (!isMounted) return;
                        setUserList(r.data);
                        const alreadyMember = r.data.some(u => String(u.id) === String(uid));
                        if (!alreadyMember) {
                            api.post(`/groupsUsers/user/${uid}/group/${id}`)
                                .then(() => api.get(`/groupsUsers/byGroup/${id}`))
                                .then(r2 => { if (isMounted) setUserList(r2.data); })
                                .catch(() => {});
                        }
                    });
                });
            } else {
                api.get(`/groupsUsers/byGroup/${id}`).then((r) => {
                    if (isMounted) setUserList(r.data);
                });
            }

            api.get(`/groups/byID/${id}`).then((res) => {
                if (!isMounted) return;
                setGroup(res.data);
            });

            api.get(`/session-goals/byGroup/${id}`).then((goalsRes) => {
                if (!isMounted) return;
                const incomplete = goalsRes.data.find(g => !g.isCompleted && !g.carriedForward);
                if (incomplete) setCurrentGoal({ id: incomplete.id, goal: incomplete.goal });
                else setShowGoalModal(true);
            }).catch(() => {});

            api.get(`/chats/${id}`).then((res) => {
                if (isMounted) loadMessages(res.data);
            });

            // ── Socket events ────────────────────────────────────────────────

            socket.on('receive_message', (data) => {
                if (String(data.room) !== String(id)) return;
                if (data.type === 'TIMER_START' || data.type === 'TIMER_STOP') {
                    handleTimerMessage(data);
                } else if (!data.type) {
                    addMessage(data);
                }
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
                if (!isMounted) return;
                setUserList(prev =>
                    prev.some(u => String(u.id) === String(user.id))
                        ? prev
                        : [...prev, { id: user.id, name: user.name }]
                );
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
                setUserList(prev => prev.filter(u => String(u.id) !== String(leftId)));
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
    }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Network-adaptive video quality ─────────────────────────────────────────
    useEffect(() => {
        const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (!conn) return;
        setVideoQuality(getQualityLevel(conn));
        const handleChange = () => setVideoQuality(getQualityLevel(conn));
        conn.addEventListener('change', handleChange);
        return () => conn.removeEventListener('change', handleChange);
    }, []);

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

    const toggleFullScreen = () => {
        if (!document.fullscreenElement) {
            videoWrapperRef.current?.requestFullscreen().catch(err => {
                console.error('Fullscreen error:', err.message);
            });
        } else {
            document.exitFullscreen();
        }
    };

    const leaveCall = async () => {
        const saved = await saveStudyTime(userList, true);
        if (!saved) navigate('/lobby');
    };

    // ── Session goal handlers ──────────────────────────────────────────────────

    const handleSetGoal = async () => {
        if (!goalInput.trim()) return;
        try {
            const userData = JSON.parse(localStorage.getItem('userData') || '{}');
            const res = await api.post('/session-goals', {
                userId: userData.id,
                groupId: parseInt(id),
                goal: goalInput.trim(),
            });
            setCurrentGoal({ id: res.data.id, goal: res.data.goal });
            setGoalInput('');
            setShowGoalModal(false);
        } catch (e) {
            console.error('Failed to save goal:', e);
            setShowGoalModal(false);
        }
    };

    const handleMarkGoalComplete = async () => {
        if (!currentGoal) return;
        try {
            await api.put(`/session-goals/${currentGoal.id}`, { isCompleted: true });
            setGoalCompleted(true);
        } catch (e) {
            console.error('Failed to mark goal complete:', e);
        }
    };

    // ── Render ─────────────────────────────────────────────────────────────────

    const remoteEntries = Object.entries(remoteStreams);
    const totalTiles = 1 + remoteEntries.length;
    const gridClass = totalTiles >= 10 ? 'participants-many' : `participants-${totalTiles}`;

    return (
        <div className={`group-page${isFocusMode ? ' focus-mode' : ''}`}>
            <NavBar />
            <div className="group-main-content">
                <div className={`video-container ${showChat ? 'with-chat' : ''} ${showWhiteboard ? 'with-whiteboard' : ''} ${showAI ? 'with-ai' : ''}`}>

                    <div className="timer-section">
                        <div className={`timer-display ${timerMode}`}>
                            <SlClock className="timer-icon" />
                            <span className="time-text">{formatTime(timerTime)}</span>
                            <span className="mode-text">{timerMode === 'focus' ? 'Focus' : 'Break'}</span>
                        </div>
                        {group && String(group.leader) === String(userId) && (
                            <div className="timer-controls">
                                {!timerActive ? (
                                    <>
                                        <input
                                            type="number"
                                            className="timer-input"
                                            value={sessionDuration}
                                            onChange={(e) => setSessionDuration(e.target.value)}
                                            min="1"
                                        />
                                        <button className="timer-btn start" onClick={startTimer}><SlControlPlay /></button>
                                    </>
                                ) : (
                                    <button className="timer-btn stop" onClick={stopTimer}><SlControlPause /></button>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="video-wrapper" ref={videoWrapperRef}>
                        <div className={`video-grid ${gridClass}`}>
                            <div className="video-tile local-tile">
                                <video
                                    ref={localVideoRef}
                                    autoPlay playsInline muted
                                    className={`video-feed${!cameraOn && !screenShareOn ? ' hidden' : ''}`}
                                />
                                {!cameraOn && !screenShareOn && (
                                    <div className="camera-placeholder"><p>Camera Off</p></div>
                                )}
                                <span className="video-name-label">
                                    You {!micOn && <span className="muted-indicator">(muted)</span>}
                                </span>
                                <div className={`quality-badge quality-${videoQuality}`}>
                                    {videoQuality.toUpperCase()}
                                </div>
                            </div>
                            {remoteEntries.map(([socketId, { stream, name }]) => (
                                <RemoteVideo key={socketId} stream={stream} name={name} />
                            ))}
                        </div>

                        <div className="call-controls">
                            <button className={`control-btn ${!micOn ? 'active' : ''}`} onClick={toggleMic} title={micOn ? 'Mute' : 'Unmute'}><SlMicrophone /></button>
                            <button className={`control-btn ${!cameraOn ? 'active' : ''}`} onClick={toggleCamera} title={cameraOn ? 'Turn Camera Off' : 'Turn Camera On'}><SlCamrecorder /></button>
                            <button className={`control-btn ${screenShareOn ? 'active' : ''}`} onClick={toggleScreenShare} title="Share Screen"><SlScreenDesktop /></button>
                            <button className={`control-btn ${showChat ? 'active' : ''}`} onClick={() => setShowChat(v => !v)} title="Chat"><SlBubble /></button>
                            <button className={`control-btn ${showWhiteboard ? 'active' : ''}`} onClick={() => setShowWhiteboard(v => !v)} title="Whiteboard"><SlPencil /></button>
                            <button className={`control-btn ai-btn ${showAI ? 'active' : ''}`} onClick={() => setShowAI(v => !v)} title="AI Assistant"><SlMagicWand /></button>
                            <button className={`control-btn ${showAmbient ? 'active' : ''}`} onClick={() => setShowAmbient(v => !v)} title="Ambient Sound"><SlEarphones /></button>
                            <button className="control-btn" onClick={toggleFullScreen} title="Fullscreen"><SlSizeFullscreen /></button>
                            <button className="control-btn leave-btn" onClick={leaveCall} title="Leave Call"><SlLogout /></button>
                        </div>

                        {showAmbient && <AmbientSound onClose={() => setShowAmbient(false)} />}
                    </div>

                    <div className="participants-section">
                        <h3>Participants ({userList.length})</h3>
                        <div className="participants-list">
                            {userList.map((user, key) => (
                                <div className="participant-card" key={key}>
                                    <div className="participant-avatar">
                                        {user.name ? user.name.charAt(0).toUpperCase() : '?'}
                                    </div>
                                    <p className="participant-name">{user.name}</p>
                                </div>
                            ))}
                        </div>
                        {currentGoal && (
                            <div className={`goal-banner${goalCompleted ? ' completed' : ''}`}>
                                <span className="goal-label">🎯 Goal:</span>
                                <span className="goal-text">{currentGoal.goal}</span>
                                {!goalCompleted
                                    ? <button className="goal-complete-btn" onClick={handleMarkGoalComplete}>✓ Done</button>
                                    : <span className="goal-done-badge">✓ Completed!</span>
                                }
                            </div>
                        )}
                    </div>
                </div>

                {showChat && (
                    <div className="group-chat-sidebar">
                        <div className="chat-sidebar-header">
                            <h3>Chat</h3>
                            <button className="close-chat-btn" onClick={() => setShowChat(false)}><SlClose /></button>
                        </div>
                        {chatError && <div className="chat-error-banner">{chatError}</div>}
                        <div className="chat-sidebar-body">
                            <ChatBody messages={messages} onPinMessage={handlePinMessage} onDeleteMessage={handleDeleteMessage} />
                        </div>
                        <div className="chat-sidebar-footer">
                            <ChatFooter socket={socketRef.current} selectedGroupId={id} onSendMessage={handleSendMessage} />
                        </div>
                    </div>
                )}

                {showWhiteboard && (
                    <div className="group-whiteboard-sidebar">
                        <div className="chat-sidebar-header">
                            <h3>Whiteboard</h3>
                            <button className="close-chat-btn" onClick={() => setShowWhiteboard(false)}><SlClose /></button>
                        </div>
                        <Whiteboard socket={socketRef.current} room={id} />
                    </div>
                )}

                {showAI && (
                    <AiAssistant groupId={id} group={group} socket={socketRef.current} onClose={() => setShowAI(false)} />
                )}
            </div>

            {isFocusMode && (
                <div className="focus-exit-hint" onClick={stopTimer}>Click to exit focus mode</div>
            )}

            {showGoalModal && !currentGoal && (
                <div className="goal-modal-overlay">
                    <div className="goal-modal">
                        <h3>Set a Session Goal</h3>
                        <p>What do you want to accomplish in this study session?</p>
                        <input
                            className="goal-input"
                            type="text"
                            placeholder="e.g. Complete Chapter 5 exercises"
                            value={goalInput}
                            onChange={e => setGoalInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleSetGoal(); }}
                            autoFocus
                        />
                        <div className="goal-modal-actions">
                            <button className="goal-skip-btn" onClick={() => setShowGoalModal(false)}>Skip</button>
                            <button className="goal-set-btn" onClick={handleSetGoal} disabled={!goalInput.trim()}>Set Goal</button>
                        </div>
                    </div>
                </div>
            )}

            {showExitModal && (
                <div className="exit-modal-overlay">
                    <div className="exit-modal">
                        <h2>Session Summary</h2>
                        <p>You studied for <strong>{sessionStats.minutes}</strong> minutes.</p>
                        <p>You gained <strong>{sessionStats.xpGained} XP</strong>!</p>

                        {currentGoal && (
                            <div className={`exit-goal-status${goalCompleted ? ' completed' : ''}`}>
                                <p className="exit-goal-label">Session Goal:</p>
                                <p className="exit-goal-text">"{currentGoal.goal}"</p>
                                {goalCompleted
                                    ? <p className="exit-goal-result">✓ Completed! +25 bonus XP</p>
                                    : <p className="exit-goal-result incomplete">Not completed yet</p>
                                }
                            </div>
                        )}

                        {sessionStats.currentStreak > 0 && (
                            <div className="streak-notification">
                                <p>Your study streak is now <strong>{sessionStats.currentStreak} day{sessionStats.currentStreak !== 1 ? 's' : ''}</strong>!</p>
                                {sessionStats.currentStreak === sessionStats.longestStreak && sessionStats.currentStreak > 1 && (
                                    <p className="streak-record">New personal record!</p>
                                )}
                            </div>
                        )}

                        {sessionStats.leveledUp && (
                            <div className="level-up-notification">
                                <h3>LEVEL UP!</h3>
                                <p>You are now Level <strong>{sessionStats.newLevel}</strong></p>
                            </div>
                        )}

                        <div className="recap-section">
                            {recapLoading && (
                                <div className="recap-generating">
                                    <div className="recap-spinner" />
                                    <span>Generating your session recap…</span>
                                </div>
                            )}
                            {!recapLoading && recap && (
                                <div className="recap-preview">
                                    <h3>Session Recap</h3>
                                    <p className="recap-summary">{recap.summary}</p>
                                    {recap.topicsCovered?.length > 0 && (
                                        <div className="recap-topics">
                                            {recap.topicsCovered.map((t, i) => (
                                                <span key={i} className="recap-topic-chip">{t}</span>
                                            ))}
                                        </div>
                                    )}
                                    {recap.actionItems?.length > 0 && (
                                        <div className="recap-actions">
                                            <p className="recap-actions-label">Action items:</p>
                                            <ul>{recap.actionItems.map((a, i) => <li key={i}>{a}</li>)}</ul>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="exit-modal-buttons">
                            <button className="modal-close-btn" onClick={closeExitModal}>
                                {recap ? 'View All Recaps' : 'Continue'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
