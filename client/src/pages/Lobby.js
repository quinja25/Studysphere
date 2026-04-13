import React, { useState, useEffect } from 'react';
import { NavBar } from '../components/NavBar';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../api';
import { SlPlus, SlMagnifier, SlTrash } from "react-icons/sl";
import './Lobby.css';
import ConfirmModal from '../components/ConfirmModal';

export const Lobby = () => {
    const [groups, setGroups] = useState([]);
    const [userData, setUserData] = useState({ name: '', email: '', picture: '' });
    const [userId, setUserId] = useState(null);
    const navigate = useNavigate();
    const [contextMenu, setContextMenu] = useState(null);
    const location = useLocation();

    useEffect(() => {
        const storedUserData = localStorage.getItem('userData');
        if (storedUserData) {
            const user = JSON.parse(storedUserData);
            setUserData(user);
            fetchUserId(user.email);
        } else if (location.state) {
            const { name, email, picture } = location.state;
            setUserData({ name, email, picture });
            localStorage.setItem('userData', JSON.stringify({ name, email, picture }));
            fetchUserId(email);
        }
    }, [location.state]);

    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        window.addEventListener("click", handleClick);
        return () => window.removeEventListener("click", handleClick);
    }, []);

    const [streakData, setStreakData] = useState(null);

    const [confirmState, setConfirmState] = useState({ open: false, title: '', message: '', onConfirm: null });
    const openConfirm = (title, message, onConfirm) =>
        setConfirmState({ open: true, title, message, onConfirm });
    const closeConfirm = () =>
        setConfirmState(s => ({ ...s, open: false }));

    const fetchUserId = (email) => {
        if (email) {
            api.get(`/users/byEmail/${email}`)
                .then((res) => {
                    setUserId(res.data.id);
                    setStreakData({
                        currentStreak: res.data.currentStreak || 0,
                        lastStudyDate: res.data.lastStudyDate,
                    });
                })
                .catch(error => console.error('Error fetching userId:', error));
        }
    };

    useEffect(() => {
        if (userId) {
            api.get(`/groupsUsers/byUser/${userId}`)
                .then((res) => {
                    // If the response is an array, set it. If it's 404/error, it's caught below.
                    if (Array.isArray(res.data)) {
                        setGroups(res.data.filter(g => !g.groupName?.startsWith('__dm_')));
                    }
                })
                .catch(error => {
                    // If 404 (no groups found), just set empty array
                    if (error.response && error.response.status === 404) {
                        setGroups([]);
                    } else {
                        console.error('Error fetching groups:', error);
                    }
                });
        }
    }, [userId]);

    const handleRightClick = (e, group) => {
        e.preventDefault();
        if (String(group.leader) === String(userId)) {
            setContextMenu({
                x: e.clientX,
                y: e.clientY,
                groupId: group.id
            });
        }
    };

    const handleDeleteGroup = (groupId) => {
        openConfirm('Delete Room', 'Are you sure you want to delete this study room?', () => {
            api.delete(`/groups/${groupId}`)
                .then(() => {
                    setGroups(groups.filter((g) => g.id !== groupId));
                })
                .catch((error) => console.error('Error deleting group:', error));
        });
    };

    return (
        <div className="lobby-page">
            <NavBar />
            <div className="lobby-container">
                <div className="lobby-header">
                    <h1>Welcome, <span className="user-name">{userData.name}</span>!</h1>
                    <p className="subtitle">Ready to learn something new today?</p>
                </div>
                
                {streakData && streakData.currentStreak > 0 && streakData.lastStudyDate !== new Date().toLocaleDateString('en-CA') && (
                    <div className="streak-reminder-banner">
                        Study today to keep your <strong>{streakData.currentStreak}-day streak</strong> alive!
                    </div>
                )}

                <div className="action-buttons">
                    <button className="lobby-btn create-btn" onClick={() => navigate('/create-group')}>
                        <SlPlus className="btn-icon" /> Create Study Room
                    </button>
                    <button className="lobby-btn join-btn" onClick={() => navigate('/find-group')}>
                        <SlMagnifier className="btn-icon" /> Find Study Room
                    </button>
                </div>

                <div className="groups-section">
                    <h2>Your Study Rooms</h2>
                    {groups.length > 0 ? (
                        <div className="groups-grid">
                            {groups.map((group) => (
                                <div 
                                    key={group.id} 
                                    className="group-card"
                                    onClick={() => navigate(`/group/${group.id}`)}
                                    onContextMenu={(e) => handleRightClick(e, group)}
                                >
                                    <div className="group-card-header">
                                        <h3>{group.groupName}</h3>
                                        <div className="group-badges">
                                            {String(group.leader) === String(userId) && <span className="host-badge">Host</span>}
                                            <span className="grade-badge">{group.gradeLevel}</span>
                                        </div>
                                    </div>
                                    <div className="group-card-body">
                                        <p><strong>Subject:</strong> {group.subject}</p>
                                        <p><strong>Major:</strong> {group.major}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="no-groups-placeholder">
                            <p>You haven't joined any study rooms yet.</p>
                            <p>Create one or find an existing one to get started!</p>
                        </div>
                    )}
                </div>
                {contextMenu && (
                    <div
                        className="context-menu"
                        style={{ top: contextMenu.y, left: contextMenu.x }}
                    >
                        <div
                            className="context-menu-item delete"
                            onClick={() => handleDeleteGroup(contextMenu.groupId)}
                        >
                            <SlTrash /> Delete Room
                        </div>
                    </div>
                )}
            </div>
            <ConfirmModal
                isOpen={confirmState.open}
                title={confirmState.title}
                message={confirmState.message}
                onConfirm={() => { closeConfirm(); confirmState.onConfirm && confirmState.onConfirm(); }}
                onCancel={closeConfirm}
                danger
            />
        </div>
    );
};
