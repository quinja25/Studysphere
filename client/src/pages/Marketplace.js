import React, { useState, useEffect } from 'react';
import { NavBar } from '../components/NavBar';
import api from '../api';
import './Marketplace.css';

const TYPE_LABELS = {
    essay: 'Essay',
    guide: 'Guide',
    template: 'Template',
    notes: 'Notes',
    other: 'Other',
};

export const Marketplace = () => {
    const [resources, setResources] = useState([]);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [filter, setFilter] = useState('all');
    const [unlocking, setUnlocking] = useState(new Set());
    const [expandedId, setExpandedId] = useState(null);
    const [currentXp, setCurrentXp] = useState(0);
    const [showUploadForm, setShowUploadForm] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [form, setForm] = useState({ title: '', description: '', content: '', price: 0, type: 'guide' });

    const currentUser = (() => {
        const raw = localStorage.getItem('userData');
        return raw ? JSON.parse(raw) : null;
    })();

    const fetchResources = (pageNum = 1, currentFilter = 'all', append = false) => {
        const params = new URLSearchParams({ page: pageNum, limit: 20 });
        if (currentFilter !== 'all') params.set('type', currentFilter);
        api.get(`/resources?${params}`)
            .then(res => {
                const { data, hasMore: more } = res.data;
                setResources(prev => append ? [...prev, ...data] : data);
                setHasMore(more);
                setPage(pageNum);
            })
            .catch(() => {});
    };

    useEffect(() => {
        if (currentUser) setCurrentXp(currentUser.xp || 0);
        fetchResources(1, filter, false);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleUnlock = async (resource) => {
        setUnlocking(prev => new Set(prev).add(resource.id));
        try {
            const res = await api.post(`/resources/${resource.id}/unlock`);
            setResources(prev => prev.map(r => r.id === resource.id ? { ...r, owned: true } : r));
            setCurrentXp(res.data.newXp);
            // Update localStorage so XP stays fresh
            const stored = localStorage.getItem('userData');
            if (stored) {
                const ud = JSON.parse(stored);
                localStorage.setItem('userData', JSON.stringify({ ...ud, xp: res.data.newXp }));
            }
            if (res.data.borrowed) {
                alert(`Resource unlocked on credit. Your XP balance is now ${res.data.newXp} XP. Earn XP by studying to pay it back.`);
            }
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to unlock resource');
        } finally {
            setUnlocking(prev => { const s = new Set(prev); s.delete(resource.id); return s; });
        }
    };

    const handleViewContent = async (resourceId) => {
        if (expandedId === resourceId) { setExpandedId(null); return; }
        try {
            const res = await api.get(`/resources/${resourceId}`);
            setResources(prev => prev.map(r => r.id === resourceId ? { ...r, content: res.data.content } : r));
            setExpandedId(resourceId);
        } catch (err) {}
    };

    const handleUpload = async (e) => {
        e.preventDefault();
        setUploading(true);
        try {
            const res = await api.post('/resources', form);
            setResources(prev => [{ ...res.data, owned: true, author: { name: currentUser?.name } }, ...prev]);
            setForm({ title: '', description: '', content: '', price: 0, type: 'guide' });
            setShowUploadForm(false);
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to upload resource');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="marketplace-page">
            <NavBar />
            <div className="marketplace-container">

                <div className="marketplace-header">
                    <div>
                        <h1>Resource Marketplace</h1>
                        <p className="marketplace-subtitle">Unlock study materials using your XP tokens</p>
                    </div>
                    <div className="marketplace-header-right">
                        <div className="xp-display">
                            <span className="xp-icon">⚡</span>
                            <span className="xp-amount" style={currentXp < 0 ? { color: '#e53935' } : {}}>
                                {currentXp} XP{currentXp < 0 ? ' (in debt)' : ''}
                            </span>
                        </div>
                        <button className="upload-btn" onClick={() => setShowUploadForm(v => !v)}>
                            {showUploadForm ? 'Cancel' : '+ Upload Resource'}
                        </button>
                    </div>
                </div>

                {/* Upload form */}
                {showUploadForm && (
                    <form className="upload-form" onSubmit={handleUpload}>
                        <h3>Share a Resource</h3>
                        <div className="upload-form-row">
                            <input
                                type="text"
                                placeholder="Title"
                                value={form.title}
                                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                                required
                            />
                            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                                {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                            <div className="price-input-wrapper">
                                <span className="price-icon">⚡</span>
                                <input
                                    type="number"
                                    min="0"
                                    placeholder="XP Price (0 = free)"
                                    value={form.price}
                                    onChange={e => setForm(f => ({ ...f, price: Number(e.target.value) }))}
                                    className="price-input"
                                />
                            </div>
                        </div>
                        <textarea
                            placeholder="Short description (optional)"
                            value={form.description}
                            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                            rows={2}
                        />
                        <textarea
                            placeholder="Paste the full content here (essay, notes, guide, etc.)"
                            value={form.content}
                            onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                            rows={10}
                            required
                        />
                        <button type="submit" disabled={uploading} className="btn-primary-market">
                            {uploading ? 'Uploading…' : 'Publish Resource'}
                        </button>
                    </form>
                )}

                {/* Filter tabs */}
                <div className="market-filters">
                    {['all', 'essay', 'guide', 'template', 'notes', 'other'].map(f => (
                        <button
                            key={f}
                            className={`filter-tab ${filter === f ? 'active' : ''}`}
                            onClick={() => { setFilter(f); fetchResources(1, f, false); }}
                        >
                            {f === 'all' ? 'All' : TYPE_LABELS[f]}
                        </button>
                    ))}
                </div>

                {/* Resource grid */}
                <div className="resource-grid">
                    {resources.length === 0 && (
                        <div className="market-empty">No resources found.</div>
                    )}
                    {resources.map(resource => (
                        <div key={resource.id} className={`resource-card ${resource.owned ? 'owned' : ''}`}>
                            <div className="resource-card-top">
                                <span className={`resource-type-badge type-${resource.type}`}>
                                    {TYPE_LABELS[resource.type] || resource.type}
                                </span>
                                {resource.owned && <span className="owned-badge">Unlocked</span>}
                            </div>

                            <h3 className="resource-title">{resource.title}</h3>

                            {resource.description && (
                                <p className="resource-desc">{resource.description}</p>
                            )}

                            <div className="resource-meta">
                                <span className="resource-author">by {resource.author?.name || 'Anonymous'}</span>
                                <span className="resource-downloads">{resource.downloads || 0} downloads</span>
                            </div>

                            {/* Expanded content */}
                            {expandedId === resource.id && resource.content && (
                                <div className="resource-content">{resource.content}</div>
                            )}

                            <div className="resource-card-footer">
                                <div className="resource-price">
                                    {resource.price === 0
                                        ? <span className="price-free">Free</span>
                                        : <span className="price-xp"><span className="xp-icon">⚡</span>{resource.price} XP</span>
                                    }
                                </div>

                                <div className="resource-actions">
                                    {resource.owned ? (
                                        <button
                                            className="btn-view"
                                            onClick={() => handleViewContent(resource.id)}
                                        >
                                            {expandedId === resource.id ? 'Collapse' : 'View Content'}
                                        </button>
                                    ) : (
                                        <button
                                            className={`btn-unlock${currentXp < resource.price && resource.price > 0 ? ' btn-borrow' : ''}`}
                                            onClick={() => handleUnlock(resource)}
                                            disabled={unlocking.has(resource.id)}
                                            title={currentXp < resource.price ? `You're ${resource.price - currentXp} XP short — will borrow` : ''}
                                        >
                                            {unlocking.has(resource.id)
                                                ? 'Unlocking…'
                                                : resource.price === 0
                                                    ? 'Get Free'
                                                    : currentXp >= resource.price
                                                        ? `Unlock for ${resource.price} XP`
                                                        : `Borrow (${resource.price - currentXp} XP short)`
                                            }
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {hasMore && (
                    <div style={{ textAlign: 'center', marginTop: '24px' }}>
                        <button
                            className="filter-tab"
                            onClick={() => { setLoadingMore(true); fetchResources(page + 1, filter, true); setLoadingMore(false); }}
                            disabled={loadingMore}
                        >
                            {loadingMore ? 'Loading…' : 'Load More'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
