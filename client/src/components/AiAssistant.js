import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SlClose, SlPaperPlane, SlDocs, SlCheck, SlTrash, SlLike, SlDislike } from 'react-icons/sl';
import api from '../api';
import './AiAssistant.css';
import ConfirmModal from './ConfirmModal';

// ── Lightweight Markdown Renderer ─────────────────────────────────────────────
// Handles: fenced code blocks, inline code, **bold**, *italic*, #/##/### headers,
// unordered lists (- / * / +), ordered lists (1. 2. 3.), plain paragraphs.

const renderInline = (text, keyPrefix) =>
    text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g).map((seg, i) => {
        const k = `${keyPrefix}-${i}`;
        if (seg.startsWith('`') && seg.endsWith('`') && seg.length > 2)
            return <code key={k} className="ai-inline-code">{seg.slice(1, -1)}</code>;
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
        elements.push(<Tag key={`list-${k}`} className="ai-md-list">{listItems}</Tag>);
        listItems = []; listType = null;
    };

    lines.forEach((line, idx) => {
        if (line.startsWith('```')) {
            if (!inCode) { flushList(idx); inCode = true; codeLines = []; }
            else {
                inCode = false;
                elements.push(
                    <pre key={`pre-${idx}`} className="ai-code-block">
                        <code>{codeLines.join('\n')}</code>
                    </pre>
                );
            }
            return;
        }
        if (inCode) { codeLines.push(line); return; }

        if (/^#{1,3} /.test(line)) {
            flushList(idx);
            const content = line.replace(/^#+\s+/, '');
            elements.push(<p key={idx} className="ai-md-heading">{renderInline(content, idx)}</p>);
            return;
        }

        const ulM = line.match(/^[\s]*[-*+]\s+(.*)/);
        if (ulM) {
            if (listType !== 'ul') { flushList(idx); listType = 'ul'; }
            listItems.push(<li key={idx}>{renderInline(ulM[1], idx)}</li>);
            return;
        }

        const olM = line.match(/^\s*\d+\.\s+(.*)/);
        if (olM) {
            if (listType !== 'ol') { flushList(idx); listType = 'ol'; }
            listItems.push(<li key={idx}>{renderInline(olM[1], idx)}</li>);
            return;
        }

        if (!line.trim()) { flushList(idx); return; }

        flushList(idx);
        elements.push(<p key={idx} className="ai-md-p">{renderInline(line, idx)}</p>);
    });

    flushList('end');
    return <div className="ai-markdown">{elements}</div>;
});

// ── Subject-aware suggested prompts ──────────────────────────────────────────
const SUBJECT_PROMPTS = {
    math:             ['Explain the chain rule',         'Walk me through integration by parts', 'How do I solve systems of equations?'],
    physics:          ['Explain Newton\'s laws',          'What is conservation of momentum?',    'How do electric fields work?'],
    chemistry:        ['How do I balance equations?',    'Explain covalent vs ionic bonds',       'What is Le Chatelier\'s principle?'],
    biology:          ['Explain DNA replication',        'What is cellular respiration?',         'Summarise natural selection'],
    'computer science':['Explain Big O notation',        'What is a recursive function?',         'How do hash maps work?'],
    economics:        ['Explain supply and demand',      'What is comparative advantage?',        'How does monetary policy work?'],
    history:          ['How do I write a strong thesis?','Help me analyse a primary source',      'What caused World War I?'],
    english:          ['How do I analyse theme?',        'Tips for structuring an essay',         'Explain the hero\'s journey'],
    psychology:       ['Classical vs operant conditioning?','What is cognitive dissonance?',      'Summarise Maslow\'s hierarchy'],
};

const getSuggestedPrompts = (subject) => {
    if (!subject) return ['Explain a concept I\'m stuck on', 'Help me prepare for my exam', 'Create practice questions'];
    const lower = subject.toLowerCase();
    const key = Object.keys(SUBJECT_PROMPTS).find(k => lower.includes(k));
    return SUBJECT_PROMPTS[key] || ['Explain a concept I\'m stuck on', 'Help me prepare for my exam', 'Create practice questions'];
};

