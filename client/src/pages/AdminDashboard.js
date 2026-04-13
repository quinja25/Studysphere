import React, { useState, useEffect } from 'react';
import { NavBar } from '../components/NavBar';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import './AdminDashboard.css';

export const AdminDashboard = () => {
    const [activeTab, setActiveTab] = useState('overview');
    const [dashboard, setDashboard] = useState(null);
    const [reports, setReports] = useState([]);
    const [reportsTotal, setReportsTotal] = useState(0);
    const [users, setUsers] = useState([]);
    const [usersTotal, setUsersTotal] = useState(0);
    const [selectedUser, setSelectedUser] = useState(null);
    const [userDetail, setUserDetail] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [reportFilter, setReportFilter] = useState('');
    const [banReason, setBanReason] = useState('');
    const [trustPenalty, setTrustPenalty] = useState(10);
    const [actionReason, setActionReason] = useState('');

    // Global Documents state
    const [globalDocs, setGlobalDocs] = useState([]);
    const [docUploadFile, setDocUploadFile] = useState(null);
    const [docUploadTitle, setDocUploadTitle] = useState('');
    const [docUploadSubject, setDocUploadSubject] = useState('');
    const [docUploadCurriculum, setDocUploadCurriculum] = useState('General');
    const [docUploadType, setDocUploadType] = useState('textbook');
    const [docUploading, setDocUploading] = useState(false);
    const [docUploadMsg, setDocUploadMsg] = useState('');

    const navigate = useNavigate();

    // Check admin status
    useEffect(() => {
        const stored = localStorage.getItem('userData');
        if (stored) {
            const user = JSON.parse(stored);
            if (!user.isAdmin) {
                navigate('/lobby');
            }
        }
    }, [navigate]);

    // Fetch dashboard data
    useEffect(() => {
        if (activeTab === 'overview') {
            api.get('/admin/dashboard').then(r => setDashboard(r.data)).catch(() => {});
        }
    }, [activeTab]);

    // Fetch reports
    useEffect(() => {
        if (activeTab === 'reports') {
            const params = reportFilter ? `?status=${reportFilter}` : '';
            api.get(`/admin/reports${params}`).then(r => {
                setReports(r.data.reports);
                setReportsTotal(r.data.total);
            }).catch(() => {});
        }
    }, [activeTab, reportFilter]);

    // Fetch users
    useEffect(() => {
        if (activeTab === 'users') {
            const params = searchQuery ? `?search=${encodeURIComponent(searchQuery)}` : '';
            api.get(`/admin/users${params}`).then(r => {
                setUsers(r.data.users);
                setUsersTotal(r.data.total);
            }).catch(() => {});
        }
    }, [activeTab, searchQuery]);

    // Fetch global documents
    useEffect(() => {
        if (activeTab === 'documents') {
            api.get('/admin/documents').then(r => setGlobalDocs(r.data)).catch(() => {});
        }
    }, [activeTab]);

    const handleDocUpload = async (e) => {
        e.preventDefault();
        if (!docUploadFile || !docUploadTitle.trim()) {
            setDocUploadMsg('Title and PDF file are required.');
            return;
        }
        setDocUploading(true);
        setDocUploadMsg('');
        try {
            const form = new FormData();
            form.append('file', docUploadFile);
            form.append('title', docUploadTitle.trim());
            form.append('subject', docUploadSubject.trim());
            form.append('curriculum', docUploadCurriculum);
            form.append('docType', docUploadType);
            const r = await api.post('/admin/documents', form, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setGlobalDocs(prev => [r.data, ...prev]);
            setDocUploadFile(null);
            setDocUploadTitle('');
            setDocUploadSubject('');
            setDocUploadCurriculum('General');
            setDocUploadType('textbook');
            setDocUploadMsg('Uploaded! Indexing in progress — chunk count will update shortly.');
            // Refresh after 5s to show updated chunkCount
            setTimeout(() => {
                api.get('/admin/documents').then(r2 => setGlobalDocs(r2.data)).catch(() => {});
            }, 5000);
        } catch (err) {
            setDocUploadMsg(err.response?.data?.error || 'Upload failed.');
        } finally {
            setDocUploading(false);
        }
    };

    const handleDocDelete = async (docId) => {
        try {
            await api.delete(`/admin/documents/${docId}`);
            setGlobalDocs(prev => prev.filter(d => d.id !== docId));
        } catch (err) {
            alert(err.response?.data?.error || 'Delete failed.');
        }
    };

    const handleReviewReport = async (reportId, status) => {
        try {
            await api.put(`/admin/reports/${reportId}`, {
                status,
                action: actionReason || status,
                trustPenalty: status === 'actioned' ? trustPenalty : 0,
            });
            // Refresh reports
            const params = reportFilter ? `?status=${reportFilter}` : '';
            const r = await api.get(`/admin/reports${params}`);
            setReports(r.data.reports);
            setReportsTotal(r.data.total);
            setActionReason('');
        } catch (e) {
            alert(e.response?.data?.error || 'Error reviewing report');
        }
    };

    const handleBanUser = async (userId) => {
        try {
            await api.put(`/admin/users/${userId}/ban`, { reason: banReason || 'Banned by admin' });
            setBanReason('');
            // Refresh
            const params = searchQuery ? `?search=${encodeURIComponent(searchQuery)}` : '';
            const r = await api.get(`/admin/users${params}`);
            setUsers(r.data.users);
        } catch (e) {
            alert(e.response?.data?.error || 'Error banning user');
        }
    };

    const handleUnbanUser = async (userId) => {
        try {
            await api.put(`/admin/users/${userId}/unban`);
            const params = searchQuery ? `?search=${encodeURIComponent(searchQuery)}` : '';
            const r = await api.get(`/admin/users${params}`);
            setUsers(r.data.users);
        } catch (e) {
            alert(e.response?.data?.error || 'Error unbanning user');
        }
    };

    const handleViewUser = async (userId) => {
        try {
            const r = await api.get(`/admin/users/${userId}`);
            setUserDetail(r.data);
            setSelectedUser(userId);
        } catch (e) {}
    };

    const getTrustColor = (score) => {
        if (score >= 80) return '#4caf50';
        if (score >= 50) return '#ff9800';
        if (score >= 20) return '#f44336';
        return '#b71c1c';
    };

    const getTrustLabel = (score) => {
        if (score >= 80) return 'Good';
        if (score >= 50) return 'Medium';
        if (score >= 20) return 'Low';
        return 'Critical';
    };

    return (
        <div className="admin-page">
            <NavBar />
            <div className="admin-container">
                <div className="admin-header">
                    <h1>Admin Dashboard</h1>
                    <p className="admin-subtitle">Platform moderation & trust management</p>
                </div>

                {/* Tabs */}
                <div className="admin-tabs">
                    <button className={`admin-tab ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>Overview</button>
                    <button className={`admin-tab ${activeTab === 'reports' ? 'active' : ''}`} onClick={() => setActiveTab('reports')}>Reports</button>
                    <button className={`admin-tab ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>Users</button>
                    <button className={`admin-tab ${activeTab === 'documents' ? 'active' : ''}`} onClick={() => setActiveTab('documents')}>Documents</button>
                </div>

                {/* Overview Tab */}
                {activeTab === 'overview' && dashboard && (
                    <div className="admin-overview">
                        <div className="admin-stat-cards">
                            <div className="admin-stat-card">
                                <span className="admin-stat-number">{dashboard.totalUsers}</span>
                                <span className="admin-stat-label">Total Users</span>
                            </div>
                            <div className="admin-stat-card">
                                <span className="admin-stat-number">{dashboard.activeToday}</span>
                                <span className="admin-stat-label">Active Today</span>
                            </div>
                            <div className="admin-stat-card admin-stat-alert">
                                <span className="admin-stat-number">{dashboard.pendingReports}</span>
                                <span className="admin-stat-label">Pending Reports</span>
                            </div>
                            <div className="admin-stat-card">
                                <span className="admin-stat-number">{dashboard.shadowBannedCount}</span>
                                <span className="admin-stat-label">Shadow Banned</span>
                            </div>
                        </div>

                        {/* Trust Distribution */}
                        <div className="admin-section">
                            <h3>Trust Score Distribution</h3>
                            <div className="trust-distribution">
                                <div className="trust-bar-container">
                                    <div className="trust-bar-segment trust-high" style={{ flex: dashboard.trustDistribution.high || 1 }}>
                                        <span>{dashboard.trustDistribution.high}</span>
                                    </div>
                                    <div className="trust-bar-segment trust-medium" style={{ flex: dashboard.trustDistribution.medium || 0.1 }}>
                                        <span>{dashboard.trustDistribution.medium}</span>
                                    </div>
                                    <div className="trust-bar-segment trust-low" style={{ flex: dashboard.trustDistribution.low || 0.1 }}>
                                        <span>{dashboard.trustDistribution.low}</span>
                                    </div>
                                    <div className="trust-bar-segment trust-critical" style={{ flex: dashboard.trustDistribution.critical || 0.1 }}>
                                        <span>{dashboard.trustDistribution.critical}</span>
                                    </div>
                                </div>
                                <div className="trust-legend">
                                    <span><i className="dot trust-high-dot"></i> High (80+)</span>
                                    <span><i className="dot trust-medium-dot"></i> Medium (50-79)</span>
                                    <span><i className="dot trust-low-dot"></i> Low (20-49)</span>
                                    <span><i className="dot trust-critical-dot"></i> Critical (&lt;20)</span>
                                </div>
                            </div>
                        </div>

                        {/* Recent Events */}
                        <div className="admin-section">
                            <h3>Recent Trust Events</h3>
                            {dashboard.recentEvents.length === 0 ? (
                                <p className="admin-empty">No trust events yet</p>
                            ) : (
                                <div className="admin-events-list">
                                    {dashboard.recentEvents.map(event => (
                                        <div key={event.id} className={`admin-event-card event-${event.type}`}>
                                            <div className="event-type-badge">{event.type.replace('_', ' ')}</div>
                                            <div className="event-details">
                                                <span className="event-user">{event.user?.name || `User #${event.userId}`}</span>
                                                <span className="event-reason">{event.reason}</span>
                                            </div>
                                            <div className="event-meta">
                                                <span className="event-delta" style={{ color: event.trustDelta < 0 ? '#f44336' : '#4caf50' }}>
                                                    {event.trustDelta > 0 ? '+' : ''}{event.trustDelta}
                                                </span>
                                                <span className="event-score">Score: {event.newTrustScore}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Reports Tab */}
                {activeTab === 'reports' && (
                    <div className="admin-reports">
                        <div className="admin-filter-bar">
                            <select value={reportFilter} onChange={e => setReportFilter(e.target.value)}>
                                <option value="">All Reports ({reportsTotal})</option>
                                <option value="pending">Pending</option>
                                <option value="reviewed">Reviewed</option>
                                <option value="dismissed">Dismissed</option>
                                <option value="actioned">Actioned</option>
                            </select>
                        </div>

                        {reports.length === 0 ? (
                            <div className="admin-empty-state">
                                <p>No reports found</p>
                            </div>
                        ) : (
                            <div className="admin-reports-list">
                                {reports.map(report => (
                                    <div key={report.id} className={`admin-report-card status-${report.status}`}>
                                        <div className="report-header">
                                            <span className={`report-type-badge type-${report.type}`}>{report.type}</span>
                                            <span className={`report-status-badge status-${report.status}`}>{report.status}</span>
                                        </div>
                                        <div className="report-body">
                                            <div className="report-users">
                                                <div className="report-user">
                                                    <span className="report-user-label">Reporter:</span>
                                                    <span className="report-user-name">{report.reporter?.name || 'Unknown'}</span>
                                                </div>
                                                <div className="report-user">
                                                    <span className="report-user-label">Reported:</span>
                                                    <span className="report-user-name">
                                                        {report.reportedUser?.name || 'Unknown'}
                                                        <span className="trust-badge" style={{ color: getTrustColor(report.reportedUser?.trustScore) }}>
                                                            ({report.reportedUser?.trustScore?.toFixed(0) || '?'})
                                                        </span>
                                                        {report.reportedUser?.isShadowBanned && <span className="banned-tag">BANNED</span>}
                                                    </span>
                                                </div>
                                            </div>
                                            {report.description && <p className="report-description">{report.description}</p>}
                                        </div>
                                        {report.status === 'pending' && (
                                            <div className="report-actions">
                                                <div className="report-action-inputs">
                                                    <input
                                                        type="text"
                                                        placeholder="Action reason..."
                                                        value={actionReason}
                                                        onChange={e => setActionReason(e.target.value)}
                                                        className="report-action-input"
                                                    />
                                                    <div className="penalty-input">
                                                        <label>Trust penalty:</label>
                                                        <input
                                                            type="number"
                                                            value={trustPenalty}
                                                            onChange={e => setTrustPenalty(parseInt(e.target.value) || 0)}
                                                            min="0" max="100"
                                                            className="penalty-number"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="report-action-buttons">
                                                    <button className="admin-btn admin-btn-danger" onClick={() => handleReviewReport(report.id, 'actioned')}>
                                                        Action
                                                    </button>
                                                    <button className="admin-btn admin-btn-secondary" onClick={() => handleReviewReport(report.id, 'dismissed')}>
                                                        Dismiss
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Users Tab */}
                {activeTab === 'users' && (
                    <div className="admin-users">
                        <div className="admin-filter-bar">
                            <input
                                type="text"
                                placeholder="Search users by name or email..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="admin-search-input"
                            />
                            <span className="admin-user-count">{usersTotal} users</span>
                        </div>

                        <div className="admin-users-table">
                            <div className="admin-table-header">
                                <span>User</span>
                                <span>Role</span>
                                <span>Trust</span>
                                <span>Streak</span>
                                <span>Level</span>
                                <span>Status</span>
                                <span>Actions</span>
                            </div>
                            {users.map(user => (
                                <div key={user.id} className={`admin-table-row ${user.isShadowBanned ? 'row-banned' : ''}`}>
                                    <div className="admin-user-cell">
                                        <div className="admin-user-avatar">
                                            {user.picture
                                                ? <img src={user.picture} alt="" />
                                                : <span>{user.name?.charAt(0)?.toUpperCase() || '?'}</span>
                                            }
                                        </div>
                                        <div>
                                            <span className="admin-user-name">{user.name}</span>
                                            <span className="admin-user-email">{user.email}</span>
                                        </div>
                                    </div>
                                    <span className={`admin-role-badge role-${user.role}`}>{user.role}</span>
                                    <span className="admin-trust" style={{ color: getTrustColor(user.trustScore) }}>
                                        {user.trustScore?.toFixed(0)} <small>({getTrustLabel(user.trustScore)})</small>
                                    </span>
                                    <span>{user.currentStreak || 0}d</span>
                                    <span>Lv.{user.level || 1}</span>
                                    <span>
                                        {user.isShadowBanned && <span className="banned-tag">BANNED</span>}
                                        {user.isAdmin && <span className="admin-tag">ADMIN</span>}
                                        {!user.isShadowBanned && !user.isAdmin && <span className="active-tag">Active</span>}
                                    </span>
                                    <div className="admin-action-cell">
                                        <button className="admin-btn-sm" onClick={() => handleViewUser(user.id)}>View</button>
                                        {!user.isShadowBanned ? (
                                            <button className="admin-btn-sm admin-btn-danger-sm" onClick={() => handleBanUser(user.id)}>Ban</button>
                                        ) : (
                                            <button className="admin-btn-sm admin-btn-success-sm" onClick={() => handleUnbanUser(user.id)}>Unban</button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* User Detail Modal */}
                        {selectedUser && userDetail && (
                            <div className="admin-modal-overlay" onClick={() => setSelectedUser(null)}>
                                <div className="admin-modal" onClick={e => e.stopPropagation()}>
                                    <button className="admin-modal-close" onClick={() => setSelectedUser(null)}>X</button>
                                    <h2>{userDetail.user.name}</h2>
                                    <p className="modal-email">{userDetail.user.email}</p>

                                    <div className="modal-stats">
                                        <div className="modal-stat">
                                            <span className="modal-stat-label">Trust Score</span>
                                            <span className="modal-stat-value" style={{ color: getTrustColor(userDetail.user.trustScore) }}>
                                                {userDetail.user.trustScore?.toFixed(1)}
                                            </span>
                                        </div>
                                        <div className="modal-stat">
                                            <span className="modal-stat-label">Role</span>
                                            <span className="modal-stat-value">{userDetail.user.role}</span>
                                        </div>
                                        <div className="modal-stat">
                                            <span className="modal-stat-label">Level</span>
                                            <span className="modal-stat-value">{userDetail.user.level}</span>
                                        </div>
                                        <div className="modal-stat">
                                            <span className="modal-stat-label">Streak</span>
                                            <span className="modal-stat-value">{userDetail.user.currentStreak}d</span>
                                        </div>
                                    </div>

                                    {userDetail.user.isShadowBanned && (
                                        <div className="modal-ban-info">
                                            <p>Banned: {userDetail.user.banReason}</p>
                                            <p>Since: {new Date(userDetail.user.bannedAt).toLocaleDateString()}</p>
                                        </div>
                                    )}

                                    <h3>Trust History</h3>
                                    {userDetail.trustHistory.length === 0 ? (
                                        <p className="admin-empty">No trust events</p>
                                    ) : (
                                        <div className="modal-history-list">
                                            {userDetail.trustHistory.map(ev => (
                                                <div key={ev.id} className="modal-history-item">
                                                    <span className={`event-type-mini type-${ev.type}`}>{ev.type.replace('_', ' ')}</span>
                                                    <span className="modal-history-reason">{ev.reason}</span>
                                                    <span className="modal-history-delta" style={{ color: ev.trustDelta < 0 ? '#f44336' : '#4caf50' }}>
                                                        {ev.trustDelta > 0 ? '+' : ''}{ev.trustDelta} ({ev.newTrustScore.toFixed(0)})
                                                    </span>
                                                    <span className="modal-history-date">{new Date(ev.createdAt).toLocaleDateString()}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <h3>Report History</h3>
                                    {userDetail.reportHistory.length === 0 ? (
                                        <p className="admin-empty">No reports</p>
                                    ) : (
                                        <div className="modal-history-list">
                                            {userDetail.reportHistory.map(rp => (
                                                <div key={rp.id} className="modal-history-item">
                                                    <span className={`report-type-badge type-${rp.type}`}>{rp.type}</span>
                                                    <span className="modal-history-reason">{rp.description || 'No description'}</span>
                                                    <span className={`report-status-badge status-${rp.status}`}>{rp.status}</span>
                                                    <span className="modal-history-date">{new Date(rp.createdAt).toLocaleDateString()}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Documents Tab */}
                {activeTab === 'documents' && (
                    <div className="admin-documents">
                        <div className="admin-doc-upload-card">
                            <h3>Upload Global Document</h3>
                            <p className="admin-doc-subtitle">Pro users will get this content in their AI RAG context automatically.</p>
                            <form onSubmit={handleDocUpload} className="admin-doc-form">
                                <div className="admin-doc-form-row">
                                    <input
                                        type="text"
                                        placeholder="Title *"
                                        value={docUploadTitle}
                                        onChange={e => setDocUploadTitle(e.target.value)}
                                        className="admin-doc-input"
                                    />
                                    <select value={docUploadSubject} onChange={e => setDocUploadSubject(e.target.value)} className="admin-doc-select">
                                        <option value="">Subject *</option>
                                        {['Mathematics','Physics','Chemistry','Biology','Computer Science','English','History','Economics','Psychology','Other'].map(s => (
                                            <option key={s} value={s}>{s}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="admin-doc-form-row">
                                    <select value={docUploadCurriculum} onChange={e => setDocUploadCurriculum(e.target.value)} className="admin-doc-select">
                                        <option value="General">General</option>
                                        <option value="IB">IB</option>
                                        <option value="A-Level">A-Level</option>
                                        <option value="AP">AP</option>
                                        <option value="GCSE">GCSE</option>
                                        <option value="University">University</option>
                                    </select>
                                    <select value={docUploadType} onChange={e => setDocUploadType(e.target.value)} className="admin-doc-select">
                                        <option value="textbook">Textbook</option>
                                        <option value="past_paper">Past Paper</option>
                                        <option value="notes">Notes</option>
                                        <option value="other">Other</option>
                                    </select>
                                </div>
                                <div className="admin-doc-file-row">
                                    <label className="admin-doc-file-label">
                                        {docUploadFile ? docUploadFile.name : 'Choose PDF file'}
                                        <input
                                            type="file"
                                            accept="application/pdf"
                                            style={{ display: 'none' }}
                                            onChange={e => setDocUploadFile(e.target.files[0] || null)}
                                        />
                                    </label>
                                    <button type="submit" className="admin-btn admin-btn-primary" disabled={docUploading}>
                                        {docUploading ? 'Uploading...' : 'Upload'}
                                    </button>
                                </div>
                                {docUploadMsg && (
                                    <p className={`admin-doc-msg ${docUploadMsg.includes('failed') || docUploadMsg.includes('required') ? 'admin-doc-msg-error' : 'admin-doc-msg-success'}`}>
                                        {docUploadMsg}
                                    </p>
                                )}
                            </form>
                        </div>

                        <div className="admin-doc-list-header">
                            <h3>Global Documents ({globalDocs.length})</h3>
                            <button className="admin-btn-sm" onClick={() => api.get('/admin/documents').then(r => setGlobalDocs(r.data)).catch(() => {})}>Refresh</button>
                        </div>

                        {globalDocs.length === 0 ? (
                            <div className="admin-empty-state"><p>No documents uploaded yet.</p></div>
                        ) : (
                            <div className="admin-doc-table">
                                <div className="admin-doc-table-header">
                                    <span>Title</span>
                                    <span>Subject</span>
                                    <span>Curriculum</span>
                                    <span>Type</span>
                                    <span>Pages</span>
                                    <span>Chunks</span>
                                    <span>Size</span>
                                    <span>Actions</span>
                                </div>
                                {globalDocs.map(doc => (
                                    <div key={doc.id} className="admin-doc-table-row">
                                        <span className="admin-doc-title">{doc.title}</span>
                                        <span>{doc.subject || '—'}</span>
                                        <span><span className={`admin-curriculum-badge curriculum-${doc.curriculum?.replace('-','').toLowerCase()}`}>{doc.curriculum}</span></span>
                                        <span>{doc.docType?.replace('_', ' ')}</span>
                                        <span>{doc.pageCount}</span>
                                        <span>{doc.chunkCount === 0 ? <span className="admin-indexing-badge">Indexing...</span> : doc.chunkCount}</span>
                                        <span>{doc.fileSizeFormatted}</span>
                                        <span><button className="admin-btn-sm admin-btn-danger-sm" onClick={() => handleDocDelete(doc.id)}>Delete</button></span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
