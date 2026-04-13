import React, { useState, useEffect } from 'react';
import { NavBar } from '../components/NavBar';
import api from '../api';
import './SearchAlumni.css';
import { SlMagnifier, SlBubble, SlFire, SlUser } from "react-icons/sl";
import { useNavigate, useLocation } from 'react-router-dom';

export const SearchAlumni = () => {
    const [users, setUsers] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [filteredUsers, setFilteredUsers] = useState([]);
    const [filterOption, setFilterOption] = useState('all');
    const navigate = useNavigate();
    const location = useLocation();
    const currentUser = location.state?.currentUser;

    useEffect(() => {
        // Fetch all users
        api.get('/users/public')
            .then(res => {
                setUsers(res.data);
                setFilteredUsers(res.data);
            })
            .catch(err => {
                console.error("Error fetching users:", err);
                setUsers([]);
                setFilteredUsers([]);
            });
    }, []);

    const parseSubject = (str) => {
        const m = str.match(/^(.+?)\s*\((SL|HL)\)$/);
        return m ? { name: m[1].trim(), level: m[2] } : { name: str.trim(), level: null };
    };

    useEffect(() => {
        const lowerTerm = searchTerm.toLowerCase();
        let results = users;

        if (searchTerm) {
            results = results.filter(user =>
                (user.name && user.name.toLowerCase().includes(lowerTerm)) ||
                (user.subject && user.subject.toLowerCase().includes(lowerTerm)) ||
                (user.targetUniversity && user.targetUniversity.toLowerCase().includes(lowerTerm))
            );
        }

        if (filterOption !== 'all') {
            if (filterOption === 'peers-subject' && currentUser) {
                const mySubjectNames = currentUser.subject
                    ? currentUser.subject.split(',').map(s => parseSubject(s).name.toLowerCase()).filter(s => s)
                    : [];
                results = results.filter(user => {
                    if (user.role !== 'student' || user.id === currentUser.id) return false;
                    if (!user.subject) return false;
                    const userSubjectNames = user.subject.split(',').map(s => parseSubject(s).name.toLowerCase());
                    return mySubjectNames.some(s => userSubjectNames.includes(s));
                });
            } else if (filterOption === 'peers-uni' && currentUser) {
                results = results.filter(user => 
                    user.role === 'student' && 
                    user.id !== currentUser.id &&
                    user.targetUniversity && currentUser.targetUniversity &&
                    user.targetUniversity.toLowerCase() === currentUser.targetUniversity.toLowerCase()
                );
            } else if (filterOption === 'alumni-uni' && currentUser) {
                results = results.filter(user => 
                    user.role === 'alumni' && 
                    user.targetUniversity && currentUser.targetUniversity &&
                    user.targetUniversity.toLowerCase() === currentUser.targetUniversity.toLowerCase()
                );
            } else if (filterOption === 'alumni') {
                results = results.filter(user => user.role === 'alumni');
            } else if (filterOption === 'student') {
                results = results.filter(user => user.role === 'student');
            }
        }
        setFilteredUsers(results);
    }, [searchTerm, users, filterOption, currentUser]);

    const handleMessage = async (targetUser) => {
        try {
            const raw = localStorage.getItem('userData');
            if (!raw) return;
            const me = JSON.parse(raw);

            const meRes = await api.get(`/users/byEmail/${me.email}`);
            const myId = meRes.data.id;

            // Deterministic DM group name so the same pair always reuses one group
            const a = Math.min(myId, targetUser.id);
            const b = Math.max(myId, targetUser.id);
            const dmName = `__dm_${a}_${b}`;

            // Check if DM group already exists in my groups
            const groupsRes = await api.get(`/groupsUsers/byUser/${myId}`);
            const existing = Array.isArray(groupsRes.data)
                ? groupsRes.data.find(g => g.groupName === dmName)
                : null;

            if (existing) {
                navigate('/chat', { state: { openGroup: existing, dmPartnerName: targetUser.name } });
            } else {
                // Create new private DM group
                const groupRes = await api.post('/groups', {
                    groupName: dmName,
                    isPublic: false,
                    maxParticipants: 2,
                    leader: me.name,
                });
                const group = groupRes.data;
                await api.post(`/groupsUsers/user/${myId}/group/${group.id}`);
                await api.post(`/groupsUsers/user/${targetUser.id}/group/${group.id}`);
                navigate('/chat', { state: { openGroup: group, dmPartnerName: targetUser.name } });
            }
        } catch (err) {
            console.error('Failed to open chat:', err);
            alert('Could not open chat. Please try again.');
        }
    };

    return (
        <div className="search-alumni-page">
            <NavBar />
            <div className="search-container">
                <div className="search-header">
                    <h1>Find Peers & Mentors</h1>
                    <div className="search-bar">
                        <SlMagnifier className="search-icon" />
                        <input
                            type="text"
                            placeholder="Search by name, subject, or university..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="filter-options" style={{ marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button onClick={() => setFilterOption('all')} className={`filter-btn ${filterOption === 'all' ? 'active' : ''}`} style={{ padding: '8px 16px', borderRadius: '20px', border: '1px solid #ddd', background: filterOption === 'all' ? '#4a90e2' : 'white', color: filterOption === 'all' ? 'white' : '#333', cursor: 'pointer' }}>All</button>
                        {currentUser && (
                            <>
                                <button onClick={() => setFilterOption('peers-subject')} className={`filter-btn ${filterOption === 'peers-subject' ? 'active' : ''}`} style={{ padding: '8px 16px', borderRadius: '20px', border: '1px solid #ddd', background: filterOption === 'peers-subject' ? '#4a90e2' : 'white', color: filterOption === 'peers-subject' ? 'white' : '#333', cursor: 'pointer' }}>Peers (Same Subject)</button>
                                <button onClick={() => setFilterOption('peers-uni')} className={`filter-btn ${filterOption === 'peers-uni' ? 'active' : ''}`} style={{ padding: '8px 16px', borderRadius: '20px', border: '1px solid #ddd', background: filterOption === 'peers-uni' ? '#4a90e2' : 'white', color: filterOption === 'peers-uni' ? 'white' : '#333', cursor: 'pointer' }}>Peers (Same Uni)</button>
                                <button onClick={() => setFilterOption('alumni-uni')} className={`filter-btn ${filterOption === 'alumni-uni' ? 'active' : ''}`} style={{ padding: '8px 16px', borderRadius: '20px', border: '1px solid #ddd', background: filterOption === 'alumni-uni' ? '#4a90e2' : 'white', color: filterOption === 'alumni-uni' ? 'white' : '#333', cursor: 'pointer' }}>Alumni (Target Uni)</button>
                            </>
                        )}
                        <button onClick={() => setFilterOption('student')} className={`filter-btn ${filterOption === 'student' ? 'active' : ''}`} style={{ padding: '8px 16px', borderRadius: '20px', border: '1px solid #ddd', background: filterOption === 'student' ? '#4a90e2' : 'white', color: filterOption === 'student' ? 'white' : '#333', cursor: 'pointer' }}>All Students</button>
                        <button onClick={() => setFilterOption('alumni')} className={`filter-btn ${filterOption === 'alumni' ? 'active' : ''}`} style={{ padding: '8px 16px', borderRadius: '20px', border: '1px solid #ddd', background: filterOption === 'alumni' ? '#4a90e2' : 'white', color: filterOption === 'alumni' ? 'white' : '#333', cursor: 'pointer' }}>All Alumni</button>
                    </div>
                </div>

                <div className="alumni-grid">
                    {filteredUsers.map(user => (
                        <div key={user.id} className={`alumni-card ${user.role === 'alumni' ? 'alumni-card-green' : 'alumni-card-blue'}`}>
                            <div className="alumni-info">
                                <img src={user.picture || "https://via.placeholder.com/150"} alt={user.name} className="alumni-pic" />
                                <h3>{user.name}</h3>
                                <p className="alumni-uni">{user.targetUniversity}</p>
                                <div className="user-badges-row">
                                    <span className={`role-badge ${user.role === 'student' ? 'role-student' : 'role-alumni'}`}>
                                        {user.role === 'student' ? 'Student' : 'Alumni'}
                                    </span>
                                    {user.level > 1 && (
                                        <span className="level-badge">Lvl {user.level}</span>
                                    )}
                                    {user.role === 'student' && user.currentStreak > 0 && (
                                        <span className="streak-badge"><SlFire /> {user.currentStreak}</span>
                                    )}
                                </div>
                                <div className="alumni-subjects">
                                    {user.subject && user.subject.split(',').map((sub, i) => {
                                        const { name, level } = parseSubject(sub.trim());
                                        return (
                                            <span key={i} className="subject-tag">
                                                {name}
                                                {level && <span className={`subject-level-badge subject-level-${level.toLowerCase()}`}>{level}</span>}
                                            </span>
                                        );
                                    })}
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                                <button className="message-btn" style={{ flex: 1 }} onClick={() => handleMessage(user)}>
                                    <SlBubble /> &nbsp; Message
                                </button>
                                <button
                                    className="message-btn"
                                    style={{ flex: 1, background: user.role === 'alumni' ? '#e8f5e9' : '#e3f2fd', color: user.role === 'alumni' ? '#2e7d32' : '#1565c0' }}
                                    onClick={() => navigate(`/alumni/${user.id}`)}
                                >
                                    <SlUser /> &nbsp; View Profile
                                </button>
                            </div>
                        </div>
                    ))}
                    {filteredUsers.length === 0 && (
                        <div className="no-results">No users found matching your search.</div>
                    )}
                </div>
            </div>
        </div>
    );
};