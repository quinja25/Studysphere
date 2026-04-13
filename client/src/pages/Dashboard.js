import React, { useState, useEffect } from 'react';
import { NavBar } from '../components/NavBar';
import './Dashboard.css';
import { SlPencil, SlCheck, SlClose, SlPlus, SlFire, SlBadge, SlGraduation, SlBookOpen, SlClock, SlGraph, SlTarget, SlDoc } from "react-icons/sl";
import { FaLinkedin, FaGithub, FaGlobe } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import api from '../api';

export const Dashboard = () => {
    const [groups, setGroups] = useState([]);
    const [userData, setUserData] = useState({ name: '', email: '', picture: '' });
    const [userId, setUserId] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editFormData, setEditFormData] = useState({});
    const [newSubject, setNewSubject] = useState("");
    const [activeTab, setActiveTab] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        return params.get('tab') || 'profile';
    });
    const [recaps, setRecaps] = useState([]);
    const [recapsLoading, setRecapsLoading] = useState(false);
    const [editingGoal, setEditingGoal] = useState(false);
    const [goalInput, setGoalInput] = useState(120);
    const [endorsementCount, setEndorsementCount] = useState(0);
    const [postCount, setPostCount] = useState(0);
    const [verifyMsg, setVerifyMsg] = useState('');
    const [photoUploading, setPhotoUploading] = useState(false);

    const isAlumni = userData.role === 'alumni';
    const isStudent = userData.role === 'student';

    const [ibSubjects, setIbSubjects] = useState([]);

    const navigate = useNavigate();

    useEffect(() => {
        const storedUserData = localStorage.getItem('userData');
        if (storedUserData) {
            const user = JSON.parse(storedUserData);
            setUserData(user);
            fetchUserId(user.email);
        }
    }, []);

    const fetchUserId = (email) => {
        if (email) {
            api.get(`/users/byEmail/${email}`)
                .then((res) => {
                    setUserId(res.data.id);
                    setUserData(prev => ({ ...prev, ...res.data }));
                    setEditFormData(res.data);
                    setGoalInput(res.data.weeklyGoalMinutes || 120);
                })
                .catch(error => console.error('Error fetching userId:', error));
        }
    };

    useEffect(() => {
        if (!userId) return;
        const isAlumniRole = userData.role === 'alumni';

        setRecapsLoading(true);
        Promise.all([
            api.get(`/groupsUsers/byUser/${userId}`).catch(() => null),
            api.get(`/recaps/byUser/${userId}`).catch(() => null),
            isAlumniRole ? api.get(`/endorsements/count/${userId}`).catch(() => null) : null,
            isAlumniRole ? api.get(`/posts/byAuthor/${userId}`).catch(() => null) : null,
        ]).then(([groupsRes, recapsRes, endorsementsRes, postsRes]) => {
            if (groupsRes) setGroups((groupsRes.data || []).filter(g => !g.groupName?.startsWith('__dm_')));
            if (recapsRes) setRecaps(recapsRes.data.data || []);
            if (endorsementsRes) setEndorsementCount(endorsementsRes.data.count);
            if (postsRes) setPostCount(Array.isArray(postsRes.data) ? postsRes.data.length : 0);
        }).finally(() => setRecapsLoading(false));
    }, [userId, userData.role]);

    const handleEditChange = (e) => {
        const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        setEditFormData({ ...editFormData, [e.target.name]: value });
    };

    // Parse "Physics (HL)" → { name: "Physics", level: "HL" }
    const parseSubject = (str) => {
        const m = str.match(/^(.+?)\s*\((SL|HL)\)$/);
        return m ? { name: m[1], level: m[2] } : { name: str, level: null };
    };

    const handleRemoveSubject = (subjectToRemove) => {
        const currentSubjects = editFormData.subject ? editFormData.subject.split(',').map(s => s.trim()).filter(s => s) : [];
        setEditFormData({ ...editFormData, subject: currentSubjects.filter(s => s !== subjectToRemove).join(', ') });
    };

    const addSubjectWithLevel = (subjectName, level) => {
        setEditFormData(prev => {
            const current = prev.subject ? prev.subject.split(',').map(s => s.trim()).filter(s => s) : [];
            // Prevent duplicate base subject name
            if (current.some(s => parseSubject(s).name === subjectName)) return prev;
            const entry = `${subjectName} (${level})`;
            return { ...prev, subject: [...current, entry].join(', ') };
        });
        setNewSubject('');
    };

    const handleSaveProfile = async () => {
        try {
            const updated = await api.put(`/users/${userId}`, editFormData);
            const newData = { ...userData, ...updated.data };
            setUserData(newData);
            setEditFormData(newData);   // sync form with server response
            setNewSubject("");          // discard any pending subject selection
            localStorage.setItem('userData', JSON.stringify({ ...JSON.parse(localStorage.getItem('userData')), ...newData }));
            setIsEditing(false);
        } catch (error) {
            console.error("Error updating profile:", error);
        }
    };

    const handleCancelEdit = () => {
        setEditFormData(userData);
        setNewSubject("");  // discard pending subject selection on cancel too
        setIsEditing(false);
    };

    const toggleVisibility = async () => {
        try {
            const newVisibility = !userData.isPublic;
            await api.put(`/users/${userId}`, { isPublic: newVisibility });
            setUserData(prev => ({ ...prev, isPublic: newVisibility }));
            setEditFormData(prev => ({ ...prev, isPublic: newVisibility }));
        } catch (error) {
            console.error("Error updating visibility:", error);
        }
    };

    const handleSaveGoal = async () => {
        try {
            await api.put('/streaks/goal', { weeklyGoalMinutes: parseInt(goalInput) });
            setUserData(prev => ({ ...prev, weeklyGoalMinutes: parseInt(goalInput) }));
            setEditingGoal(false);
        } catch (error) {
            console.error("Error updating goal:", error);
        }
    };

    // Fetch IB subjects from DB when editing starts (once)
    useEffect(() => {
        if (!isEditing || ibSubjects.length > 0) return;
        api.get('/subjects').then(r => setIbSubjects(r.data)).catch(() => {});
    }, [isEditing, ibSubjects.length]);

    const handlePhotoUpload = async (file) => {
        setPhotoUploading(true);
        const formData = new FormData();
        formData.append('picture', file);
        try {
            const { data } = await api.post('/users/upload-picture', formData);
            setUserData(prev => ({ ...prev, picture: data.picture }));
            setEditFormData(prev => ({ ...prev, picture: data.picture }));
            localStorage.setItem('userData', JSON.stringify({
                ...JSON.parse(localStorage.getItem('userData') || '{}'),
                picture: data.picture,
            }));
        } catch (error) {
            console.error('Failed to upload photo:', error);
        } finally {
            setPhotoUploading(false);
        }
    };

    const handleResendVerification = async () => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!userData.email || !emailRegex.test(userData.email)) {
            setVerifyMsg('Your account has an invalid email address.');
            return;
        }
        try {
            await api.post('/users/send-verification');
            setVerifyMsg('Verification email sent! Check your inbox.');
        } catch (err) {
            setVerifyMsg(err.response?.data?.error || 'Failed to send email.');
        }
    };

    const weeklyProgress = Math.min(((userData.weeklyStudiedMinutes || 0) / (userData.weeklyGoalMinutes || 120)) * 100, 100);

    const getStreakColor = (streak) => {
        if (!streak || streak === 0) return '#aaa';
        if (streak < 7) return '#ff9800';
        if (streak < 14) return '#f44336';
        if (streak < 30) return '#9c27b0';
        return '#ffc107';
    };

    const formatMinutes = (mins) => {
        if (!mins) return '0m';
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };

    return (
        <div className="dash-page">
            <NavBar />
            <div className="dash-container">
                {/* ── Profile Header Card (Hubstaff-style) ── */}
                <div className={`dash-profile-card ${isAlumni ? 'dash-alumni-card' : 'dash-student-card'}`}>
                    <div className="dash-profile-top">
                        <div className="dash-avatar">
                            {userData.picture
                                ? <img src={userData.picture} alt={userData.name} className={isAlumni ? 'alumni-border' : ''} />
                                : <div className={`dash-avatar-initials ${isAlumni ? 'alumni-avatar' : ''}`}>{userData.name?.charAt(0)?.toUpperCase() || '?'}</div>
                            }
                            {isEditing && (
                                <label className="dash-avatar-upload-btn" title="Change photo">
                                    {photoUploading ? '…' : '📷'}
                                    <input
                                        type="file"
                                        accept="image/jpeg,image/png,image/gif,image/webp"
                                        hidden
                                        disabled={photoUploading}
                                        onChange={e => e.target.files[0] && handlePhotoUpload(e.target.files[0])}
                                    />
                                </label>
                            )}
                        </div>
                        <div className="dash-profile-info">
                            <div className="dash-name-row">
                                <h1>{userData.name}</h1>
                                <span className={`dash-role-badge ${userData.role}`}>
                                    {isStudent ? 'Student' : 'Alumni'}
                                </span>
                                {isAlumni && userData.isVerified && <span className="dash-verified-badge">Verified</span>}
                                {userData.isPublic && <span className="dash-visibility-badge">Public</span>}
                            </div>
                            <p className="dash-email">{userData.email}</p>
                            {userData.bio && <p className="dash-bio">{userData.bio}</p>}
                            <div className="dash-meta-row">
                                {userData.university && <span className="dash-meta-item"><SlGraduation /> {userData.university}</span>}
                                {userData.major && <span className="dash-meta-item"><SlBookOpen /> {userData.major}</span>}
                                {isStudent && userData.gradeLevel && <span className="dash-meta-item"><SlBadge /> {userData.gradeLevel}</span>}
                                {isStudent && userData.curriculum && <span className="dash-meta-item">{userData.curriculum}</span>}
                                {isStudent && userData.targetUniversity && <span className="dash-meta-item"><SlTarget /> Target: {userData.targetUniversity}</span>}
                                {isAlumni && userData.openHours && <span className="dash-meta-item"><SlClock /> Available: {userData.openHours}</span>}
                            </div>
                            <div className="dash-social-row">
                                {userData.linkedinUrl && <a href={userData.linkedinUrl} target="_blank" rel="noopener noreferrer" className="dash-social-link dash-social-linkedin" title="LinkedIn"><FaLinkedin /></a>}
                                {userData.githubUrl && <a href={userData.githubUrl} target="_blank" rel="noopener noreferrer" className="dash-social-link dash-social-github" title="GitHub"><FaGithub /></a>}
                                {userData.website && <a href={userData.website} target="_blank" rel="noopener noreferrer" className="dash-social-link dash-social-website" title="Website"><FaGlobe /></a>}
                            </div>
                            <div className="dash-actions-row">
                                {!isEditing ? (
                                    <button className="dash-btn dash-btn-outline" onClick={() => setIsEditing(true)}><SlPencil /> Edit Profile</button>
                                ) : (
                                    <>
                                        <button className="dash-btn dash-btn-primary" onClick={handleSaveProfile}><SlCheck /> Save</button>
                                        <button className="dash-btn dash-btn-outline" onClick={handleCancelEdit}><SlClose /> Cancel</button>
                                    </>
                                )}
                                <button
                                    className={`dash-btn ${userData.isPublic ? 'dash-btn-green' : 'dash-btn-red'}`}
                                    onClick={toggleVisibility}
                                >
                                    {userData.isPublic ? 'Public' : 'Private'}
                                </button>
                                {isAlumni && (
                                    <button className="dash-btn dash-btn-outline" onClick={() => navigate(`/alumni/${userId}`)}>
                                        View Public Profile
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="dash-stats-sidebar">
                            <div className="dash-stat-box">
                                <span className="dash-stat-value">Lvl {userData.level || 1}</span>
                                <span className="dash-stat-label">Level</span>
                            </div>
                            {isStudent && (
                                <>
                                    <div className="dash-stat-box">
                                        <span className="dash-stat-value">{userData.xp || 0}</span>
                                        <span className="dash-stat-label">XP</span>
                                    </div>
                                    <div className="dash-stat-box streak-stat" style={{ borderColor: getStreakColor(userData.currentStreak) }}>
                                        <span className="dash-stat-value" style={{ color: getStreakColor(userData.currentStreak) }}>
                                            {userData.currentStreak || 0}
                                        </span>
                                        <span className="dash-stat-label">Day Streak</span>
                                    </div>
                                    <div className="dash-stat-box">
                                        <span className="dash-stat-value">{userData.totalSessions || 0}</span>
                                        <span className="dash-stat-label">Sessions</span>
                                    </div>
                                </>
                            )}
                            {isAlumni && (
                                <>
                                    <div className="dash-stat-box alumni-stat">
                                        <span className="dash-stat-value">{endorsementCount}</span>
                                        <span className="dash-stat-label">Students Helped</span>
                                    </div>
                                    <div className="dash-stat-box alumni-stat">
                                        <span className="dash-stat-value">{postCount}</span>
                                        <span className="dash-stat-label">Posts</span>
                                    </div>
                                    <div className="dash-stat-box">
                                        <span className="dash-stat-value">{userData.totalSessions || 0}</span>
                                        <span className="dash-stat-label">Sessions</span>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Email verification banner */}
                    {userData && userData.isVerified === false && (
                        <div className="verify-banner">
                            <span>Your email is not verified.</span>
                            <button onClick={handleResendVerification} className="resend-verify-btn">
                                Resend verification email
                            </button>
                            {verifyMsg && <span className="verify-msg">{verifyMsg}</span>}
                        </div>
                    )}

                    {/* XP Progress Bar */}
                    <div className="dash-xp-bar-section">
                        <div className="dash-xp-info">
                            <span>Level {userData.level || 1}</span>
                            <span>{userData.xp || 0} / {(userData.level || 1) * 100} XP</span>
                            <span>Level {(userData.level || 1) + 1}</span>
                        </div>
                        <div className="dash-xp-bar">
                            <div className="dash-xp-fill" style={{ width: `${Math.min(((userData.xp || 0) / ((userData.level || 1) * 100)) * 100, 100)}%` }}></div>
                        </div>
                    </div>
                </div>

                {/* ── Tab Navigation ── */}
                <div className="dash-tabs">
                    <button className={`dash-tab ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>Profile</button>
                    <button className={`dash-tab ${activeTab === 'stats' ? 'active' : ''}`} onClick={() => setActiveTab('stats')}>
                        {isAlumni ? 'Mentoring Stats' : 'Study Stats'}
                    </button>
                    <button className={`dash-tab ${activeTab === 'groups' ? 'active' : ''}`} onClick={() => setActiveTab('groups')}>
                        {isAlumni ? 'My Rooms' : 'My Groups'}
                    </button>
                    <button className={`dash-tab ${activeTab === 'recaps' ? 'active' : ''}`} onClick={() => setActiveTab('recaps')}>
                        Session Recaps
                    </button>
                </div>

                {/* ── Tab Content ── */}
                <div className="dash-tab-content">
                    {activeTab === 'profile' && (
                        <div className="dash-profile-body">
                            <div className="dash-section-row">
                                {/* Left: Profile Details */}
                                <div className="dash-card dash-card-wide">
                                    <h3>About</h3>
                                    {isEditing ? (
                                        <div className="dash-edit-grid">
                                            <div className="dash-edit-field">
                                                <label>Name</label>
                                                <input type="text" name="name" value={editFormData.name || ''} onChange={handleEditChange} />
                                            </div>
                                            <div className="dash-edit-field">
                                                <label>University</label>
                                                <input type="text" name="university" value={editFormData.university || ''} onChange={handleEditChange} placeholder="Your university" />
                                            </div>
                                            <div className="dash-edit-field">
                                                <label>Major</label>
                                                <input type="text" name="major" value={editFormData.major || ''} onChange={handleEditChange} placeholder="Your major" />
                                            </div>
                                            <div className="dash-edit-field">
                                                <label>Curriculum</label>
                                                <input type="text" name="curriculum" value={editFormData.curriculum || ''} onChange={handleEditChange} placeholder="e.g. IB, AP, A-Levels" />
                                            </div>
                                            {userData.role === 'student' && (
                                                <div className="dash-edit-field">
                                                    <label>Target University</label>
                                                    <input type="text" name="targetUniversity" value={editFormData.targetUniversity || ''} onChange={handleEditChange} placeholder="e.g. MIT, Stanford" />
                                                </div>
                                            )}
                                            {userData.role === 'alumni' && (
                                                <div className="dash-edit-field">
                                                    <label>Open Hours</label>
                                                    <input type="text" name="openHours" value={editFormData.openHours || ''} onChange={handleEditChange} placeholder="e.g. Mon-Fri 5pm-7pm" />
                                                </div>
                                            )}
                                            <div className="dash-edit-field dash-edit-field-full">
                                                <label>Bio</label>
                                                <textarea name="bio" value={editFormData.bio || ''} onChange={handleEditChange} placeholder="A short intro about yourself..." rows={3} />
                                            </div>
                                            <div className="dash-edit-field">
                                                <label><FaLinkedin style={{ marginRight: 4 }} />LinkedIn</label>
                                                <input type="url" name="linkedinUrl" value={editFormData.linkedinUrl || ''} onChange={handleEditChange} placeholder="https://linkedin.com/in/..." />
                                            </div>
                                            <div className="dash-edit-field">
                                                <label><FaGithub style={{ marginRight: 4 }} />GitHub</label>
                                                <input type="url" name="githubUrl" value={editFormData.githubUrl || ''} onChange={handleEditChange} placeholder="https://github.com/..." />
                                            </div>
                                            <div className="dash-edit-field">
                                                <label><FaGlobe style={{ marginRight: 4 }} />Website</label>
                                                <input type="url" name="website" value={editFormData.website || ''} onChange={handleEditChange} placeholder="https://..." />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="dash-info-grid">
                                            {userData.bio && (
                                                <div className="dash-info-item dash-info-bio">
                                                    <span className="dash-info-label">Bio</span>
                                                    <span className="dash-info-value">{userData.bio}</span>
                                                </div>
                                            )}
                                            <div className="dash-info-item">
                                                <span className="dash-info-label">University</span>
                                                <span className="dash-info-value">{userData.university || 'Not set'}</span>
                                            </div>
                                            <div className="dash-info-item">
                                                <span className="dash-info-label">Major</span>
                                                <span className="dash-info-value">{userData.major || 'Not set'}</span>
                                            </div>
                                            <div className="dash-info-item">
                                                <span className="dash-info-label">Curriculum</span>
                                                <span className="dash-info-value">{userData.curriculum || 'Not set'}</span>
                                            </div>
                                            {userData.role === 'student' && (
                                                <div className="dash-info-item">
                                                    <span className="dash-info-label">Target University</span>
                                                    <span className="dash-info-value">{userData.targetUniversity || 'Not set'}</span>
                                                </div>
                                            )}
                                            {userData.role === 'alumni' && (
                                                <div className="dash-info-item">
                                                    <span className="dash-info-label">Open Hours</span>
                                                    <span className="dash-info-value">{userData.openHours || 'Not set'}</span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Right: Subjects & Quick Actions */}
                                <div className="dash-card">
                                    <h3>{isAlumni ? 'Expertise' : 'Subjects'}</h3>
                                    <div className="dash-subjects-list">
                                        {(isEditing ? editFormData : userData).subject
                                            ? (isEditing ? editFormData : userData).subject.split(',').map(s => s.trim()).filter(s => s).map((sub, i) => {
                                                const { name, level } = parseSubject(sub);
                                                return (
                                                    <span key={i} className={`dash-subject-chip ${isAlumni ? 'alumni-chip' : ''}`}>
                                                        {name}
                                                        {level && <span className={`dash-level-badge ${level === 'HL' ? 'dash-level-hl' : 'dash-level-sl'}`}>{level}</span>}
                                                        {isEditing && <SlClose className="dash-chip-remove" onClick={() => handleRemoveSubject(sub)} />}
                                                    </span>
                                                );
                                            })
                                            : <p className="dash-empty">No {isAlumni ? 'expertise' : 'subjects'} added</p>
                                        }
                                    </div>
                                    {isEditing && (
                                        <div className="dash-subject-search-wrap">
                                            <input
                                                type="text"
                                                className="dash-subject-search"
                                                placeholder={`Search ${isAlumni ? 'expertise' : 'IB subjects'}…`}
                                                value={newSubject}
                                                onChange={e => setNewSubject(e.target.value)}
                                                autoComplete="off"
                                            />
                                            {newSubject.trim() && (() => {
                                                const q = newSubject.toLowerCase();
                                                const current = editFormData.subject
                                                    ? editFormData.subject.split(',').map(s => s.trim()).filter(s => s)
                                                    : [];
                                                const selectedNames = new Set(current.map(s => parseSubject(s).name));
                                                const available = ibSubjects.filter(s =>
                                                    s.subjectName.toLowerCase().includes(q) && !selectedNames.has(s.subjectName)
                                                );
                                                if (!available.length) return null;
                                                return (
                                                    <div className="dash-subject-dropdown">
                                                        {available.map(s => (
                                                            <div key={s.id} className="dash-subject-option">
                                                                <div className="dash-subject-option-info">
                                                                    <span className="dash-subject-option-group">{s.groupName}</span>
                                                                    <span className="dash-subject-option-name">{s.subjectName}</span>
                                                                </div>
                                                                <div className="dash-subject-level-btns">
                                                                    {(s.hasSL !== false) && (
                                                                        <button className="dash-level-btn dash-level-sl"
                                                                            onMouseDown={e => { e.preventDefault(); addSubjectWithLevel(s.subjectName, 'SL'); }}>
                                                                            SL
                                                                        </button>
                                                                    )}
                                                                    {(s.hasHL !== false) && (
                                                                        <button className="dash-level-btn dash-level-hl"
                                                                            onMouseDown={e => { e.preventDefault(); addSubjectWithLevel(s.subjectName, 'HL'); }}>
                                                                            HL
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    )}

                                    {/* Quick Actions — role-specific */}
                                    <div className="dash-quick-actions">
                                        {isStudent && (
                                            <>
                                                <button className="dash-btn dash-btn-primary" onClick={() => navigate('/search-alumni')}>
                                                    Find Peers & Mentors
                                                </button>
                                                <button className="dash-btn dash-btn-outline" onClick={() => navigate('/marketplace')}>
                                                    Marketplace
                                                </button>
                                            </>
                                        )}
                                        {isAlumni && (
                                            <>
                                                <button className="dash-btn dash-btn-alumni" onClick={() => navigate('/wiki')}>
                                                    Knowledge Wiki
                                                </button>
                                                <button className="dash-btn dash-btn-alumni" onClick={() => navigate('/qa')}>
                                                    Q&A Board
                                                </button>
                                                <button className="dash-btn dash-btn-outline" onClick={() => navigate('/search-alumni')}>
                                                    Find Students
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'stats' && (
                        <div className="dash-stats-body">
                            <div className="dash-section-row">
                                {/* Streak Card */}
                                <div className="dash-card dash-streak-card">
                                    <div className="dash-streak-header">
                                        <SlFire className="dash-streak-icon" style={{ color: getStreakColor(userData.currentStreak) }} />
                                        <div>
                                            <h3 className="dash-streak-count" style={{ color: getStreakColor(userData.currentStreak) }}>
                                                {userData.currentStreak || 0} Day {isAlumni ? 'Mentoring' : 'Study'} Streak
                                            </h3>
                                            <p className="dash-streak-sub">Longest: {userData.longestStreak || 0} days</p>
                                        </div>
                                    </div>
                                    <div className="dash-streak-details">
                                        <div className="dash-streak-detail">
                                            <SlClock />
                                            <span>{formatMinutes(userData.totalStudyMinutes)} total {isAlumni ? 'mentoring' : 'study'} time</span>
                                        </div>
                                        <div className="dash-streak-detail">
                                            <SlGraph />
                                            <span>{userData.totalSessions || 0} sessions {isAlumni ? 'hosted' : 'completed'}</span>
                                        </div>
                                        {isAlumni && (
                                            <div className="dash-streak-detail">
                                                <SlGraduation />
                                                <span>{endorsementCount} students helped</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Weekly Goal Card */}
                                <div className="dash-card dash-goal-card">
                                    <div className="dash-goal-header">
                                        <h3><SlTarget /> Weekly {isAlumni ? 'Mentoring' : 'Study'} Goal</h3>
                                        {!editingGoal ? (
                                            <button className="dash-btn-icon" onClick={() => setEditingGoal(true)}><SlPencil /></button>
                                        ) : (
                                            <div className="dash-goal-edit">
                                                <input type="number" value={goalInput} onChange={(e) => setGoalInput(e.target.value)} min="10" max="1000" />
                                                <span>min</span>
                                                <button className="dash-btn dash-btn-sm" onClick={handleSaveGoal}><SlCheck /></button>
                                                <button className="dash-btn dash-btn-sm dash-btn-outline" onClick={() => setEditingGoal(false)}><SlClose /></button>
                                            </div>
                                        )}
                                    </div>
                                    <div className="dash-goal-progress-container">
                                        <svg className="dash-goal-ring" viewBox="0 0 120 120">
                                            <circle cx="60" cy="60" r="52" fill="none" stroke="#e8e8e8" strokeWidth="10" />
                                            <circle cx="60" cy="60" r="52" fill="none" stroke={isAlumni ? '#2e7d32' : '#4a90e2'} strokeWidth="10"
                                                strokeDasharray={`${weeklyProgress * 3.267} ${326.7 - weeklyProgress * 3.267}`}
                                                strokeDashoffset="81.675"
                                                strokeLinecap="round"
                                                style={{ transition: 'stroke-dasharray 0.5s ease' }}
                                            />
                                        </svg>
                                        <div className="dash-goal-text">
                                            <span className="dash-goal-current" style={isAlumni ? { color: '#2e7d32' } : {}}>{formatMinutes(userData.weeklyStudiedMinutes)}</span>
                                            <span className="dash-goal-total">/ {formatMinutes(userData.weeklyGoalMinutes || 120)}</span>
                                        </div>
                                    </div>
                                    <p className="dash-goal-percent">{Math.round(weeklyProgress)}% complete</p>
                                </div>
                            </div>

                            {/* Stats Grid — role-specific */}
                            <div className="dash-stats-grid">
                                <div className="dash-mini-stat">
                                    <span className="dash-mini-value">{userData.level || 1}</span>
                                    <span className="dash-mini-label">Level</span>
                                </div>
                                <div className="dash-mini-stat">
                                    <span className="dash-mini-value">{userData.xp || 0}</span>
                                    <span className="dash-mini-label">Current XP</span>
                                </div>
                                <div className="dash-mini-stat">
                                    <span className="dash-mini-value">{formatMinutes(userData.totalStudyMinutes)}</span>
                                    <span className="dash-mini-label">{isAlumni ? 'Mentoring Time' : 'Study Time'}</span>
                                </div>
                                <div className="dash-mini-stat">
                                    <span className="dash-mini-value">{userData.totalSessions || 0}</span>
                                    <span className="dash-mini-label">{isAlumni ? 'Sessions Hosted' : 'Total Sessions'}</span>
                                </div>
                                {isStudent && (
                                    <>
                                        <div className="dash-mini-stat">
                                            <span className="dash-mini-value">{userData.currentStreak || 0}</span>
                                            <span className="dash-mini-label">Current Streak</span>
                                        </div>
                                        <div className="dash-mini-stat">
                                            <span className="dash-mini-value">{userData.longestStreak || 0}</span>
                                            <span className="dash-mini-label">Longest Streak</span>
                                        </div>
                                    </>
                                )}
                                {isAlumni && (
                                    <>
                                        <div className="dash-mini-stat">
                                            <span className="dash-mini-value">{endorsementCount}</span>
                                            <span className="dash-mini-label">Endorsements</span>
                                        </div>
                                        <div className="dash-mini-stat">
                                            <span className="dash-mini-value">{postCount}</span>
                                            <span className="dash-mini-label">Posts Written</span>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'groups' && (
                        <div className="dash-groups-body">
                            <div className="dash-groups-header">
                                <button className="dash-btn dash-btn-primary" onClick={() => navigate('/find-group')}>
                                    <SlPlus /> Find Rooms
                                </button>
                                <button className="dash-btn dash-btn-outline" onClick={() => navigate('/create-group')}>
                                    Create Room
                                </button>
                            </div>
                            {groups.length > 0 ? (
                                <div className="dash-groups-grid">
                                    {groups.map((group) => (
                                        <div key={group.id} className="dash-group-card" onClick={() => navigate(`/group/${group.id}`)}>
                                            <div className="dash-group-card-top">
                                                <h3>{group.groupName}</h3>
                                                {String(group.leader) === String(userId) && <span className="dash-host-badge">Host</span>}
                                            </div>
                                            <div className="dash-group-card-info">
                                                {group.subject && <span>{group.subject}</span>}
                                                {group.major && <span>{group.major}</span>}
                                                {group.gradeLevel && <span>{group.gradeLevel}</span>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="dash-empty-groups">
                                    <p>You haven't joined any study rooms yet.</p>
                                    <p>Create one or find an existing one to get started!</p>
                                </div>
                            )}
                        </div>
                    )}
                    {activeTab === 'recaps' && (
                        <div className="dash-recaps-body">
                            {recapsLoading ? (
                                <div className="dash-recaps-loading">
                                    <div className="dash-recaps-spinner" />
                                    <span>Loading recaps...</span>
                                </div>
                            ) : recaps.length === 0 ? (
                                <div className="dash-empty-groups">
                                    <p>No session recaps yet.</p>
                                    <p>Recaps are generated automatically when you leave a study room.</p>
                                </div>
                            ) : (
                                <div className="dash-recaps-list">
                                    {recaps.map(recap => (
                                        <div key={recap.id} className="dash-recap-card">
                                            <div className="dash-recap-header">
                                                <div>
                                                    <h3>{recap.group?.groupName || 'Study Session'}</h3>
                                                    <span className="dash-recap-meta">
                                                        {new Date(recap.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                        {recap.durationMinutes > 0 && ` · ${formatMinutes(recap.durationMinutes)}`}
                                                        {recap.group?.subject && ` · ${recap.group.subject}`}
                                                    </span>
                                                </div>
                                                <SlDoc className="dash-recap-icon" />
                                            </div>
                                            <p className="dash-recap-summary">{recap.summary}</p>
                                            {Array.isArray(recap.topicsCovered) && recap.topicsCovered.length > 0 && (
                                                <div className="dash-recap-topics">
                                                    {recap.topicsCovered.map((topic, i) => (
                                                        <span key={i} className="dash-recap-chip">{topic}</span>
                                                    ))}
                                                </div>
                                            )}
                                            {Array.isArray(recap.actionItems) && recap.actionItems.length > 0 && (
                                                <div className="dash-recap-actions-section">
                                                    <p className="dash-recap-actions-label">Action Items</p>
                                                    <ul>
                                                        {recap.actionItems.map((item, i) => (
                                                            <li key={i}>{item}</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
