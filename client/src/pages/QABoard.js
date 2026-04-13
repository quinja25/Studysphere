import React, { useState, useEffect } from 'react';
import { NavBar } from '../components/NavBar';
import { Link } from 'react-router-dom';
import api from '../api';
import './QABoard.css';
import ConfirmModal from '../components/ConfirmModal';

const PAGE_LIMIT = 20;

export const QABoard = () => {
    const [questions, setQuestions] = useState([]);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [selected, setSelected] = useState(null); // question detail view
    const [search, setSearch] = useState('');
    const [subjectFilter, setSubjectFilter] = useState('');
    const [showAskForm, setShowAskForm] = useState(false);
    const [askForm, setAskForm] = useState({ title: '', body: '', subject: '', tags: [] });
    const [tagInput, setTagInput] = useState('');
    const [answerText, setAnswerText] = useState('');
    const [submitting, setSubmitting] = useState(false);
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

    const SUBJECTS = ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'Computer Science',
        'English', 'History', 'Economics', 'Psychology', 'Other'];

    const fetchQuestions = (pageNum = 1, append = false) => {
        const params = new URLSearchParams();
        if (search) params.set('search', search);
        if (subjectFilter) params.set('subject', subjectFilter);
        params.set('page', pageNum);
        params.set('limit', PAGE_LIMIT);
        api.get(`/qa?${params}`).then(res => {
            const { data, hasMore: more } = res.data;
            setQuestions(prev => append ? [...prev, ...data] : data);
            setHasMore(more);
            setPage(pageNum);
        }).catch(() => {});
    };

    const handleLoadMore = async () => {
        setLoadingMore(true);
        fetchQuestions(page + 1, true);
        setLoadingMore(false);
    };

    useEffect(() => { fetchQuestions(1, false); }, [search, subjectFilter]); // eslint-disable-line react-hooks/exhaustive-deps

    const openQuestion = async (id) => {
        try {
            const res = await api.get(`/qa/${id}`);
            setSelected(res.data);
            setAnswerText('');
        } catch (e) {}
    };

    const addTag = (value) => {
        const tag = value.replace(/^#+/, '').trim().toLowerCase().replace(/\s+/g, '-');
        if (tag && !askForm.tags.includes(tag)) {
            setAskForm(f => ({ ...f, tags: [...f.tags, tag] }));
        }
        setTagInput('');
    };

    const removeTag = (tag) => setAskForm(f => ({ ...f, tags: f.tags.filter(t => t !== tag) }));

    const handleTagKeyDown = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput); }
        if (e.key === ',') { e.preventDefault(); addTag(tagInput); }
        if (e.key === 'Backspace' && !tagInput && askForm.tags.length > 0) {
            removeTag(askForm.tags[askForm.tags.length - 1]);
        }
    };

    const handleAiSuggest = async () => {
        if (!askForm.body.trim()) return;
        setSuggesting(true);
        try {
            const res = await api.post('/ai/suggest', { content: askForm.body, type: 'question' });
            const { suggestedTitle, suggestedTags } = res.data;
            setAskForm(f => ({
                ...f,
                title: f.title || suggestedTitle,
                tags: [...new Set([...f.tags, ...suggestedTags])],
            }));
        } catch (e) { /* silently fail */ }
        finally { setSuggesting(false); }
    };

    const handleAsk = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const res = await api.post('/qa', { ...askForm, tags: askForm.tags });
            setQuestions(prev => [{ ...res.data, author: { name: currentUser?.name }, answers: [] }, ...prev]);
            setAskForm({ title: '', body: '', subject: '', tags: [] });
            setTagInput('');
            setShowAskForm(false);
        } catch (e) {
            alert(e.response?.data?.error || 'Failed to post question');
        } finally {
            setSubmitting(false);
        }
    };

    const handleAnswer = async (e) => {
        e.preventDefault();
        if (!answerText.trim() || !selected) return;
        setSubmitting(true);
        try {
            const res = await api.post(`/qa/${selected.id}/answers`, { content: answerText });
            setSelected(prev => ({ ...prev, answers: [...(prev.answers || []), res.data] }));
            setAnswerText('');
        } catch (e) {
            alert(e.response?.data?.error || 'Failed to post answer');
        } finally {
            setSubmitting(false);
        }
    };

    const handleVote = async (answerId) => {
        try {
            const res = await api.post(`/qa/answers/${answerId}/vote`);
            setSelected(prev => ({
                ...prev,
                answers: prev.answers.map(a => a.id === answerId ? { ...a, votes: res.data.votes } : a),
            }));
        } catch (e) {}
    };

    const handleAccept = async (answerId) => {
        try {
            await api.post(`/qa/answers/${answerId}/accept`);
            setSelected(prev => ({
                ...prev,
                isAnswered: true,
                answers: prev.answers.map(a => ({ ...a, isAccepted: a.id === answerId })),
            }));
            setQuestions(prev => prev.map(q => q.id === selected.id ? { ...q, isAnswered: true } : q));
        } catch (e) {
            alert(e.response?.data?.error || 'Could not accept answer');
        }
    };

    const handleDeleteQuestionConfirmed = async (id) => {
        try {
            await api.delete(`/qa/${id}`);
            setQuestions(prev => prev.filter(q => q.id !== id));
            if (selected?.id === id) setSelected(null);
        } catch (e) { alert('Failed to delete'); }
    };

    const handleDeleteQuestion = (id) => {
        openConfirm('Delete Question', 'Are you sure you want to delete this question? This cannot be undone.', () => handleDeleteQuestionConfirmed(id));
    };

    const handleDeleteAnswerConfirmed = async (answerId) => {
        try {
            await api.delete(`/qa/answers/${answerId}`);
            setSelected(prev => ({ ...prev, answers: prev.answers.filter(a => a.id !== answerId) }));
        } catch (e) { alert('Failed to delete'); }
    };

    const handleDeleteAnswer = (answerId) => {
        openConfirm('Delete Answer', 'Are you sure you want to delete this answer? This cannot be undone.', () => handleDeleteAnswerConfirmed(answerId));
    };

    // Sort: accepted first, then by votes
    const sortedAnswers = selected?.answers
        ? [...selected.answers].sort((a, b) => {
            if (a.isAccepted && !b.isAccepted) return -1;
            if (!a.isAccepted && b.isAccepted) return 1;
            return (b.votes || 0) - (a.votes || 0);
          })
        : [];

    return (
        <div className="qa-page">
            <NavBar />
            <div className="qa-layout">

                {/* ── Question list panel ── */}
                <aside className="qa-sidebar">
                    <div className="qa-sidebar-header">
                        <h2>Q&A Board</h2>
                        {currentUser ? (
                            <button className="qa-ask-btn" onClick={() => { setShowAskForm(v => !v); setSelected(null); }}>
                                {showAskForm ? 'Cancel' : '+ Ask a Question'}
                            </button>
                        ) : (
                            <Link to="/login" className="qa-ask-btn" style={{ textDecoration: 'none', textAlign: 'center' }}>
                                Login to Ask
                            </Link>
                        )}
                    </div>

                    <input
                        className="qa-search"
                        type="text"
                        placeholder="Search questions..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                    <select className="qa-subject-filter" value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)}>
                        <option value="">All Subjects</option>
                        {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>

                    <div className="qa-question-list">
                        {questions.length === 0 && <p className="qa-empty">No questions yet. Be the first to ask!</p>}
                        {questions.map(q => (
                            <div
                                key={q.id}
                                className={`qa-question-item ${selected?.id === q.id ? 'active' : ''} ${q.isAnswered ? 'answered' : ''}`}
                                onClick={() => openQuestion(q.id)}
                            >
                                <div className="qa-item-top">
                                    {q.isAnswered && <span className="qa-answered-badge">Answered</span>}
                                    {q.subject && <span className="qa-subject-badge">{q.subject}</span>}
                                </div>
                                <span className="qa-item-title">{q.title}</span>
                                {q.tags && (
                                    <div className="qa-item-tags">
                                        {q.tags.split(',').filter(Boolean).map(t => (
                                            <span key={t} className="qa-tag-pill small">#{t}</span>
                                        ))}
                                    </div>
                                )}
                                <span className="qa-item-meta">
                                    {q.author?.name} · {(q.answers || []).length} answer{(q.answers || []).length !== 1 ? 's' : ''}
                                </span>
                            </div>
                        ))}
                        {hasMore && (
                            <button
                                className="qa-load-more-btn"
                                onClick={handleLoadMore}
                                disabled={loadingMore}
                            >
                                {loadingMore ? 'Loading…' : 'Load More'}
                            </button>
                        )}
                    </div>
                </aside>

                {/* ── Main panel ── */}
                <main className="qa-main">

                    {/* Ask form */}
                    {showAskForm && (
                        <form className="qa-ask-form" onSubmit={handleAsk}>
                            <h3>Ask a Question</h3>
                            <input
                                type="text"
                                placeholder="Title — be specific and concise"
                                value={askForm.title}
                                onChange={e => setAskForm(f => ({ ...f, title: e.target.value }))}
                                required
                            />
                            <select value={askForm.subject} onChange={e => setAskForm(f => ({ ...f, subject: e.target.value }))}>
                                <option value="">Select subject (optional)</option>
                                {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                            <div className="qa-textarea-wrapper">
                                <textarea
                                    placeholder="Describe your question in detail..."
                                    value={askForm.body}
                                    onChange={e => setAskForm(f => ({ ...f, body: e.target.value }))}
                                    rows={6}
                                    required
                                />
                                <button
                                    type="button"
                                    className="qa-suggest-btn"
                                    onClick={handleAiSuggest}
                                    disabled={suggesting || !askForm.body.trim()}
                                    title="Auto-suggest title and tags using AI"
                                >
                                    {suggesting ? '✨ Thinking…' : '✨ AI Suggest'}
                                </button>
                            </div>
                            <div className="qa-tag-input-row">
                                {askForm.tags.map(tag => (
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
                            <div className="qa-form-actions">
                                <button type="button" className="btn-cancel-qa" onClick={() => { setShowAskForm(false); setTagInput(''); }}>Cancel</button>
                                <button type="submit" className="btn-post-qa" disabled={submitting}>
                                    {submitting ? 'Posting…' : 'Post Question'}
                                </button>
                            </div>
                        </form>
                    )}

                    {/* Question detail */}
                    {selected && !showAskForm && (
                        <div className="qa-detail">
                            {/* Question */}
                            <div className="qa-question-card">
                                <div className="qa-question-header">
                                    <div>
                                        <div className="qa-question-tags">
                                            {selected.isAnswered && <span className="qa-answered-badge">Answered</span>}
                                            {selected.subject && <span className="qa-subject-badge">{selected.subject}</span>}
                                            {selected.tags && selected.tags.split(',').filter(Boolean).map(t => (
                                                <span key={t} className="qa-tag-pill">#{t}</span>
                                            ))}
                                        </div>
                                        <h2 className="qa-question-title">{selected.title}</h2>
                                        <div className="qa-question-meta">
                                            Asked by <strong>{selected.author?.name}</strong>
                                            &nbsp;·&nbsp;{new Date(selected.createdAt).toLocaleDateString()}
                                        </div>
                                    </div>
                                    {String(selected.authorId) === String(currentUser?.id) && (
                                        <button className="btn-delete-qa" onClick={() => handleDeleteQuestion(selected.id)}>Delete</button>
                                    )}
                                </div>
                                <p className="qa-question-body">{selected.body}</p>
                            </div>

                            {/* Answers */}
                            <div className="qa-answers-section">
                                <h3>{sortedAnswers.length} Answer{sortedAnswers.length !== 1 ? 's' : ''}</h3>
                                {sortedAnswers.map(answer => (
                                    <div key={answer.id} className={`qa-answer-card ${answer.isAccepted ? 'accepted' : ''}`}>
                                        <div className="qa-answer-votes">
                                            <button className="vote-btn" onClick={() => handleVote(answer.id)}>▲</button>
                                            <span className="vote-count">{answer.votes || 0}</span>
                                            {answer.isAccepted && <span className="accepted-check" title="Accepted answer">✓</span>}
                                        </div>
                                        <div className="qa-answer-body">
                                            <p className="qa-answer-content">{answer.content}</p>
                                            <div className="qa-answer-meta">
                                                <div className="qa-answer-author">
                                                    <span className={`author-avatar ${answer.author?.role === 'alumni' ? 'alumni' : ''}`}>
                                                        {answer.author?.name?.charAt(0).toUpperCase()}
                                                    </span>
                                                    <span>{answer.author?.name}</span>
                                                    {answer.author?.role === 'alumni' && <span className="alumni-tag">Alumni</span>}
                                                </div>
                                                <div className="qa-answer-actions">
                                                    {/* Question author can accept */}
                                                    {String(selected.authorId) === String(currentUser?.id) && !answer.isAccepted && (
                                                        <button className="btn-accept" onClick={() => handleAccept(answer.id)}>
                                                            Accept
                                                        </button>
                                                    )}
                                                    {/* Answer author can delete */}
                                                    {String(answer.authorId) === String(currentUser?.id) && (
                                                        <button className="btn-delete-answer" onClick={() => handleDeleteAnswer(answer.id)}>
                                                            Delete
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Answer form — only for logged-in users */}
                            <div className="qa-answer-form-section">
                                <h3>Your Answer</h3>
                                {currentUser ? (
                                    <form onSubmit={handleAnswer}>
                                        <textarea
                                            placeholder="Write your answer here..."
                                            value={answerText}
                                            onChange={e => setAnswerText(e.target.value)}
                                            rows={5}
                                            required
                                        />
                                        <button type="submit" className="btn-post-qa" disabled={submitting}>
                                            {submitting ? 'Posting…' : 'Post Answer'}
                                        </button>
                                    </form>
                                ) : (
                                    <p className="qa-login-prompt">
                                        <Link to="/login">Log in</Link> to post an answer.
                                    </p>
                                )}
                            </div>

                            <button className="btn-back-qa" onClick={() => setSelected(null)}>← Back to questions</button>
                        </div>
                    )}

                    {!selected && !showAskForm && (
                        <div className="qa-placeholder">
                            <div className="qa-placeholder-inner">
                                <h2>Q&A Board</h2>
                                <p>Select a question to read answers, or ask a new one.</p>
                                <p>Alumni answers are highlighted so you know when expert advice is given.</p>
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
