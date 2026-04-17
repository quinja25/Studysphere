import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import './TryAiWidget.css';

const SAMPLES = [
    'Explain the chain rule with an IB Maths AA HL example.',
    'Compare oxidation and reduction in the ETC (IB Bio HL).',
    'What does "evaluate" mean in IB mark schemes?',
];

const MAX_CHARS = 200;

export const TryAiWidget = () => {
    const [prompt, setPrompt] = useState('');
    const [answer, setAnswer] = useState(null);
    const [sources, setSources] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [rateLimited, setRateLimited] = useState(false);

    const submit = async (text) => {
        const message = (text ?? prompt).trim();
        if (!message || loading) return;

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
                setError(err.response?.data?.error || 'Free preview used up — sign up free to keep going.');
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

    return (
        <section className="try-ai reveal" id="try-ai">
            <div className="try-ai-inner">
                <div className="try-ai-header">
                    <span className="try-ai-eyebrow">Try it now — no signup</span>
                    <h2 className="try-ai-title">
                        The only AI trained on the <span className="gradient-text">IB curriculum</span>
                    </h2>
                    <p className="try-ai-sub">
                        IB command terms, HL/SL depth, past-paper conventions. Ask anything — get an
                        answer cited against real IB study material.
                    </p>
                </div>

                <div className="try-ai-box">
                    <div className="try-ai-samples">
                        {SAMPLES.map((s, i) => (
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

                    <form
                        className="try-ai-form"
                        onSubmit={(e) => { e.preventDefault(); submit(); }}
                    >
                        <textarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value.slice(0, MAX_CHARS))}
                            placeholder="Ask about IB Bio HL, Chem SL, Maths AA, History, TOK…"
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
                                {loading ? 'Thinking…' : 'Ask the IB AI →'}
                            </button>
                        </div>
                    </form>

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

                    {answer && !error && (
                        <div className="try-ai-answer">
                            <div className="try-ai-answer-label">✨ Answer</div>
                            <div className="try-ai-answer-body">{answer}</div>
                            {sources.length > 0 && (
                                <div className="try-ai-sources">
                                    <span className="try-ai-sources-label">
                                        Grounded in {sources.length} source{sources.length === 1 ? '' : 's'}:
                                    </span>
                                    {sources.map((s, i) => (
                                        <span key={i} className="try-ai-source-pill">
                                            {s.source} · {s.title}
                                        </span>
                                    ))}
                                </div>
                            )}
                            <div className="try-ai-followup">
                                Want the full study room, past papers, and alumni Q&amp;A?{' '}
                                <Link to="/registration" className="try-ai-signup-link">
                                    Sign up free →
                                </Link>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
};

export default TryAiWidget;
