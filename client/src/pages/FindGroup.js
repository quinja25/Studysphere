import React, { useState, useEffect, useMemo } from 'react';
import { NavBar } from '../components/NavBar';
import api from '../api';
import './FindGroup.css';
import { useNavigate } from 'react-router-dom';
import { SlMagnifier, SlLock, SlLockOpen, SlTrash } from "react-icons/sl";
import ConfirmModal from '../components/ConfirmModal';


export const FindGroup = () => {
    const [groupList, setGroupList] = useState([]);
    const [showFilters, setShowFilters] = useState(false);
    const [filterSubject, setFilterSubject] = useState('');
    const [filterPrivacy, setFilterPrivacy] = useState('all'); // 'all', 'public', 'private'

    // Password prompt state
    const [passwordPrompt, setPasswordPrompt] = useState(null); // { groupId }
    const [passwordInput, setPasswordInput] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [passwordChecking, setPasswordChecking] = useState(false);

    const [confirmState, setConfirmState] = useState({ open: false, title: '', message: '', onConfirm: null });
    const openConfirm = (title, message, onConfirm) =>
        setConfirmState({ open: true, title, message, onConfirm });
    const closeConfirm = () =>
        setConfirmState(s => ({ ...s, open: false }));

    const currentUser = (() => {
        try {
            const raw = localStorage.getItem('userData');
            return raw ? JSON.parse(raw) : null;
        } catch { return null; }
    })();

    let navigate = useNavigate();

    useEffect(() => {
        api.get('/groups')
            .then((res) => {
                if (Array.isArray(res.data)) {
                    // Deduplicate by ID (handling string/number mismatch) and sort by newest
                    const uniqueGroups = [...new Map(res.data.map(item => [String(item.id), item])).values()];
                    uniqueGroups.sort((a, b) => b.id - a.id);
                    setGroupList(uniqueGroups);
                }
            })
            .catch(err => console.error("Error fetching groups:", err));
    }, []);

    const filteredGroups = useMemo(() => {
        let result = groupList;

        if (filterSubject) {
            result = result.filter(group =>
                group.subject && group.subject.toLowerCase().includes(filterSubject.toLowerCase())
            );
        }

        if (filterPrivacy !== 'all') {
            const isPublic = filterPrivacy === 'public';
            result = result.filter(group => !!group.isPublic === isPublic);
        }

        return result;
    }, [groupList, filterSubject, filterPrivacy]);

    const handleDeleteGroup = (groupId) => {
        openConfirm('Delete Room', 'Are you sure you want to delete this study room?', () => {
            api.delete(`/groups/${groupId}`)
                .then(() => {
                    setGroupList(prev => prev.filter(g => g.id !== groupId));
                })
                .catch((error) => console.error('Error deleting group:', error));
        });
    };

    const handleGroupClick = (group) => {
        if (group.hasPassword) {
            setPasswordPrompt({ groupId: group.id });
            setPasswordInput('');
            setPasswordError('');
        } else {
            navigate(`/group/${group.id}`);
        }
    };

    const handlePasswordSubmit = async (e) => {
        e.preventDefault();
        if (!passwordPrompt) return;
        setPasswordChecking(true);
        setPasswordError('');
        try {
            await api.post(`/groups/${passwordPrompt.groupId}/verify-password`, { password: passwordInput });
            setPasswordPrompt(null);
            navigate(`/group/${passwordPrompt.groupId}`);
        } catch (err) {
            setPasswordError(err.response?.data?.error || 'Incorrect password');
        } finally {
            setPasswordChecking(false);
        }
    };

    return (
        <div className="find-group-page">
            <NavBar />
            <div className="find-group-container">
                <div className="find-group-header">
                    <h1 className='find-group-title'>Find Study Rooms</h1>
                    <button className="filter-toggle-btn" onClick={() => setShowFilters(!showFilters)}>
                        {showFilters ? 'Hide Filters' : 'Show Filters'}
                    </button>
                </div>

                {showFilters && (
                    <div className="filters-container">
                        <div className="filter-item">
                            <label>Subject:</label>
                            <div className="search-input-wrapper">
                                <SlMagnifier className="search-icon" />
                                <input
                                    type="text"
                                    placeholder="Search by subject..."
                                    value={filterSubject}
                                    onChange={(e) => setFilterSubject(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="filter-item">
                            <label>Privacy:</label>
                            <select value={filterPrivacy} onChange={(e) => setFilterPrivacy(e.target.value)}>
                                <option value="all">All Rooms</option>
                                <option value="public">Public Only</option>
                                <option value="private">Private Only</option>
                            </select>
                        </div>
                    </div>
                )}

                <div className="groupContainerWrapper">
                    {filteredGroups.length > 0 ? (
                        filteredGroups.map((group) => (
                            <div
                                className='groupContainer'
                                key={group.id}
                                onClick={() => handleGroupClick(group)}
                            >
                                <div className="group-header">
                                    <h3 className='groupName'>{group.groupName}</h3>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        {group.isPublic ? <SlLockOpen title="Public" /> : <SlLock title="Private" />}
                                        {currentUser && String(group.leader) === String(currentUser.name) && (
                                            <SlTrash
                                                className="delete-icon"
                                                onClick={(e) => { e.stopPropagation(); handleDeleteGroup(group.id); }}
                                                title="Delete Group"
                                                style={{ cursor: 'pointer', color: '#e74c3c' }}
                                            />
                                        )}
                                    </div>
                                </div>
                                <div className='infoContainer'>
                                    <p className='info'><strong>Major:</strong> {group.major}</p>
                                    <p className='info'><strong>Subject:</strong> {group.subject}</p>
                                    <p className='info'><strong>Grade:</strong> {group.gradeLevel}</p>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="no-groups-found">
                            <p>No study rooms found matching your criteria.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Password prompt modal */}
            {passwordPrompt && (
                <div className="modal-overlay" onClick={() => setPasswordPrompt(null)}>
                    <div className="modal-box" onClick={(e) => e.stopPropagation()}>
                        <h3><SlLock /> Private Room</h3>
                        <p>This room is password protected.</p>
                        <form onSubmit={handlePasswordSubmit}>
                            <input
                                type="password"
                                placeholder="Enter room password"
                                value={passwordInput}
                                onChange={(e) => setPasswordInput(e.target.value)}
                                autoFocus
                            />
                            {passwordError && <p className="modal-error">{passwordError}</p>}
                            <div className="modal-actions">
                                <button type="submit" disabled={passwordChecking}>
                                    {passwordChecking ? 'Checking...' : 'Join Room'}
                                </button>
                                <button type="button" onClick={() => setPasswordPrompt(null)}>Cancel</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
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
}
