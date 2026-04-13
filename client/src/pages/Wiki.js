import React, { useState, useEffect } from 'react';
import { NavBar } from '../components/NavBar';
import { Link } from 'react-router-dom';
import api from '../api';
import './Wiki.css';
import ConfirmModal from '../components/ConfirmModal';

const PAGE_LIMIT = 20;

export const Wiki = () => {
    const [articles, setArticles] = useState([]);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [selected, setSelected] = useState(null);  // full article being read
    const [search, setSearch] = useState('');
    const [subjectFilter, setSubjectFilter] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [form, setForm] = useState({ title: '', content: '', subject: '', tags: [] });
    const [tagInput, setTagInput] = useState('');
    const [editingId, setEditingId] = useState(null);
    const [suggesting, setSuggesting] = useState(false);

    const [confirmState, setConfirmState] = useState({ open: false, title: '', message: '', onConfirm: null });
    const openConfirm = (title, message, onConfirm) =>
        setConfirmState({ open: true, title, message, onConfirm });
    const closeConfirm = () =>
        setConfirmState(s => ({ ...s, open: false }));

    const currentUser = (() => {
        const raw = localStorage.getItem('userData');
        return raw ? JSON.parse(raw) : null;
    })();
    const isAlumni = currentUser?.role === 'alumni';

    const fetchArticles = (pageNum = 1, append = false) => {
        const params = new URLSearchParams();
        if (search) params.set('search', search);
        if (subjectFilter) params.set('subject', subjectFilter);
        params.set('page', pageNum);
        params.set('limit', PAGE_LIMIT);
        api.get(`/wiki?${params}`).then(res => {
            const { data, hasMore: more } = res.data;
            setArticles(prev => append ? [...prev, ...data] : data);
            setHasMore(more);
            setPage(pageNum);
        }).catch(() => {});
    };

    const handleLoadMore = () => {
        setLoadingMore(true);
        fetchArticles(page + 1, true);
        setLoadingMore(false);
    };

    useEffect(() => { fetchArticles(1, false); }, [search, subjectFilter]); // eslint-disable-line react-hooks/exhaustive-deps

    const openArticle = async (id) => {
        try {
            const res = await api.get(`/wiki/${id}`);
            setSelected(res.data);
        } catch (e) {}
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            if (editingId) {
                const res = await api.put(`/wiki/${editingId}`, form);
                setArticles(prev => prev.map(a => a.id === editingId ? { ...a, ...res.data } : a));
                if (selected?.id === editingId) setSelected(prev => ({ ...prev, ...res.data }));
            } else {
                const res = await api.post('/wiki', form);
                setArticles(prev => [{ ...res.data, author: { name: currentUser?.name } }, ...prev]);
            }
            setForm({ title: '', content: '', subject: '', tags: [] });
            setTagInput('');
            setShowForm(false);
            setEditingId(null);
        } catch (e) {
            alert(e.response?.data?.error || 'Failed to save article');
        } finally {
            setSubmitting(false);
        }
    };

    const addTag = (value) => {
        const tag = value.replace(/^#+/, '').trim().toLowerCase().replace(/\s+/g, '-');
        if (tag && !form.tags.includes(tag)) setForm(f => ({ ...f, tags: [...f.tags, tag] }));
        setTagInput('');
    };

    const removeTag = (tag) => setForm(f => ({ ...f, tags: f.tags.filter(t => t !== tag) }));

    const handleTagKeyDown = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput); }
        if (e.key === ',') { e.preventDefault(); addTag(tagInput); }
        if (e.key === 'Backspace' && !tagInput && form.tags.length > 0) {
            removeTag(form.tags[form.tags.length - 1]);
        }
    };

    const handleAiSuggest = async () => {
        if (!form.content.trim()) return;
        setSuggesting(true);
        try {
            const res = await api.post('/ai/suggest', { content: form.content, type: 'wiki' });
            const { suggestedTitle, suggestedTags } = res.data;
            setForm(f => ({
                ...f,
                title: f.title || suggestedTitle,
                tags: [...new Set([...f.tags, ...suggestedTags])],
            }));
        } catch (e) { /* silently fail */ }
        finally { setSuggesting(false); }
    };

    const startEdit = (article) => {
        const existingTags = article.tags ? article.tags.split(',').filter(Boolean) : [];
        setForm({ title: article.title, content: article.content || '', subject: article.subject || '', tags: existingTags });
        setEditingId(article.id);
        setShowForm(true);
        setSelected(null);
    };

    const handleDeleteConfirmed = async (id) => {
        try {
            await api.delete(`/wiki/${id}`);
            setArticles(prev => prev.filter(a => a.id !== id));
            if (selected?.id === id) setSelected(null);
        } catch (e) {
            alert('Failed to delete article');
        }
    };

    const handleDelete = (id) => {
        openConfirm('Delete Article', 'Are you sure you want to delete this article? This cannot be undone.', () => handleDeleteConfirmed(id));
    };

    const SUBJECTS = ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'Computer Science',
        'English', 'History', 'Economics', 'Psychology', 'Other'];

    return (
        <div className="wiki-page">
            <NavBar />
            <div className="wiki-layout">

                {/* ── Sidebar ── */}
                <aside className="wiki-sidebar">
                    <div className="wiki-sidebar-header">
                        <h2>Knowledge Wiki</h2>
                        {isAlumni && (
                            <button className="wiki-new-btn" onClick={() => { setShowForm(v => !v); setEditingId(null); setForm({ title: '', content: '', subject: '', tags: [] }); }}>
                                {showForm ? 'Cancel' : '+ New Article'}
                            </button>
                        )}
                    </div>

                    <input
                        className="wiki-search"
                        type="text"
                        placeholder="Search articles..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />

                    <select className="wiki-subject-filter" value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)}>
                        <option value="">All Subjects</option>
                        {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>

                    <div className="wiki-article-list">
                        {articles.length === 0 && <p className="wiki-empty">No articles yet.</p>}
                        {articles.map(article => (
                            <div
                                key={article.id}
                                className={`wiki-article-item ${selected?.id === article.id ? 'active' : ''}`}
                                onClick={() => openArticle(article.id)}
                            >
                                <span className="wiki-item-title">{article.title}</span>
                                {article.subject && <span className="wiki-item-subject">{article.subject}</span>}
                                <span className="wiki-item-meta">{article.author?.name} · {article.views || 0} views</span>
                            </div>
                        ))}
                        {hasMore && (
                            <button
                                className="wiki-load-more-btn"
                                onClick={handleLoadMore}
                                disabled={loadingMore}
                            >
                                {loadingMore ? 'Loading…' : 'Load More'}
                            </button>
                        )}
                    </div>
                </aside>

                {/* ── Main content ── */}
                <main className="wiki-main">
                    {showForm && (
                        <form className="wiki-form" onSubmit={handleSubmit}>
                            <h3>{editingId ? 'Edit Article' : 'New Article'}</h3>
                            <input
                                type="text"
                                placeholder="Title"
                                value={form.title}
                                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                                required
                            />
                            <select value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}>
                                <option value="">Select subject...</option>
                                {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                            <div className="qa-textarea-wrapper">
                                <textarea
                                    placeholder="Write your article here..."
                                    value={form.content}
                                    onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                                    rows={14}
                                    required
                                />
                                <button
                                    type="button"
                                    className="qa-suggest-btn"
                                    onClick={handleAiSuggest}
                                    disabled={suggesting || !form.content.trim()}
                                    title="Auto-suggest title and tags using AI"
                                >
                                    {suggesting ? '✨ Thinking…' : '✨ AI Suggest'}
                                </button>
                            </div>
                            <div className="qa-tag-input-row">
                                {form.tags.map(tag => (
                                    <span key={tag} className="qa-tag-pill">
                                        #{tag}
                                        <button type="button" className="qa-tag-remove" onClick={() => removeTag(tag)}>×</button>
                                    </span>
                                ))}
                                <input
                                    className="qa-tag-input"
                                    type="text"
                                    placeholder="Add tags… (Enter or comma)"
                                    value={tagInput}
                                    onChange={e => setTagInput(e.target.value)}
                                    onKeyDown={handleTagKeyDown}
                                    onBlur={() => tagInput.trim() && addTag(tagInput)}
                                />
                            </div>
                            <div className="wiki-form-actions">
                                <button type="button" className="btn-cancel" onClick={() => { setShowForm(false); setEditingId(null); setTagInput(''); }}>Cancel</button>
                                <button type="submit" className="btn-publish" disabled={submitting}>
                                    {submitting ? 'Saving…' : editingId ? 'Save Changes' : 'Publish'}
                                </button>
                            </div>
                        </form>
                    )}

                    {selected && !showForm && (
                        <article className="wiki-article-content">
                            <div className="wiki-article-header">
                                <div>
                                    <h1>{selected.title}</h1>
                                    <div className="wiki-article-meta">
                                        {selected.subject && <span className="wiki-subject-tag">{selected.subject}</span>}
                                        {selected.tags && selected.tags.split(',').filter(Boolean).map(t => (
                                            <span key={t} className="qa-tag-pill">#{t}</span>
                                        ))}
                                        <span>By {selected.author?.name}</span>
                                        <span>{selected.views} views</span>
                                        <span>{new Date(selected.createdAt).toLocaleDateString()}</span>
                                    </div>
                                </div>
                                {isAlumni && String(selected.authorId) === String(currentUser?.id) && (
                                    <div className="wiki-article-actions">
                                        <button className="btn-edit-article" onClick={() => startEdit(selected)}>Edit</button>
                                        <button className="btn-delete-article" onClick={() => handleDelete(selected.id)}>Delete</button>
                                    </div>
                                )}
                            </div>
                            <div className="wiki-body">{selected.content}</div>
                            <button className="btn-back" onClick={() => setSelected(null)}>← Back to list</button>
                        </article>
                    )}

                    {!selected && !showForm && (
                        <div className="wiki-placeholder">
                            <div className="wiki-placeholder-inner">
                                <h2>Welcome to the Knowledge Wiki</h2>
                                <p>Select an article from the sidebar to read it.</p>
                                {isAlumni && <p>As an alumni, you can contribute by writing new articles to help students.</p>}
                                {currentUser && !isAlumni && <p>Browse alumni-written articles to accelerate your learning.</p>}
                                {!currentUser && (
                                    <p><Link to="/login">Log in</Link> to ask questions or contribute articles.</p>
                                )}
                            </div>
                        </div>
                    )}
                </main>
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
