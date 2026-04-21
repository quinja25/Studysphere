import React, { useEffect, useState, useRef, useCallback } from 'react';
import { NavBar } from "../components/NavBar";
import { useParams, useNavigate } from 'react-router-dom';
import './Group.css';
import api from '../api';
import ChatBody from '../components/ChatBody';
import ChatFooter from '../components/ChatFooter';
import { SlMicrophone, SlCamrecorder, SlBubble, SlClose, SlLogout, SlSizeFullscreen, SlClock, SlControlPlay, SlControlPause, SlScreenDesktop, SlPencil, SlMagicWand, SlEarphones } from "react-icons/sl";
import Whiteboard from '../components/Whiteboard';
import AiAssistant from '../components/AiAssistant';
import AmbientSound from '../components/AmbientSound';
import { usePomodoro } from '../hooks/usePomodoro';
import { useSessionSave } from '../hooks/useSessionSave';
import { useChatRoom } from '../hooks/useChatRoom';
import { useWebRTC } from '../hooks/useWebRTC';

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

    // Room state
    const [userId, setUserId]       = useState(null);
    const [group, setGroup]         = useState(null);
    const [userList, setUserList]   = useState([]);
    const [joinTime, setJoinTime]   = useState(null);

    // Sidebar visibility
    const [showChat, setShowChat]             = useState(false);
    const [showWhiteboard, setShowWhiteboard] = useState(false);
    const [showAI, setShowAI]                 = useState(false);
    const [showAmbient, setShowAmbient]       = useState(false);

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

    // Stable callbacks for useWebRTC so it doesn't re-run on every render
    const handleMessage = useCallback((data) => {
        if (data.type === 'TIMER_START' || data.type === 'TIMER_STOP') {
            handleTimerMessage(data);
        } else if (!data.type) {
            addMessage(data);
        }
    }, [handleTimerMessage, addMessage]);

    const handleUserJoined = useCallback((user) => {
        setUserList(prev =>
            prev.some(u => String(u.id) === String(user.id))
                ? prev
                : [...prev, { id: user.id, name: user.name }]
        );
    }, []);

    const handleUserLeft = useCallback((leftId) => {
        setUserList(prev => prev.filter(u => String(u.id) !== String(leftId)));
    }, []);

    const handleGoalLoaded = useCallback((goal, showModal) => {
        if (goal) setCurrentGoal(goal);
        if (showModal) setShowGoalModal(true);
    }, []);

    const {
        remoteStreams,
        videoQuality,
        micOn, cameraOn, screenShareOn,
        toggleMic, toggleCamera, toggleScreenShare,
    } = useWebRTC(id, socketRef, localVideoRef, {
        onJoin:          setJoinTime,
        onUserResolved:  setUserId,
        onGroupLoaded:   setGroup,
        onUserListUpdate: setUserList,
        onUserJoined:    handleUserJoined,
        onUserLeft:      handleUserLeft,
        onGoalLoaded:    handleGoalLoaded,
        onMessagesLoaded: loadMessages,
        onMessage:       handleMessage,
    });

    const isFocusMode = timerActive && timerMode === 'focus';

    // ── Media controls ─────────────────────────────────────────────────────────

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
