import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { NavBar } from '../components/NavBar';
import api from '../api';
import './Registration.css';

export const Registration = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        picture: '',
        username: '',
        major: '',
        role: 'student',
        subject: '',
        targetUniversity: '',
        curriculum: ''
    });
    const [ibSubjects, setIbSubjects] = useState([]);
    const [newSubject, setNewSubject] = useState('');
    const [showSubjectDropdown, setShowSubjectDropdown] = useState(false);

    useEffect(() => {
        if (location.state) {
            setFormData(prev => ({
                ...prev,
                name: location.state.name || '',
                email: location.state.email || '',
                picture: location.state.picture || ''
            }));
        }
    }, [location.state]);

    // Honour ?role=alumni from the mentor landing CTA so the signup form starts on the right track.
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const roleParam = params.get('role');
        if (roleParam === 'alumni' || roleParam === 'student') {
            setFormData(prev => ({ ...prev, role: roleParam }));
        }
    }, [location.search]);

    useEffect(() => {
        api.get('/subjects').then(res => setIbSubjects(res.data)).catch(() => {});
    }, []);

    const parseSubject = (str) => {
        const m = str.match(/^(.+?)\s*\((SL|HL)\)$/);
        return m ? { name: m[1], level: m[2] } : { name: str, level: null };
    };

    const addSubjectWithLevel = (subjectName, level) => {
        setFormData(prev => {
            const current = prev.subject ? prev.subject.split(',').map(s => s.trim()).filter(s => s) : [];
            if (current.some(s => parseSubject(s).name === subjectName)) return prev;
            return { ...prev, subject: [...current, `${subjectName} (${level})`].join(', ') };
        });
        setNewSubject('');
        setShowSubjectDropdown(false);
    };

    const removeSubject = (subjectStr) => {
        setFormData(prev => {
            const current = prev.subject ? prev.subject.split(',').map(s => s.trim()).filter(s => s) : [];
            return { ...prev, subject: current.filter(s => s !== subjectStr).join(', ') };
        });
    };

    const filteredSubjects = ibSubjects.filter(s =>
        s.subjectName.toLowerCase().includes(newSubject.toLowerCase())
    );

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleRegister = async (e) => {
        e.preventDefault();

        if (!location.state?.email && formData.password.length < 6) {
            alert("Password must be at least 6 characters long.");
            return;
        }

        try {
            const response = await api.post('/users/register', formData);
            if (response.data) {
                const { id, name, email, token, picture, role, isAdmin } = response.data;
                localStorage.setItem('userData', JSON.stringify({ id, name, email, token, picture, role, isAdmin }));
                navigate('/lobby');
            }
        } catch (error) {
            const errorMessage = error.response?.data?.error || "Registration failed. Please try again.";
            alert(errorMessage);
        }
    };

    return (
        <div className="registration-page-container">
            <NavBar />
            <div className="registration-container">
                <h1>Complete Your Profile</h1>
                <form onSubmit={handleRegister}>
                    <div className="form-group">
                        <label>Full Name <span style={{ color: 'red' }}>*</span></label>
                        <input
                            type="text"
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label>Email <span style={{ color: 'red' }}>*</span></label>
                        <input
                            type="email"
                            name="email"
                            value={formData.email}
                            onChange={handleChange}
                            required
                            disabled={!!location.state?.email}
                        />
                    </div>

                    <div className="form-group">
                        <label>Personal ID (Username) <span style={{ color: 'red' }}>*</span></label>
                        <input
                            type="text"
                            name="username"
                            value={formData.username}
                            onChange={handleChange}
                            required
                        />
                    </div>
                    
                    {!location.state?.email && (
                        <div className="form-group">
                            <label>Password <span style={{ color: 'red' }}>*</span></label>
                            <input
                                type="password"
                                name="password"
                                value={formData.password}
                                onChange={handleChange}
                                required
                            />
                        </div>
                    )}

                    <div className="form-group">
                        <label>Role</label>
                        <div className="radio-group">
                            <label className="radio-label">
                                <input
                                    type="radio"
                                    name="role"
                                    value="student"
                                    checked={formData.role === 'student'}
                                    onChange={handleChange}
                                />
                                Student
                            </label>
                            <label className="radio-label">
                                <input
                                    type="radio"
                                    name="role"
                                    value="alumni"
                                    checked={formData.role === 'alumni'}
                                    onChange={handleChange}
                                />
                                Alumni
                            </label>
                        </div>
                    </div>

                    {formData.role === 'student' ? (
                        <>
                            <div className="form-group">
                                <label>Target University</label>
                                <input
                                    type="text"
                                    name="targetUniversity"
                                    value={formData.targetUniversity}
                                    onChange={handleChange}
                                    placeholder="e.g. MIT"
                                />
                            </div>
                            <div className="form-group">
                                <label>Curriculum</label>
                                <input
                                    type="text"
                                    name="curriculum"
                                    value={formData.curriculum}
                                    onChange={handleChange}
                                    placeholder="e.g. IB, A-Levels"
                                />
                            </div>
                            <div className="form-group">
                                <label>Major</label>
                                <input
                                    type="text"
                                    name="major"
                                    value={formData.major}
                                    onChange={handleChange}
                                    placeholder="e.g. Computer Science"
                                />
                            </div>
                        </>
                    ) : (
                        <div className="form-group">
                            <label>University</label>
                            <input
                                type="text"
                                name="targetUniversity"
                                value={formData.targetUniversity}
                                onChange={handleChange}
                                placeholder="e.g. Stanford"
                            />
                        </div>
                    )}

                    <div className="form-group">
                        <label>Subject Interest</label>
                        <div className="reg-subject-wrap">
                            <input
                                type="text"
                                className="reg-subject-search"
                                value={newSubject}
                                onChange={e => { setNewSubject(e.target.value); setShowSubjectDropdown(true); }}
                                onFocus={() => setShowSubjectDropdown(true)}
                                onBlur={() => setTimeout(() => setShowSubjectDropdown(false), 150)}
                                placeholder="Search IB subjects..."
                                autoComplete="off"
                            />
                            {showSubjectDropdown && filteredSubjects.length > 0 && (
                                <div className="reg-subject-dropdown">
                                    {filteredSubjects.slice(0, 8).map(s => (
                                        <div key={s.id} className="reg-subject-option">
                                            <div className="reg-subject-option-info">
                                                <span className="reg-subject-name">{s.subjectName}</span>
                                                <span className="reg-subject-group">{s.groupName}</span>
                                            </div>
                                            <div className="reg-subject-level-btns">
                                                {s.hasSL !== false && (
                                                    <button type="button" className="reg-level-btn reg-level-sl"
                                                        onMouseDown={e => { e.preventDefault(); addSubjectWithLevel(s.subjectName, 'SL'); }}>
                                                        SL
                                                    </button>
                                                )}
                                                {s.hasHL !== false && (
                                                    <button type="button" className="reg-level-btn reg-level-hl"
                                                        onMouseDown={e => { e.preventDefault(); addSubjectWithLevel(s.subjectName, 'HL'); }}>
                                                        HL
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        {formData.subject && (
                            <div className="reg-subject-chips">
                                {formData.subject.split(',').map(s => s.trim()).filter(s => s).map(s => {
                                    const { name, level } = parseSubject(s);
                                    return (
                                        <span key={s} className="reg-subject-chip">
                                            {name}
                                            {level && <span className={`reg-level-badge reg-level-${level.toLowerCase()}`}>{level}</span>}
                                            <button type="button" className="reg-chip-remove" onClick={() => removeSubject(s)}>×</button>
                                        </span>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <button type="submit" className="submit-btn">
                        {location.state ? 'Complete Registration' : 'Sign Up'}
                    </button>
                </form>
            </div>
        </div>
    );
};