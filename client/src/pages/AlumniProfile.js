import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { NavBar } from '../components/NavBar';
import api from '../api';
import './AlumniProfile.css';
import ReportButton from '../components/ReportButton';
import { FaLinkedin, FaGithub, FaGlobe } from 'react-icons/fa';
import ConfirmModal from '../components/ConfirmModal';

const safeUrl = (url) => {
    try {
        const parsed = new URL(url);
        return ['http:', 'https:'].includes(parsed.protocol) ? url : '#';
    } catch { return '#'; }
};

export const AlumniProfile = () => {
    const { id } = useParams();
    const navigate = useNavigate();

    const [profile, setProfile] = useState(null);
    const [posts, setPosts] = useState([]);
    const [endorsements, setEndorsements] = useState([]);
    const [endorsementCount, setEndorsementCount] = useState(0);
    const [hasEndorsed, setHasEndorsed] = useState(false);
    const [expandedPost, setExpandedPost] = useState(null);
    const [likedPosts, setLikedPosts] = useState(() => {
        try {
            const raw = localStorage.getItem('likedPosts');
            return new Set(raw ? JSON.parse(raw) : []);
        } catch { return new Set(); }
    });
    const [endorseMessage, setEndorseMessage] = useState('');
    const [showEndorseForm, setShowEndorseForm] = useState(false);
    const [endorsing, setEndorsing] = useState(false);

    // New post form (shown only when viewing own profile)
    const [showPostForm, setShowPostForm] = useState(false);
    const [postForm, setPostForm] = useState({ title: '', content: '', type: 'blog' });
    const [posting, setPosting] = useState(false);

    const [confirmState, setConfirmState] = useState({ open: false, title: '', message: '', onConfirm: null });
    const openConfirm = (title, message, onConfirm) =>
        setConfirmState({ open: true, title, message, onConfirm });
    const closeConfirm = () =>
        setConfirmState(s => ({ ...s, open: false }));

    const currentUser = (() => {
        const raw = localStorage.getItem('userData');
        return raw ? JSON.parse(raw) : null;
    })();
    const isOwnProfile = currentUser && String(currentUser.id) === String(id);

    const parseSubject = (str) => {
        const m = str.match(/^(.+?)\s*\((SL|HL)\)$/);
        return m ? { name: m[1], level: m[2] } : { name: str, level: null };
    };

    const handleMessage = async () => {
        try {
            const raw = localStorage.getItem('userData');
            if (!raw) return;
            const me = JSON.parse(raw);
            const meRes = await api.get(`/users/byEmail/${me.email}`);
            const myId = meRes.data.id;
            const a = Math.min(myId, profile.id);
            const b = Math.max(myId, profile.id);
            const dmName = `__dm_${a}_${b}`;
            const groupsRes = await api.get(`/groupsUsers/byUser/${myId}`);
            const existing = Array.isArray(groupsRes.data)
                ? groupsRes.data.find(g => g.groupName === dmName)
                : null;
            if (existing) {
                navigate('/chat', { state: { openGroup: existing, dmPartnerName: profile.name } });
            } else {
                const groupRes = await api.post('/groups', { groupName: dmName, isPublic: false, maxParticipants: 2, leader: me.name });
                const group = groupRes.data;
                await api.post(`/groupsUsers/user/${myId}/group/${group.id}`);
                await api.post(`/groupsUsers/user/${profile.id}/group/${group.id}`);
                navigate('/chat', { state: { openGroup: group, dmPartnerName: profile.name } });
            }
        } catch (err) {
            alert('Could not open chat. Please try again.');
        }
    };
    const isProfileAlumni = profile?.role === 'alumni';
    const isProfileStudent = profile?.role === 'student';

    useEffect(() => {
        api.get(`/users/${id}`).then(res => setProfile(res.data)).catch(() => {});
        api.get(`/posts/byAuthor/${id}`).then(res => setPosts(res.data)).catch(() => setPosts([]));
        api.get(`/endorsements/byAlumni/${id}`).then(res => setEndorsements(res.data)).catch(() => setEndorsements([]));
        api.get(`/endorsements/count/${id}`).then(res => setEndorsementCount(res.data.count)).catch(() => {});
        if (currentUser && !isOwnProfile) {
            api.get(`/endorsements/check/${id}`).then(res => setHasEndorsed(res.data.hasEndorsed)).catch(() => {});
        }
    }, [id]);

    const handleEndorse = async () => {
        setEndorsing(true);
        try {
            const res = await api.post('/endorsements', { alumniId: id, message: endorseMessage });
            if (res.data.created) {
                setHasEndorsed(true);
                setEndorsementCount(c => c + 1);
                setEndorsements(prev => [res.data.endorsement, ...prev]);
            }
            setShowEndorseForm(false);
            setEndorseMessage('');
        } catch (e) {
            alert(e.response?.data?.error || 'Could not endorse');
        } finally {
            setEndorsing(false);
        }
    };

    const handleLike = async (postId) => {
        try {
            const isLiked = likedPosts.has(postId);
            const res = isLiked
                ? await api.delete(`/posts/${postId}/like`)
                : await api.post(`/posts/${postId}/like`);
            setPosts(prev => prev.map(p => p.id === postId ? { ...p, likes: res.data.likes } : p));
            setLikedPosts(prev => {
                const next = new Set(prev);
                isLiked ? next.delete(postId) : next.add(postId);
                localStorage.setItem('likedPosts', JSON.stringify([...next]));
                return next;
            });
        } catch (e) {}
    };

    const handleDeletePostConfirmed = async (postId) => {
        try {
            await api.delete(`/posts/${postId}`);
            setPosts(prev => prev.filter(p => p.id !== postId));
        } catch (e) {
            alert('Could not delete post');
        }
    };

    const handleDeletePost = (postId) => {
        openConfirm('Delete Post', 'Are you sure you want to delete this post? This cannot be undone.', () => handleDeletePostConfirmed(postId));
    };

    const handleCreatePost = async (e) => {
        e.preventDefault();
        setPosting(true);
        try {
            const res = await api.post('/posts', postForm);
            setPosts(prev => [res.data, ...prev]);
            setPostForm({ title: '', content: '', type: 'blog' });
            setShowPostForm(false);
        } catch (e) {
            alert(e.response?.data?.error || 'Could not create post');
        } finally {
            setPosting(false);
        }
    };

    if (!profile) return (
        <div>
            <NavBar />
            <div className="alumni-profile-loading">Loading profile...</div>
        </div>
    );

    return (
        <div className="alumni-profile-page">
            <NavBar />
            <div className="alumni-profile-container">

                {/* ── Profile Header ── */}
                <div className={`alumni-profile-header ${isProfileStudent ? 'student-profile-header' : ''}`}>
                    <div className="alumni-profile-avatar">
                        {profile.picture
                            ? <img src={profile.picture} alt={profile.name} className={isProfileStudent ? 'student-avatar-border' : ''} />
                            : <div className={`avatar-initials ${isProfileStudent ? 'student-avatar-initials' : ''}`}>{profile.name?.charAt(0).toUpperCase()}</div>
                        }
                    </div>
                    <div className="alumni-profile-info">
                        <h1>{profile.name}</h1>
                        <div className="alumni-profile-badges">
                            <span className={`badge ${isProfileAlumni ? 'badge-alumni' : 'badge-student'}`}>
                                {isProfileAlumni ? 'Alumni' : 'Student'}
                            </span>
                            {profile.targetUniversity && (
                                <span className="badge badge-uni">{profile.targetUniversity}</span>
                            )}
                            {isProfileStudent && profile.gradeLevel && (
                                <span className="badge badge-uni">{profile.gradeLevel}</span>
                            )}
                        </div>
                        {profile.subject && (
                            <p className="alumni-subjects">
                                {profile.subject.split(',').map(s => {
                                    const { name, level } = parseSubject(s.trim());
                                    return (
                                        <span key={s} className={`subject-chip ${isProfileStudent ? 'student-subject-chip' : ''}`}>
                                            {name}
                                            {level && <span className={`subject-level-badge subject-level-${level.toLowerCase()}`}>{level}</span>}
                                        </span>
                                    );
                                })}
                            </p>
                        )}
                        {isProfileAlumni && profile.openHours && (
                            <p className="alumni-open-hours">Available: {profile.openHours}</p>
                        )}
                        {isProfileStudent && profile.curriculum && (
                            <p className="alumni-open-hours">Curriculum: {profile.curriculum}</p>
                        )}
                        {profile.bio && <p className="alumni-bio">{profile.bio}</p>}
                        {(profile.linkedinUrl || profile.githubUrl || profile.website) && (
                            <div className="alumni-social-links">
                                {profile.linkedinUrl && (
                                    <a href={safeUrl(profile.linkedinUrl)} target="_blank" rel="noopener noreferrer" className="alumni-social-btn alumni-social-linkedin">
                                        <FaLinkedin /> LinkedIn
                                    </a>
                                )}
                                {profile.githubUrl && (
                                    <a href={safeUrl(profile.githubUrl)} target="_blank" rel="noopener noreferrer" className="alumni-social-btn alumni-social-github">
                                        <FaGithub /> GitHub
                                    </a>
                                )}
                                {profile.website && (
                                    <a href={safeUrl(profile.website)} target="_blank" rel="noopener noreferrer" className="alumni-social-btn alumni-social-website">
                                        <FaGlobe /> Website
                                    </a>
                                )}
                            </div>
                        )}

                        <div className="alumni-stats">
                            {isProfileAlumni && (
                                <>
                                    <div className="stat-card">
                                        <span className="stat-number">{endorsementCount}</span>
                                        <span className="stat-label">Students Helped</span>
                                    </div>
                                    <div className="stat-card">
                                        <span className="stat-number">{posts.length}</span>
                                        <span className="stat-label">Posts</span>
                                    </div>
                                    <div className="stat-card">
                                        <span className="stat-number">{posts.reduce((s, p) => s + (p.likes || 0), 0)}</span>
                                        <span className="stat-label">Total Likes</span>
                                    </div>
                                </>
                            )}
                            {isProfileStudent && (
                                <>
                                    <div className="stat-card">
                                        <span className="stat-number">Lvl {profile.level || 1}</span>
                                        <span className="stat-label">Level</span>
                                    </div>
                                    <div className="stat-card">
                                        <span className="stat-number" style={{ color: '#ff9800' }}>{profile.currentStreak || 0}</span>
                                        <span className="stat-label">Day Streak</span>
                                    </div>
                                    <div className="stat-card">
                                        <span className="stat-number">{profile.totalSessions || 0}</span>
                                        <span className="stat-label">Sessions</span>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Endorse button — only shown to students viewing an alumni's profile */}
                        {!isOwnProfile && isProfileAlumni && currentUser?.role === 'student' && (
                            <div className="endorse-section">
                                {hasEndorsed ? (
                                    <span className="endorsed-badge">You endorsed this mentor</span>
                                ) : (
                                    <button className="endorse-btn" onClick={() => setShowEndorseForm(v => !v)}>
                                        Endorse as Mentor
                                    </button>
                                )}
                                {showEndorseForm && (
                                    <div className="endorse-form">
                                        <textarea
                                            placeholder="Leave a short message (optional)"
                                            value={endorseMessage}
                                            onChange={e => setEndorseMessage(e.target.value)}
                                            rows={2}
                                        />
                                        <div className="endorse-form-actions">
                                            <button onClick={() => setShowEndorseForm(false)} className="btn-secondary">Cancel</button>
                                            <button onClick={handleEndorse} disabled={endorsing} className="btn-primary">
                                                {endorsing ? 'Endorsing…' : 'Confirm Endorsement'}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Message + Report buttons */}
                        {!isOwnProfile && currentUser && (
                            <div style={{ marginTop: '8px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                <button className="btn-primary" onClick={handleMessage}>
                                    Message
                                </button>
                                <ReportButton reportedUserId={id} />
                            </div>
                        )}

                        {/* Own profile actions — alumni can write posts */}
                        {isOwnProfile && isProfileAlumni && (
                            <button className="btn-primary" onClick={() => setShowPostForm(v => !v)}>
                                {showPostForm ? 'Cancel' : '+ New Post'}
                            </button>
                        )}
                    </div>
                </div>

                {/* ── New Post Form (alumni only) ── */}
                {showPostForm && isProfileAlumni && (
                    <form className="post-form" onSubmit={handleCreatePost}>
                        <h3>Create a Post</h3>
                        <input
                            type="text"
                            placeholder="Title"
                            value={postForm.title}
                            onChange={e => setPostForm(f => ({ ...f, title: e.target.value }))}
                            required
                        />
                        <select
                            value={postForm.type}
                            onChange={e => setPostForm(f => ({ ...f, type: e.target.value }))}
                        >
                            <option value="blog">Blog Post</option>
                            <option value="advice">Advice</option>
                        </select>
                        <textarea
                            placeholder="Share your knowledge, experience or advice..."
                            value={postForm.content}
                            onChange={e => setPostForm(f => ({ ...f, content: e.target.value }))}
                            rows={8}
                            required
                        />
                        <button type="submit" disabled={posting} className="btn-primary">
                            {posting ? 'Publishing…' : 'Publish'}
                        </button>
                    </form>
                )}

                {/* ── Posts (alumni) / Study Activity (student) ── */}
                <div className="alumni-posts-section">
                    <h2>{isProfileAlumni ? 'Posts & Advice' : 'Study Activity'}</h2>
                    {posts.length === 0 && <p className="empty-state">No posts yet.</p>}
                    <div className="posts-grid">
                        {posts.map(post => (
                            <div key={post.id} className="post-card">
                                <div className="post-card-header">
                                    <span className={`post-type-badge post-type-${post.type}`}>{post.type}</span>
                                    <h3
                                        className="post-title"
                                        onClick={() => setExpandedPost(expandedPost === post.id ? null : post.id)}
                                    >
                                        {post.title}
                                    </h3>
                                </div>

                                {expandedPost === post.id ? (
                                    <div className="post-content">{post.content}</div>
                                ) : (
                                    <p className="post-excerpt">
                                        {post.content.length > 160 ? post.content.slice(0, 160) + '…' : post.content}
                                    </p>
                                )}

                                <div className="post-card-footer">
                                    <button
                                        className={`like-btn${likedPosts.has(post.id) ? ' liked' : ''}`}
                                        onClick={() => handleLike(post.id)}
                                    >
                                        {likedPosts.has(post.id) ? '♥' : '♡'} {post.likes || 0}
                                    </button>
                                    <button
                                        className="read-more-btn"
                                        onClick={() => setExpandedPost(expandedPost === post.id ? null : post.id)}
                                    >
                                        {expandedPost === post.id ? 'Collapse' : 'Read more'}
                                    </button>
                                    {isOwnProfile && (
                                        <button className="delete-post-btn" onClick={() => handleDeletePost(post.id)}>
                                            Delete
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* ── Endorsements (alumni only) ── */}
                {isProfileAlumni && endorsements.length > 0 && (
                    <div className="endorsements-section">
                        <h2>Endorsements ({endorsementCount})</h2>
                        <div className="endorsements-list">
                            {endorsements.map(e => (
                                <div key={e.id} className="endorsement-card">
                                    <div className="endorsement-avatar">
                                        {e.student?.name?.charAt(0).toUpperCase() || '?'}
                                    </div>
                                    <div className="endorsement-body">
                                        <span className="endorsement-name">{e.student?.name}</span>
                                        {e.message && <p className="endorsement-message">"{e.message}"</p>}
                                    </div>
                                </div>
                            ))}
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
