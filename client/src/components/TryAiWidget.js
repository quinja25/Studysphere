import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import './TryAiWidget.css';

const SUBJECTS = [
    {
        label: 'Economics',
        emoji: '📈',
        samples: [
            'Explain why demand for cigarettes is price inelastic and the tax implications.',
            'Evaluate expansionary fiscal policy during a recession.',
            'What is the Keynesian multiplier? Give an IB example.',
        ],
    },
    {
        label: 'Biology',
        emoji: '🧬',
        samples: [
            'Compare oxidation and reduction in the electron transport chain (HL).',
            'Explain how enzymes lower activation energy with a diagram.',
            'What is the difference between mitosis and meiosis?',
        ],
    },
    {
        label: 'Chemistry',
        emoji: '⚗️',
        samples: [
            'Explain the difference between SN1 and SN2 reactions.',
            'What is Le Chatelier\'s principle? Give an industrial example.',
            'How do you calculate pH for a weak acid buffer?',
        ],
    },
    {
        label: 'Physics',
        emoji: '⚡',
        samples: [
            'Explain the photoelectric effect and Einstein\'s equation.',
            'What is the difference between nuclear fission and fusion?',
            'Derive the equations of uniform circular motion.',
        ],
    },
    {
        label: 'Maths',
        emoji: '∫',
        samples: [
            'Explain the chain rule with an IB Maths AA HL example.',
            'What is the binomial theorem and when do you use it?',
            'How do you find the area between two curves using integration?',
        ],
    },
];

const MAX_CHARS = 200;

export const TryAiWidget = () => {
    const [activeSubject, setActiveSubject] = useState(0);
    const [prompt, setPrompt] = useState('');
    const [answer, setAnswer] = useState(null);
    const [sources, setSources] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [rateLimited, setRateLimited] = useState(false);

    const submit = async (text) => {
        const message = (text ?? prompt).trim();
        if (!message || loading || rateLimited) return;

        setLoading(true);
        setError(null);
        setAnswer(null);
        setSources([]);

        try {
            const { data } = await api.post('/public/ai-try', { message });
            setAnswer(data.answer);
            setSources(data.sources || []);
        } catch (err) {
            const status = err.response?.status;
            if (status === 429) {
                setRateLimited(true);
                setError(err.response?.data?.error || 'Free preview limit reached — sign up free to continue.');
            } else {
                setError(err.response?.data?.error || 'Something went wrong. Try again in a moment.');
            }
        } finally {
            setLoading(false);
        }
    };

    const onChip = (text) => {
        setPrompt(text);
        submit(text);
    };

    const onTabChange = (i) => {
        setActiveSubject(i);
        setPrompt('');
        setAnswer(null);
        setSources([]);
        setError(null);
    };

    const subject = SUBJECTS[activeSubject];
    const isPastPaper = (s) => s.source === 'global_document';

    return (
        <section className="try-ai" id="try-ai">
            <div className="try-ai-inner">
                <div className="try-ai-header">
                    <span className="try-ai-eyebrow">Try it now — no signup needed</span>
                    <h2 className="try-ai-title">
                        Ask the AI trained on <span className="gradient-text">real IB past papers.</span>
                    </h2>
                    <p className="try-ai-sub">
                        Not generic ChatGPT. Answers grounded in IB past papers, mark schemes, and
                        curriculum content — with sources cited.
                    </p>
                </div>

                <div className="try-ai-box">
                    {/* Subject tabs */}
                    <div className="try-ai-tabs">
                        {SUBJECTS.map((s, i) => (
                            <button
                                key={s.label}
                                className={`try-ai-tab ${i === activeSubject ? 'active' : ''}`}
                                onClick={() => onTabChange(i)}
                                type="button"
                            >
                                <span>{s.emoji}</span> {s.label}
                            </button>
                        ))}
                    </div>

                    {/* Sample chips */}
                    <div className="try-ai-samples">
                        {subject.samples.map((s, i) => (
                            <button
                                key={i}
                                type="button"
                                className="try-ai-chip"
                                onClick={() => onChip(s)}
                                disabled={loading || rateLimited}
                            >
                                {s}
                            </button>
                        ))}
                    </div>

                    {/* Input */}
                    <form className="try-ai-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
                        <textarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value.slice(0, MAX_CHARS))}
                            placeholder={`Ask an IB ${subject.label} question…`}
                            rows={2}
                            disabled={loading || rateLimited}
                            className="try-ai-input"
                        />
                        <div className="try-ai-row">
                            <span className="try-ai-count">{prompt.length}/{MAX_CHARS}</span>
                            <button
                                type="submit"
                                className="btn-primary"
                                disabled={loading || rateLimited || !prompt.trim()}
                            >
                                {loading
                                    ? <><span className="try-ai-spinner" /> Searching past papers…</>
                                    : 'Ask the IB AI →'
                                }
                            </button>
                        </div>
                    </form>

                    {/* Error */}
                    {error && (
                        <div className={`try-ai-error ${rateLimited ? 'rate-limited' : ''}`}>
                            <span>{error}</span>
                            {rateLimited && (
                                <Link to="/registration" className="btn-primary btn-sm">
                                    Sign up free →
                                </Link>
                            )}
                        </div>
                    )}

                    {/* Answer */}
                    {answer && !error && (
                        <div className="try-ai-answer">
                            <div className="try-ai-answer-label">
                                <span className="try-ai-answer-dot" />
                                Answer
                            </div>
                            <div className="try-ai-answer-body">{answer}</div>

                            {sources.length > 0 && (
                                <div className="try-ai-sources">
                                    <span className="try-ai-sources-label">
                                        Grounded in {sources.length} IB source{sources.length !== 1 ? 's' : ''}:
                                    </span>
                                    <div className="try-ai-source-pills">
                                        {sources.map((s, i) => (
                                            <span
                                                key={i}
                                                className={`try-ai-source-pill ${isPastPaper(s) ? 'past-paper' : ''}`}
                                            >
                                                {isPastPaper(s) ? '📄 Past Paper' : '📚'} · {s.title || s.source}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="try-ai-followup">
                                Want unlimited questions, your own notes, study rooms & alumni Q&A?{' '}
                                <Link to="/registration" className="try-ai-signup-link">
                                    Sign up free →
                                </Link>
                            </div>
                        </div>
                    )}
                </div>

                <p className="try-ai-limit-note">3 free questions per day · No credit card needed</p>
            </div>
        </section>
    );
};

export default TryAiWidget;
