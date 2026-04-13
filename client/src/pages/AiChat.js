import React, { useState, useRef, useEffect, useCallback } from 'react';
import { NavBar } from '../components/NavBar';
import api from '../api';
import { SlPaperPlane, SlDocs, SlCheck, SlMagnifier, SlTrash } from 'react-icons/sl';
import './AiChat.css';

// ── Inline markdown renderer (mirrors AiAssistant) ───────────────────────────
const renderInline = (text, keyPrefix) =>
    text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g).map((seg, i) => {
        const k = `${keyPrefix}-${i}`;
        if (seg.startsWith('`') && seg.endsWith('`') && seg.length > 2)
            return <code key={k} className="aic-inline-code">{seg.slice(1, -1)}</code>;
        if (seg.startsWith('**') && seg.endsWith('**') && seg.length > 4)
            return <strong key={k}>{seg.slice(2, -2)}</strong>;
        if (seg.startsWith('*') && seg.endsWith('*') && seg.length > 2)
            return <em key={k}>{seg.slice(1, -1)}</em>;
        return seg || null;
    });

const MarkdownContent = React.memo(({ text }) => {
    if (!text) return null;
    const lines = text.split('\n');
    const elements = [];
    let listItems = [], listType = null, inCode = false, codeLines = [];

    const flushList = (k) => {
        if (!listItems.length) return;
        const Tag = listType === 'ul' ? 'ul' : 'ol';
        elements.push(<Tag key={`list-${k}`} className="aic-md-list">{listItems}</Tag>);
        listItems = []; listType = null;
    };

    lines.forEach((line, idx) => {
        if (line.startsWith('```')) {
            if (!inCode) { flushList(idx); inCode = true; codeLines = []; }
            else { inCode = false; elements.push(<pre key={`pre-${idx}`} className="aic-code-block"><code>{codeLines.join('\n')}</code></pre>); }
            return;
        }
        if (inCode) { codeLines.push(line); return; }
        if (/^#{1,3} /.test(line)) {
            flushList(idx);
            elements.push(<p key={idx} className="aic-md-heading">{renderInline(line.replace(/^#+\s+/, ''), idx)}</p>);
            return;
        }
        const ulM = line.match(/^[\s]*[-*+]\s+(.*)/);
        if (ulM) { if (listType !== 'ul') { flushList(idx); listType = 'ul'; } listItems.push(<li key={idx}>{renderInline(ulM[1], idx)}</li>); return; }
        const olM = line.match(/^\s*\d+\.\s+(.*)/);
        if (olM) { if (listType !== 'ol') { flushList(idx); listType = 'ol'; } listItems.push(<li key={idx}>{renderInline(olM[1], idx)}</li>); return; }
        if (!line.trim()) { flushList(idx); return; }
        flushList(idx);
        elements.push(<p key={idx} className="aic-md-p">{renderInline(line, idx)}</p>);
    });
    flushList('end');
    return <div className="aic-markdown">{elements}</div>;
});

// ── Source label map ──────────────────────────────────────────────────────────
const SOURCE_LABEL = {
    wiki: 'Wiki',
    question: 'Q&A',
    answer: 'Q&A',
    post: 'Post',
    resource: 'Resource',
    document: 'Your Doc',
};
const SOURCE_COLOR = {
    wiki: '#4a90e2',
    question: '#e67e22',
    answer: '#e67e22',
    post: '#9b59b6',
    resource: '#27ae60',
    document: '#6366f1',
};

const DOC_TYPE_LABEL = {
    textbook: 'Textbook',
    past_paper: 'Past Paper',
    notes: 'Notes',
    other: 'Other',
};

// ── Suggested prompts ─────────────────────────────────────────────────────────
const SUGGESTED = [
    'How do I write a strong thesis statement?',
    'Explain the difference between correlation and causation',
    'What study techniques work best for memorisation?',
    'How do I solve quadratic equations?',
    'Tips for managing study time before exams',
];

const QUICK_ACTIONS = [
    { label: 'Explain a concept', emoji: '💡', template: 'Explain this concept step by step: ' },
    { label: 'Practice problem',  emoji: '✏️', template: 'Give me a practice problem on: ' },
    { label: 'Check my work',     emoji: '✅', template: 'Please check my working and identify any errors:\n\n' },
    { label: 'Study plan',        emoji: '📅', template: 'Create a study plan for: ' },
    { label: 'Essay feedback',    emoji: '📝', template: 'Give feedback on this essay or answer:\n\n' },
];

export const AiChat = () => {
    const [messages, setMessages]   = useState([]);
    const [input, setInput]         = useState('');
    const [loading, setLoading]     = useState(false);
    const [error, setError]         = useState(null);
    const [credits, setCredits]     = useState({ used: 0, limit: 50000 });
    const [expandedSource, setExpandedSource] = useState(null);
    const [copiedId, setCopiedId]   = useState(null);

    // Quiz state
    const [quizMode, setQuizMode]             = useState(false);
    const [quiz, setQuiz]                     = useState(null);
    const [currentQ, setCurrentQ]             = useState(0);
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [revealed, setRevealed]             = useState(false);
    const [score, setScore]                   = useState(0);
    const [quizFinished, setQuizFinished]     = useState(false);
    const [quizLoading, setQuizLoading]       = useState(false);
    const [quizTopic, setQuizTopic]           = useState('');
    const [quizDifficulty, setQuizDifficulty] = useState('medium');
    const [showQuizSetup, setShowQuizSetup]   = useState(false);

    // Subject context
    const [activeSubject, setActiveSubject] = useState(() => {
        const user = JSON.parse(localStorage.getItem('userData') || '{}');
        const parts = (user.subject || '').split(',').map(s => s.trim()).filter(Boolean);
        return parts[0] || '';
    });
    const [userSubjects] = useState(() => {
        const user = JSON.parse(localStorage.getItem('userData') || '{}');
        return (user.subject || '').split(',').map(s => s.trim()).filter(Boolean);
    });

    const [documents, setDocuments]       = useState([]);
    const [showUpload, setShowUpload]     = useState(false);
    const [uploadTitle, setUploadTitle]   = useState('');
    const [uploadSubject, setUploadSubject] = useState('');
    const [uploadType, setUploadType]     = useState('textbook');
    const [uploadFile, setUploadFile]     = useState(null);
    const [uploading, setUploading]       = useState(false);
    const [uploadError, setUploadError]   = useState(null);

    const messagesEndRef = useRef(null);
    const inputRef       = useRef(null);

    useEffect(() => {
        api.get('/ai/credits').then(r => {
            setCredits({ used: r.data.creditsUsed, limit: r.data.creditsLimit });
        }).catch(() => {});
        api.get('/ai/documents').then(r => setDocuments(r.data)).catch(() => {});
    }, []);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, loading]);

    const handleSend = useCallback(async (text) => {
        const trimmed = (text ?? input).trim();
        if (!trimmed || loading) return;

        setInput('');
        if (inputRef.current) inputRef.current.style.height = 'auto';
        setError(null);
        setLoading(true);

        const userMsg = { id: Date.now(), role: 'user', content: trimmed };
        setMessages(prev => [...prev, userMsg]);

        // Build history for context (exclude the message we just added)
        const history = messages.map(m => ({ role: m.role, content: m.content }));

        try {
            const { data } = await api.post('/ai/ask', { message: trimmed, history, subject: activeSubject || undefined });
            const assistantMsg = {
                id: Date.now() + 1,
                role: 'assistant',
                content: data.answer,
                sources: data.sources || [],
            };
            setMessages(prev => [...prev, assistantMsg]);
            setCredits(prev => ({ ...prev, used: data.creditsUsed || prev.used }));
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to get a response');
        } finally {
            setLoading(false);
            inputRef.current?.focus();
        }
    }, [input, loading, messages]);

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    };

    const handleInputChange = (e) => {
        setInput(e.target.value);
        e.target.style.height = 'auto';
        e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
    };

    const handleCopy = (id, text) => {
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 1500);
    };

    const handleUpload = async () => {
        if (!uploadFile || !uploadTitle.trim()) return;
        setUploading(true);
        setUploadError(null);
        const formData = new FormData();
        formData.append('file', uploadFile);
        formData.append('title', uploadTitle.trim());
        formData.append('subject', uploadSubject.trim());
        formData.append('docType', uploadType);
        try {
            const { data } = await api.post('/ai/upload-document', formData);
            setDocuments(prev => [data.document, ...prev]);
            setShowUpload(false);
            setUploadTitle(''); setUploadSubject(''); setUploadFile(null); setUploadType('textbook');
        } catch (err) {
            setUploadError(err.response?.data?.error || 'Upload failed');
        } finally {
            setUploading(false);
        }
    };

    const handleDeleteDoc = async (id) => {
        try {
            await api.delete(`/ai/documents/${id}`);
            setDocuments(prev => prev.filter(d => d.id !== id));
        } catch {}
    };

    const handleQuickAction = (template) => {
        setInput(template);
        setTimeout(() => {
            if (!inputRef.current) return;
            inputRef.current.focus();
            inputRef.current.style.height = 'auto';
            inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + 'px';
            inputRef.current.setSelectionRange(template.length, template.length);
        }, 0);
    };

    const handleSummarize = () =>
        handleSend('Please summarise the key topics and insights from our conversation so far. Be concise and use bullet points.');

    const startQuiz = async () => {
        setQuizLoading(true); setError(null);
        try {
            const res = await api.post('/ai/quiz', { topic: quizTopic || undefined, difficulty: quizDifficulty, numQuestions: 3 });
            setQuiz(res.data.quiz); setCurrentQ(0); setSelectedAnswer(null);
            setRevealed(false); setScore(0); setQuizFinished(false);
            setQuizMode(true); setShowQuizSetup(false);
            setCredits(prev => ({ ...prev, used: res.data.creditsUsed || prev.used }));
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to generate quiz');
        } finally { setQuizLoading(false); }
    };

    const revealAnswer = () => {
        if (selectedAnswer === null) return;
        setRevealed(true);
        if (selectedAnswer === quiz[currentQ].correctIndex) setScore(s => s + 1);
    };

    const nextQuestion = () => {
        if (currentQ + 1 >= quiz.length) setQuizFinished(true);
        else { setCurrentQ(q => q + 1); setSelectedAnswer(null); setRevealed(false); }
    };

    const resetQuiz = () => {
        setQuizMode(false); setQuiz(null); setCurrentQ(0);
        setSelectedAnswer(null); setRevealed(false); setScore(0);
        setQuizFinished(false); setQuizTopic('');
    };

    const creditsRemaining = Math.max(0, credits.limit - credits.used);
    const creditsPercent   = credits.limit > 0 ? (creditsRemaining / credits.limit) * 100 : 100;
    const creditsColor     = creditsPercent > 50 ? '#4ade80' : creditsPercent > 20 ? '#facc15' : '#f87171';

    return (
        <div className="aic-page">
            <NavBar />
            <div className="aic-layout">

                {/* ── Sidebar ── */}
                <aside className="aic-sidebar">
                    <div className="aic-sidebar-header">
                        <span className="aic-sparkle">✨</span>
                        <div>
                            <h2>AI Study Assistant</h2>
                        </div>
                    </div>

                    <div className="aic-credits-block">
                        <div className="aic-credits-bar">
                            <div className="aic-credits-fill" style={{ width: `${creditsPercent}%`, background: creditsColor }} />
                        </div>
                        <span className="aic-credits-label">{creditsRemaining.toLocaleString('en-US')} tokens left today</span>
                    </div>

                    {/* Subject context */}
                    <div className="aic-sidebar-section">
                        <p className="aic-sidebar-section-title">🎯 Subject Focus</p>
                        <div className="aic-subject-pills">
                            <button
                                className={`aic-subject-pill ${!activeSubject ? 'active' : ''}`}
                                onClick={() => setActiveSubject('')}
                            >All</button>
                            {userSubjects.map(s => (
                                <button
                                    key={s}
                                    className={`aic-subject-pill ${activeSubject === s ? 'active' : ''}`}
                                    onClick={() => setActiveSubject(activeSubject === s ? '' : s)}
                                >{s.replace(/ \((HL|SL|AA|AI)\)$/g, '')}</button>
                            ))}
                        </div>
                        {userSubjects.length === 0 && (
                            <p className="aic-docs-empty">Add subjects to your profile to focus AI answers on your curriculum.</p>
                        )}
                        {activeSubject && <span className="aic-subject-active-label">Focused: {activeSubject}</span>}
                    </div>

                    {/* Documents */}
                    <div className="aic-sidebar-section">
                        <div className="aic-docs-header">
                            <p className="aic-sidebar-section-title">📄 My Documents</p>
                            <button className="aic-upload-toggle" onClick={() => { setShowUpload(v => !v); setUploadError(null); }}>
                                {showUpload ? '✕' : '+ Upload'}
                            </button>
                        </div>

                        {showUpload && (
                            <div className="aic-upload-form">
                                {uploadError && <p className="aic-upload-error">{uploadError}</p>}
                                <input
                                    className="aic-upload-input" type="text"
                                    placeholder="Title *"
                                    value={uploadTitle} onChange={e => setUploadTitle(e.target.value)}
                                />
                                <select className="aic-upload-input" value={uploadSubject} onChange={e => setUploadSubject(e.target.value)}>
                                    <option value="">Subject *</option>
                                    <optgroup label="Group 1 – Language &amp; Literature">
                                        {['English A: Literature','English A: Language and Literature','French A: Literature','Spanish A: Literature','Literature and Performance'].map(s => <option key={s} value={s}>{s}</option>)}
                                    </optgroup>
                                    <optgroup label="Group 2 – Language Acquisition">
                                        {['French B','Spanish B','German B','Chinese B','Japanese B','French ab initio','Spanish ab initio','German ab initio'].map(s => <option key={s} value={s}>{s}</option>)}
                                    </optgroup>
                                    <optgroup label="Group 3 – Individuals &amp; Societies">
                                        {['Business Management','Economics','Geography','Global Politics','History','ITGS','Philosophy','Psychology','Social and Cultural Anthropology','World Religions'].map(s => <option key={s} value={s}>{s}</option>)}
                                    </optgroup>
                                    <optgroup label="Group 4 – Sciences">
                                        {['Biology','Chemistry','Computer Science','Design Technology','Physics','Sports, Exercise and Health Science'].map(s => <option key={s} value={s}>{s}</option>)}
                                    </optgroup>
                                    <optgroup label="Group 5 – Mathematics">
                                        {['Mathematics: Analysis and Approaches (AA)','Mathematics: Applications and Interpretation (AI)'].map(s => <option key={s} value={s}>{s}</option>)}
                                    </optgroup>
                                    <optgroup label="Group 6 – The Arts">
                                        {['Dance','Film','Music','Theatre','Visual Arts'].map(s => <option key={s} value={s}>{s}</option>)}
                                    </optgroup>
                                </select>
                                <select className="aic-upload-input" value={uploadType} onChange={e => setUploadType(e.target.value)}>
                                    <option value="textbook">Textbook</option>
                                    <option value="past_paper">Past Paper</option>
                                    <option value="notes">Notes</option>
                                    <option value="other">Other</option>
                                </select>
                                <label className="aic-file-label">
                                    {uploadFile ? uploadFile.name : 'Choose PDF…'}
                                    <input type="file" accept=".pdf" hidden onChange={e => setUploadFile(e.target.files[0] || null)} />
                                </label>
                                <button
                                    className="aic-upload-btn"
                                    onClick={handleUpload}
                                    disabled={uploading || !uploadFile || !uploadTitle.trim()}
                                >
                                    {uploading ? 'Uploading…' : 'Upload'}
                                </button>
                            </div>
                        )}

                        <div className="aic-docs-list">
                            {documents.length === 0 ? (
                                <p className="aic-docs-empty">Upload a textbook or past paper to ground AI answers in your actual materials.</p>
                            ) : documents.map(doc => (
                                <div key={doc.id} className="aic-doc-item">
                                    <div className="aic-doc-info">
                                        <span className="aic-doc-type-badge">{DOC_TYPE_LABEL[doc.docType] || doc.docType}</span>
                                        <span className="aic-doc-title">{doc.title}</span>
                                        {doc.subject && <span className="aic-doc-subject">{doc.subject}</span>}
                                        <span className="aic-doc-meta">{doc.pageCount}p · {doc.chunkCount} chunks</span>
                                    </div>
                                    <button className="aic-doc-delete" onClick={() => handleDeleteDoc(doc.id)} title="Delete">
                                        <SlTrash />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {messages.length === 0 && (
                        <div className="aic-sidebar-section">
                            <p className="aic-sidebar-section-title"><SlMagnifier /> Try asking</p>
                            <div className="aic-suggestions">
                                {SUGGESTED.map((s, i) => (
                                    <button key={i} className="aic-suggestion-chip" onClick={() => handleSend(s)}>
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {messages.length > 0 && (
                        <button className="aic-clear-btn" onClick={() => { setMessages([]); setError(null); }}>
                            Clear conversation
                        </button>
                    )}
                </aside>

                {/* ── Main chat ── */}
                <main className="aic-main">
                    {error && <div className="aic-error-banner">{error}</div>}

                    {quizMode && quiz ? (
                        <div className="aic-quiz-panel">
                            {quizFinished ? (
                                <div className="quiz-results">
                                    <div className="quiz-results-icon">🏆</div>
                                    <h3>Quiz Complete!</h3>
                                    <div className="quiz-score-ring">
                                        <span className="quiz-score-num">{score}</span>
                                        <span className="quiz-score-sep">/</span>
                                        <span className="quiz-score-den">{quiz.length}</span>
                                    </div>
                                    <p className="quiz-score-label">
                                        {score === quiz.length ? 'Perfect score!' : score >= quiz.length / 2 ? 'Nice work!' : 'Keep studying!'}
                                    </p>
                                    <div className="quiz-results-actions">
                                        <button className="quiz-btn quiz-btn-primary" onClick={resetQuiz}>Back to Chat</button>
                                        <button className="quiz-btn quiz-btn-secondary" onClick={() => { resetQuiz(); setShowQuizSetup(true); }}>New Quiz</button>
                                    </div>
                                </div>
                            ) : (
                                <div className="quiz-card">
                                    <div className="quiz-progress">
                                        Question {currentQ + 1} of {quiz.length}
                                        <span className="quiz-difficulty-tag">{quizDifficulty}</span>
                                    </div>
                                    <p className="quiz-question">{quiz[currentQ].question}</p>
                                    <div className="quiz-options">
                                        {quiz[currentQ].options.map((opt, idx) => {
                                            let cls = 'quiz-option';
                                            if (selectedAnswer === idx) cls += ' selected';
                                            if (revealed) {
                                                if (idx === quiz[currentQ].correctIndex) cls += ' correct';
                                                else if (idx === selectedAnswer) cls += ' wrong';
                                            }
                                            return (
                                                <button key={idx} className={cls} onClick={() => !revealed && setSelectedAnswer(idx)} disabled={revealed}>
                                                    {opt}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    {revealed && quiz[currentQ].explanation && (
                                        <div className="quiz-explanation"><strong>Explanation:</strong> {quiz[currentQ].explanation}</div>
                                    )}
                                    <div className="quiz-actions">
                                        {!revealed ? (
                                            <button className="quiz-btn quiz-btn-primary" onClick={revealAnswer} disabled={selectedAnswer === null}>Check Answer</button>
                                        ) : (
                                            <button className="quiz-btn quiz-btn-primary" onClick={nextQuestion}>
                                                {currentQ + 1 >= quiz.length ? 'See Results' : 'Next Question'}
                                            </button>
                                        )}
                                        <button className="quiz-btn quiz-btn-ghost" onClick={resetQuiz}>Exit Quiz</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : showQuizSetup ? (
                        <div className="aic-quiz-panel">
                            <div className="quiz-setup">
                                <h3>📚 Quiz Setup</h3>
                                <label className="quiz-label">
                                    Topic (optional)
                                    <input className="quiz-input" type="text"
                                        placeholder="e.g. Photosynthesis, Newton's Laws…"
                                        value={quizTopic} onChange={e => setQuizTopic(e.target.value)} />
                                </label>
                                <label className="quiz-label">
                                    Difficulty
                                    <div className="quiz-diff-pills">
                                        {['easy', 'medium', 'hard'].map(d => (
                                            <button key={d} className={`quiz-pill ${quizDifficulty === d ? 'active' : ''}`} onClick={() => setQuizDifficulty(d)}>{d}</button>
                                        ))}
                                    </div>
                                </label>
                                <div className="quiz-setup-actions">
                                    <button className="quiz-btn quiz-btn-primary" onClick={startQuiz} disabled={quizLoading}>
                                        {quizLoading ? 'Generating…' : 'Start Quiz'}
                                    </button>
                                    <button className="quiz-btn quiz-btn-ghost" onClick={() => setShowQuizSetup(false)}>Cancel</button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="aic-messages">
                                {messages.length === 0 && !loading && (
                                    <div className="aic-empty">
                                        <div className="aic-empty-icon">✨</div>
                                        <h3>What would you like to know?</h3>
                                        <p>I'll search the StudySphere knowledge base and answer your question.</p>
                                        <div className="aic-quick-actions">
                                            {QUICK_ACTIONS.map((a, i) => (
                                                <button key={i} className="aic-quick-action-card" onClick={() => handleQuickAction(a.template)}>
                                                    <span className="aic-quick-action-emoji">{a.emoji}</span>
                                                    <span className="aic-quick-action-label">{a.label}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {messages.map((msg, idx) => (
                                    <div key={msg.id || idx} className={`aic-message aic-message-${msg.role}`}>
                                        <span className="aic-message-label">
                                            {msg.role === 'user' ? 'You' : 'AI Assistant'}
                                        </span>

                                        <div className="aic-bubble">
                                            {msg.role === 'assistant'
                                                ? <MarkdownContent text={msg.content} />
                                                : <p className="aic-md-p">{msg.content}</p>
                                            }
                                            {msg.role === 'assistant' && (
                                                <button
                                                    className={`aic-copy-btn ${copiedId === (msg.id || idx) ? 'copied' : ''}`}
                                                    onClick={() => handleCopy(msg.id || idx, msg.content)}
                                                    title={copiedId === (msg.id || idx) ? 'Copied!' : 'Copy'}
                                                >
                                                    {copiedId === (msg.id || idx) ? <SlCheck /> : <SlDocs />}
                                                </button>
                                            )}
                                        </div>

                                        {/* Sources */}
                                        {msg.role === 'assistant' && msg.sources?.length > 0 && (
                                            <div className="aic-sources">
                                                <button
                                                    className="aic-sources-toggle"
                                                    onClick={() => setExpandedSource(expandedSource === idx ? null : idx)}
                                                >
                                                    {msg.sources.length} source{msg.sources.length !== 1 ? 's' : ''} used
                                                    {expandedSource === idx ? ' ▲' : ' ▼'}
                                                </button>
                                                {expandedSource === idx && (
                                                    <div className="aic-source-cards">
                                                        {msg.sources.map((s, si) => (
                                                            <div key={si} className="aic-source-card">
                                                                <span
                                                                    className="aic-source-type"
                                                                    style={{ background: SOURCE_COLOR[s.source] || '#888' }}
                                                                >
                                                                    {SOURCE_LABEL[s.source] || s.source}
                                                                </span>
                                                                <span className="aic-source-title">{s.title || 'Untitled'}</span>
                                                                {s.preview && <p className="aic-source-preview">{s.preview}…</p>}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}

                                {loading && (
                                    <div className="aic-thinking">
                                        <div className="aic-thinking-dot" />
                                        <div className="aic-thinking-dot" />
                                        <div className="aic-thinking-dot" />
                                    </div>
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Toolbar */}
                            <div className="aic-toolbar">
                                <button className="aic-toolbar-btn" onClick={() => setShowQuizSetup(true)}>📚 Quiz Me</button>
                                <button className="aic-toolbar-btn" onClick={handleSummarize} disabled={loading || messages.length === 0}>📋 Summarise</button>
                            </div>

                            {/* Input */}
                            <div className="aic-input-row">
                                <textarea
                                    ref={inputRef}
                                    className="aic-input"
                                    placeholder="Ask anything about your studies…"
                                    value={input}
                                    onChange={handleInputChange}
                                    onKeyDown={handleKeyDown}
                                    rows={1}
                                    disabled={loading}
                                />
                                <button
                                    className="aic-send-btn"
                                    onClick={() => handleSend()}
                                    disabled={!input.trim() || loading}
                                    title="Send"
                                >
                                    <SlPaperPlane />
                                </button>
                            </div>
                        </>
                    )}
                </main>
            </div>
        </div>
    );
};