// ── Source type labels & icons ────────────────────────────────────────────────
const SOURCE_LABEL = { wiki: '📖 Wiki', question: '❓ Q&A', answer: '💬 Answer', post: '✍️ Post', resource: '📎 Resource', document: '📄 Your Doc' };

const DOC_TYPE_LABEL = { textbook: 'Textbook', past_paper: 'Past Paper', notes: 'Notes', other: 'Other' };

// ── Component ─────────────────────────────────────────────────────────────────
const AiAssistant = ({ groupId, group, socket, onClose }) => {
    const [messages, setMessages]       = useState([]);
    const [input, setInput]             = useState('');
    const [loading, setLoading]         = useState(false);
    const [error, setError]             = useState(null);
    const [credits, setCredits]         = useState({ used: 0, limit: 50000 });
    const [messageSources, setMessageSources] = useState({}); // assistantMsgId -> sources[]

    // Quiz state
    const [quizMode, setQuizMode]               = useState(false);
    const [quiz, setQuiz]                       = useState(null);
    const [currentQ, setCurrentQ]               = useState(0);
    const [selectedAnswer, setSelectedAnswer]   = useState(null);
    const [revealed, setRevealed]               = useState(false);
    const [score, setScore]                     = useState(0);
    const [quizFinished, setQuizFinished]       = useState(false);
    const [quizLoading, setQuizLoading]         = useState(false);
    const [quizTopic, setQuizTopic]             = useState('');
    const [quizDifficulty, setQuizDifficulty]   = useState('medium');
    const [showQuizSetup, setShowQuizSetup]     = useState(false);
    const [copiedId, setCopiedId]               = useState(null);
    const [feedback, setFeedback]               = useState({}); // msgId → 'up' | 'down'

    const [confirmState, setConfirmState] = useState({ open: false, title: '', message: '', onConfirm: null });
    const openConfirm = (title, message, onConfirm) =>
        setConfirmState({ open: true, title, message, onConfirm });
    const closeConfirm = () =>
        setConfirmState(s => ({ ...s, open: false }));

    // Document panel state
    const [showDocPanel, setShowDocPanel]       = useState(false);
    const [documents, setDocuments]             = useState([]);
    const [showUpload, setShowUpload]           = useState(false);
    const [uploadTitle, setUploadTitle]         = useState('');
    const [uploadSubject, setUploadSubject]     = useState('');
    const [uploadType, setUploadType]           = useState('textbook');
    const [uploadFile, setUploadFile]           = useState(null);
    const [uploading, setUploading]             = useState(false);
    const [uploadError, setUploadError]         = useState(null);

    const messagesEndRef = useRef(null);
    const inputRef       = useRef(null);

    const suggestedPrompts = getSuggestedPrompts(group?.subject);

    // Load documents when panel opens
    useEffect(() => {
        if (!showDocPanel) return;
        api.get('/ai/documents').then(r => setDocuments(r.data)).catch(() => {});
    }, [showDocPanel]);

    const handleUploadDoc = async () => {
        if (!uploadFile || !uploadTitle.trim()) return;
        setUploading(true); setUploadError(null);
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
        } finally { setUploading(false); }
    };

    const handleDeleteDoc = async (id) => {
        try {
            await api.delete(`/ai/documents/${id}`);
            setDocuments(prev => prev.filter(d => d.id !== id));
        } catch {}
    };

    // Load history + credits on mount
    useEffect(() => {
        const load = async () => {
            try {
                const [historyRes, creditsRes] = await Promise.all([
                    api.get(`/ai/history/${groupId}`),
                    api.get('/ai/credits'),
                ]);
                setMessages(historyRes.data);
                setCredits({ used: creditsRes.data.creditsUsed, limit: creditsRes.data.creditsLimit });
            } catch { /* empty history is fine */ }
        };
        load();
    }, [groupId]);

    // Listen for AI responses from other room members
    useEffect(() => {
        if (!socket) return;
        const handle = (data) => {
            if (String(data.room) !== String(groupId)) return;
            setMessages(prev => {
                if (prev.some(m => m.id === data.userMessage?.id)) return prev;
                return [...prev, data.userMessage, data.assistantMessage];
            });
            if (data.sources?.length && data.assistantMessage?.id) {
                setMessageSources(prev => ({ ...prev, [data.assistantMessage.id]: data.sources }));
            }
        };
        socket.on('ai_response', handle);
        return () => socket.off('ai_response', handle);
    }, [socket, groupId]);

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, loading]);

    // ── Send message ──────────────────────────────────────────────────────────
    const handleSend = useCallback(async (text) => {
        const trimmed = (text ?? input).trim();
        if (!trimmed || loading) return;

        setInput('');
        if (inputRef.current) { inputRef.current.style.height = 'auto'; }
        setError(null);
        setLoading(true);

        const tempId = `temp-${Date.now()}`;
        setMessages(prev => [...prev, { id: tempId, role: 'user', content: trimmed, createdAt: new Date().toISOString() }]);

        try {
            const { data } = await api.post('/ai/chat', { groupId, message: trimmed });
            const { userMessage, assistantMessage, creditsUsed, creditsLimit, sources } = data;

            setMessages(prev => [...prev.filter(m => m.id !== tempId), userMessage, assistantMessage]);
            setCredits({ used: creditsUsed, limit: creditsLimit });

            if (sources?.length && assistantMessage?.id) {
                setMessageSources(prev => ({ ...prev, [assistantMessage.id]: sources }));
            }

            if (socket) {
                socket.emit('ai_response', { room: groupId, userMessage, assistantMessage, sources });
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to get AI response');
            setMessages(prev => prev.filter(m => m.id !== tempId));
        } finally {
            setLoading(false);
            inputRef.current?.focus();
        }
    }, [input, loading, groupId, socket]);

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    };

    const handleInputChange = (e) => {
        setInput(e.target.value);
        e.target.style.height = 'auto';
        e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
    };

    const submitFeedback = async (idx, rating) => {
        const msg = messages[idx];
        if (!msg || msg.role !== 'assistant') return;
        const msgKey = msg.id || idx;
        if (feedback[msgKey]) return;

        let queryText = '';
        for (let i = idx - 1; i >= 0; i--) {
            if (messages[i].role === 'user') { queryText = messages[i].content; break; }
        }
        const sources = messageSources[msg.id] || [];

        setFeedback(prev => ({ ...prev, [msgKey]: rating }));
        try {
            await api.post('/ai/feedback', {
                queryText: queryText.slice(0, 1000),
                messageId: typeof msg.id === 'number' ? msg.id : undefined,
                rating,
                clickedSources: sources.map(s => ({ source: s.source, sourceId: s.sourceId })),
            });
        } catch {
            setFeedback(prev => { const next = { ...prev }; delete next[msgKey]; return next; });
        }
    };

    const handleCopy = (msgId, text) => {
        navigator.clipboard.writeText(text);
        setCopiedId(msgId);
        setTimeout(() => setCopiedId(null), 1500);
    };

    const handleClearChatConfirmed = async () => {
        try {
            await api.delete(`/ai/history/${groupId}`);
            setMessages([]);
            setMessageSources({});
        } catch { setError('Failed to clear history'); }
    };

    const handleClearChat = () => {
        openConfirm('Clear Chat History', 'Clear all AI conversation history for this room? This cannot be undone.', handleClearChatConfirmed);
    };

    // ── Summarize shortcut ────────────────────────────────────────────────────
    const handleSummarize = () =>
        handleSend('Please summarise the key topics and takeaways from our study room chat so far. Be concise and use bullet points.');

    // ── Quiz handlers ─────────────────────────────────────────────────────────
    const startQuiz = async () => {
        setQuizLoading(true); setError(null);
        try {
            const res = await api.post('/ai/quiz', { groupId, topic: quizTopic || undefined, difficulty: quizDifficulty, numQuestions: 3 });
            setQuiz(res.data.quiz); setCurrentQ(0); setSelectedAnswer(null);
            setRevealed(false); setScore(0); setQuizFinished(false);
            setQuizMode(true); setShowQuizSetup(false);
            setCredits({ used: res.data.creditsUsed, limit: res.data.creditsLimit });
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

    // ── Credits bar ───────────────────────────────────────────────────────────
    const creditsRemaining = Math.max(0, credits.limit - credits.used);
    const creditsPercent   = credits.limit > 0 ? (creditsRemaining / credits.limit) * 100 : 100;
    const creditsColor     = creditsPercent > 50 ? '#4ade80' : creditsPercent > 20 ? '#facc15' : '#f87171';

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="ai-sidebar">

            {/* Header */}
            <div className="ai-sidebar-header">
                <div className="ai-header-left">
                    <span className="ai-sparkle">✨</span>
                    <div className="ai-header-text">
                        <h3>AI Assistant</h3>
                        {group?.subject && <span className="ai-subject-tag">{group.subject}</span>}
                    </div>
                </div>
                <div className="ai-header-actions">
                    {messages.length > 0 && (
                        <button className="ai-icon-btn" onClick={handleClearChat} title="Clear history">
                            <SlTrash />
                        </button>
                    )}
                    <button className="ai-icon-btn" onClick={onClose} title="Close">
                        <SlClose />
                    </button>
                </div>
            </div>

            {/* Credits bar */}
            <div className="ai-credits-row">
                <div className="ai-credits-bar">
                    <div className="ai-credits-fill" style={{ width: `${creditsPercent}%`, background: creditsColor }} />
                </div>
                <span className="ai-credits-text">{creditsRemaining.toLocaleString('en-US')} tokens left today</span>
            </div>

            {error && <div className="ai-error-banner">{error}</div>}

            {/* ── Quiz Mode ── */}
            {quizMode && quiz ? (
                <div className="ai-quiz-container">
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

            ) : showDocPanel ? (
                <div className="ai-quiz-container">
                    <div className="quiz-setup">
                        <div className="ai-doc-panel-header">
                            <h3>📄 My Documents</h3>
                            <button className="quiz-btn quiz-btn-ghost" onClick={() => { setShowDocPanel(false); setShowUpload(false); }}>✕</button>
                        </div>

                        <button
                            className="ai-doc-upload-toggle"
                            onClick={() => { setShowUpload(v => !v); setUploadError(null); }}
                        >
                            {showUpload ? '✕ Cancel' : '+ Upload PDF'}
                        </button>

                        {showUpload && (
                            <div className="ai-doc-upload-form">
                                {uploadError && <p className="ai-doc-upload-error">{uploadError}</p>}
                                <input className="quiz-input" type="text" placeholder="Title *"
                                    value={uploadTitle} onChange={e => setUploadTitle(e.target.value)} />
                                <select className="quiz-input" value={uploadSubject} onChange={e => setUploadSubject(e.target.value)}>
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
                                <select className="quiz-input" value={uploadType} onChange={e => setUploadType(e.target.value)}>
                                    <option value="textbook">Textbook</option>
                                    <option value="past_paper">Past Paper</option>
                                    <option value="notes">Notes</option>
                                    <option value="other">Other</option>
                                </select>
                                <label className="ai-doc-file-label">
                                    {uploadFile ? uploadFile.name : 'Choose PDF…'}
                                    <input type="file" accept=".pdf" hidden onChange={e => setUploadFile(e.target.files[0] || null)} />
                                </label>
                                <button className="quiz-btn quiz-btn-primary" onClick={handleUploadDoc}
                                    disabled={uploading || !uploadFile || !uploadTitle.trim()}>
                                    {uploading ? 'Uploading…' : 'Upload'}
                                </button>
                            </div>
                        )}

                        <div className="ai-doc-list">
                            {documents.length === 0 ? (
                                <p className="ai-doc-empty">No documents yet. Upload a textbook or past paper to ground AI answers in your materials.</p>
                            ) : documents.map(doc => (
                                <div key={doc.id} className="ai-doc-item">
                                    <div className="ai-doc-info">
                                        <span className="ai-doc-type-badge">{DOC_TYPE_LABEL[doc.docType] || doc.docType}</span>
                                        <span className="ai-doc-title">{doc.title}</span>
                                        {doc.subject && <span className="ai-doc-subject">{doc.subject}</span>}
                                        <span className="ai-doc-meta">{doc.pageCount}p · {doc.chunkCount} chunks</span>
                                    </div>
                                    <button className="ai-doc-delete" onClick={() => handleDeleteDoc(doc.id)} title="Delete">
                                        <SlTrash />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

            ) : showQuizSetup ? (
                <div className="ai-quiz-container">
                    <div className="quiz-setup">
                        <h3>📚 Quiz Setup</h3>
                        <label className="quiz-label">
                            Topic (optional)
                            <input className="quiz-input" type="text"
                                placeholder={group?.subject ? `e.g. ${group.subject} topics…` : 'e.g. Photosynthesis…'}
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
                    {/* Messages */}
                    <div className="ai-messages">
                        {messages.length === 0 && !loading ? (
                            <div className="ai-empty-state">
                                <div className="ai-empty-icon">✨</div>
                                <p>Ask me anything about <strong>{group?.subject || 'what you\'re studying'}</strong>.</p>
                                <div className="ai-suggested-prompts">
                                    {suggestedPrompts.map((prompt, i) => (
                                        <button key={i} className="ai-prompt-chip" onClick={() => handleSend(prompt)}>
                                            {prompt}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <>
                                {messages.map((msg, idx) => (
                                    <div key={msg.id || idx} className={`ai-message ${msg.role}`}>
                                        <span className="ai-message-sender">
                                            {msg.role === 'user' ? (msg.User?.name || 'You') : 'AI Assistant'}
                                        </span>
                                        <div className="ai-message-bubble">
                                            {msg.role === 'assistant'
                                                ? <MarkdownContent text={msg.content} />
                                                : <p className="ai-md-p">{msg.content}</p>
                                            }
                                            {msg.role === 'assistant' && (
                                                <div className="ai-bubble-actions">
                                                    <button
                                                        className={`ai-feedback-btn ${feedback[msg.id || idx] === 'up' ? 'active up' : ''}`}
                                                        onClick={() => submitFeedback(idx, 'up')}
                                                        disabled={!!feedback[msg.id || idx]}
                                                        title="Helpful"
                                                    >
                                                        <SlLike />
                                                    </button>
                                                    <button
                                                        className={`ai-feedback-btn ${feedback[msg.id || idx] === 'down' ? 'active down' : ''}`}
                                                        onClick={() => submitFeedback(idx, 'down')}
                                                        disabled={!!feedback[msg.id || idx]}
                                                        title="Not helpful"
                                                    >
                                                        <SlDislike />
                                                    </button>
                                                    <button
                                                        className={`ai-copy-btn ${copiedId === (msg.id || idx) ? 'copied' : ''}`}
                                                        onClick={() => handleCopy(msg.id || idx, msg.content)}
                                                        title={copiedId === (msg.id || idx) ? 'Copied!' : 'Copy'}
                                                    >
                                                        {copiedId === (msg.id || idx) ? <SlCheck /> : <SlDocs />}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                        {/* Source chips for assistant messages */}
                                        {msg.role === 'assistant' && messageSources[msg.id]?.length > 0 && (
                                            <div className="ai-sources">
                                                <span className="ai-sources-label">Sources:</span>
                                                {messageSources[msg.id].map((s, i) => (
                                                    <span key={i} className="ai-source-chip">
                                                        {SOURCE_LABEL[s.source] || s.source} — {s.title}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {loading && (
                                    <div className="ai-thinking">
                                        <div className="ai-thinking-dot" />
                                        <div className="ai-thinking-dot" />
                                        <div className="ai-thinking-dot" />
                                    </div>
                                )}
                                <div ref={messagesEndRef} />
                            </>
                        )}
                    </div>

                    {/* Toolbar */}
                    <div className="ai-toolbar">
                        <button className="ai-toolbar-btn" onClick={() => setShowQuizSetup(true)}>📚 Quiz Me</button>
                        <button className="ai-toolbar-btn" onClick={handleSummarize} disabled={loading}>📋 Summarise</button>
                        <button className="ai-toolbar-btn" onClick={() => { setShowDocPanel(true); setShowUpload(false); }}>📄 Docs</button>
                    </div>

                    {/* Input */}
                    <div className="ai-input-area">
                        <textarea
                            ref={inputRef}
                            className="ai-input"
                            placeholder={`Ask about ${group?.subject || 'your topic'}…`}
                            value={input}
                            onChange={handleInputChange}
                            onKeyDown={handleKeyDown}
                            rows={1}
                            disabled={loading}
                        />
                        <button className="ai-send-btn" onClick={() => handleSend()} disabled={!input.trim() || loading} title="Send">
                            <SlPaperPlane />
                        </button>
                    </div>
                </>
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
};

export default AiAssistant;
