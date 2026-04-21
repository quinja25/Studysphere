import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import Logo from '../Logo1.svg';
import { LiveStatsStrip } from '../components/LiveStatsStrip';
import { TryAiWidget } from '../components/TryAiWidget';
import './Waitlist.css';

const CURRICULA = ['IB Diploma', 'A-Level', 'AP', 'GCSE / IGCSE', 'Other'];

const SOCIAL_PROOF = [
    { initials: 'AK', name: 'Aryan K.', tag: 'IB Maths AA HL', quote: 'Finally an AI that actually understands mark scheme language.' },
    { initials: 'SL', name: 'Sofia L.', tag: 'IB Biology HL', quote: 'The study rooms kept me accountable through my entire revision period.' },
    { initials: 'JM', name: 'James M.', tag: 'A-Level Chemistry', quote: 'Uploaded my teacher\'s notes and it answered questions from them directly.' },
];

const FEATURES = [
    { icon: '🤖', label: 'AI trained on IB', desc: 'Not adapted from generic tools — built around command terms, HL/SL depth, and mark scheme conventions.' },
    { icon: '📄', label: 'Learn from your notes', desc: 'Upload your textbooks and past papers. The AI answers questions based on your own materials.' },
    { icon: '🎥', label: 'Live study rooms', desc: 'HD video, whiteboard, screen share, and a Pomodoro timer — all in one room with your classmates.' },
    { icon: '🎓', label: 'Alumni mentors', desc: 'Connect with people who already passed your exact exams. Ask questions, get endorsed answers.' },
    { icon: '🔥', label: 'Streaks & XP', desc: 'Build a daily study habit. Your streak lives on your public profile — social stakes that actually work.' },
    { icon: '📚', label: 'Knowledge base', desc: 'Wiki articles, answered Q&A, peer-reviewed resources — all AI-indexed and instantly searchable.' },
];

const useScrollReveal = () => {
    useEffect(() => {
        const els = document.querySelectorAll('.wl-reveal');
        const observer = new IntersectionObserver(
            (entries) => entries.forEach(e => {
                if (e.isIntersecting) {
                    e.target.style.opacity = '1';
                    e.target.style.transform = 'translateY(0)';
                    observer.unobserve(e.target);
                }
            }),
            { threshold: 0.08, rootMargin: '0px 0px -32px 0px' }
        );
        els.forEach(el => observer.observe(el));
        return () => observer.disconnect();
    }, []);
};

const CountUp = ({ target }) => {
    const [count, setCount] = useState(0);
    const ref = useRef(null);

    useEffect(() => {
        if (target <= 0) return;
        const duration = 1200;
        const steps = 40;
        const increment = target / steps;
        let current = 0;
        const timer = setInterval(() => {
            current = Math.min(current + increment, target);
            setCount(Math.floor(current));
            if (current >= target) clearInterval(timer);
        }, duration / steps);
        return () => clearInterval(timer);
    }, [target]);

    return <span ref={ref}>{count.toLocaleString()}</span>;
};

export const Waitlist = () => {
    useScrollReveal();
    const [email, setEmail] = useState('');
    const [role, setRole] = useState('student');
    const [curriculum, setCurriculum] = useState('IB Diploma');
    const [status, setStatus] = useState('idle'); // idle | loading | success | duplicate | error
    const [errorMsg, setErrorMsg] = useState('');
    const [count, setCount] = useState(0);

    useEffect(() => {
        fetch('/public/waitlist/count')
            .then(r => r.json())
            .then(d => setCount(d.count || 0))
            .catch(() => {});
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!email.trim() || status === 'loading') return;
        setStatus('loading');
        setErrorMsg('');
        try {
            const res = await fetch('/public/waitlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim(), role, curriculum }),
            });
            const data = await res.json();
            if (!res.ok) {
                setErrorMsg(data.error || 'Something went wrong.');
                setStatus('error');
                return;
            }
            setCount(data.count || count + 1);
            setStatus(data.alreadyRegistered ? 'duplicate' : 'success');
        } catch {
            setErrorMsg('Network error. Please try again.');
            setStatus('error');
        }
    };

    const title = 'StudySphere — Early Access · IB Study Platform';
    const desc  = 'The only AI study platform built end-to-end for IB. Join the waitlist for early access.';

    return (
        <div className="wl-page">
            <Helmet>
                <title>{title}</title>
                <meta name="description" content={desc} />
                <meta property="og:title" content={title} />
                <meta property="og:description" content={desc} />
                <meta property="og:type" content="website" />
                <meta name="twitter:card" content="summary_large_image" />
                <meta name="twitter:title" content={title} />
                <meta name="twitter:description" content={desc} />
            </Helmet>

            {/* ── Nav ── */}
            <nav className="wl-nav">
                <div className="wl-nav-inner">
                    <Link to="/" className="wl-logo">
                        <img src={Logo} alt="StudySphere" className="wl-logo-img" />
                    </Link>
                    <div className="wl-nav-links">
                        <a href="#features">Features</a>
                        <a href="#try-ai">Try the AI</a>
                        <Link to="/for-mentors">For Mentors</Link>
                    </div>
                    <div className="wl-nav-actions">
                        <Link to="/login" className="wl-btn-ghost">Log in</Link>
                    </div>
                </div>
            </nav>

            {/* ── Hero ── */}
            <section className="wl-hero">
                <div className="wl-hero-glow wl-glow-1" />
                <div className="wl-hero-glow wl-glow-2" />
                <div className="wl-hero-glow wl-glow-3" />

                <div className="wl-hero-inner">
                    <div className="wl-hero-copy">
                        <div className="wl-badge wl-reveal">
                            <span className="wl-badge-dot" />
                            Early Access · Opening Soon
                        </div>

                        <h1 className="wl-headline wl-reveal">
                            The AI study platform<br />
                            <span className="wl-grad">built for IB students.</span>
                        </h1>

                        <p className="wl-sub wl-reveal">
                            Upload your notes. Study with classmates. Ask the AI that actually knows
                            what command terms mean. Get mentored by alumni who passed your exact exams.
                        </p>

                        {count > 0 && (
                            <div className="wl-counter wl-reveal">
                                <CountUp target={count} />
                                <span className="wl-counter-label">students already on the list</span>
                            </div>
                        )}
                    </div>

                    {/* ── Signup card ── */}
                    <div className="wl-card wl-reveal">
                        {status === 'success' ? (
                            <div className="wl-success">
                                <div className="wl-success-icon">🎉</div>
                                <h3>You're on the list!</h3>
                                <p>We'll email you the moment early access opens. You're number <strong>{count}</strong> in line.</p>
                                <a href="#try-ai" className="wl-btn-primary wl-btn-full">Try the AI now →</a>
                            </div>
                        ) : status === 'duplicate' ? (
                            <div className="wl-success">
                                <div className="wl-success-icon">✅</div>
                                <h3>Already registered!</h3>
                                <p>You're already on the waitlist. We'll let you know when access opens.</p>
                                <a href="#try-ai" className="wl-btn-primary wl-btn-full">Try the AI now →</a>
                            </div>
                        ) : (
                            <>
                                <div className="wl-card-header">
                                    <h2>Get early access</h2>
                                    <p>Be first when we open. No spam, ever.</p>
                                </div>
                                <form className="wl-form" onSubmit={handleSubmit}>
                                    <input
                                        className="wl-input"
                                        type="email"
                                        placeholder="your@email.com"
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        required
                                        disabled={status === 'loading'}
                                    />
                                    <div className="wl-form-row">
                                        <select
                                            className="wl-select"
                                            value={role}
                                            onChange={e => setRole(e.target.value)}
                                            disabled={status === 'loading'}
                                        >
                                            <option value="student">Student</option>
                                            <option value="alumni">Alumni / Mentor</option>
                                            <option value="other">Other</option>
                                        </select>
                                        <select
                                            className="wl-select"
                                            value={curriculum}
                                            onChange={e => setCurriculum(e.target.value)}
                                            disabled={status === 'loading'}
                                        >
                                            {CURRICULA.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                    {status === 'error' && (
                                        <p className="wl-form-error">{errorMsg}</p>
                                    )}
                                    <button
                                        type="submit"
                                        className="wl-btn-primary wl-btn-full"
                                        disabled={status === 'loading' || !email.trim()}
                                    >
                                        {status === 'loading' ? 'Joining…' : 'Join the waitlist →'}
                                    </button>
                                </form>
                                <p className="wl-card-note">Already have an account? <Link to="/login">Log in</Link></p>
                            </>
                        )}
                    </div>
                </div>
            </section>

            {/* ── Live stats ── */}
            <div className="wl-stats-wrap">
                <LiveStatsStrip />
            </div>

            {/* ── Features ── */}
            <section className="wl-features" id="features">
                <div className="wl-section-inner">
                    <p className="wl-section-tag wl-reveal">What's coming</p>
                    <h2 className="wl-section-title wl-reveal">
                        Everything IB students actually need.<br />
                        <span className="wl-grad">Nothing they don't.</span>
                    </h2>
                    <div className="wl-features-grid">
                        {FEATURES.map((f, i) => (
                            <div key={i} className="wl-feature-card wl-reveal" style={{ transitionDelay: `${i * 60}ms` }}>
                                <span className="wl-feature-icon">{f.icon}</span>
                                <h3 className="wl-feature-title">{f.label}</h3>
                                <p className="wl-feature-desc">{f.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Try AI ── */}
            <div id="try-ai" className="wl-ai-wrap wl-reveal">
                <div className="wl-section-inner">
                    <p className="wl-section-tag">Try it now</p>
                    <h2 className="wl-section-title" style={{ marginBottom: '2rem' }}>
                        Ask the IB AI anything.
                    </h2>
                </div>
                <TryAiWidget />
            </div>

            {/* ── Social proof ── */}
            <section className="wl-testimonials wl-reveal">
                <div className="wl-section-inner">
                    <p className="wl-section-tag">Early users</p>
                    <h2 className="wl-section-title">Students who tried the beta.</h2>
                    <div className="wl-testimonials-grid">
                        {SOCIAL_PROOF.map((t, i) => (
                            <div key={i} className="wl-testimonial-card">
                                <p className="wl-testimonial-quote">"{t.quote}"</p>
                                <div className="wl-testimonial-author">
                                    <div className="wl-testimonial-avatar">{t.initials}</div>
                                    <div>
                                        <div className="wl-testimonial-name">{t.name}</div>
                                        <div className="wl-testimonial-tag">{t.tag}</div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Bottom CTA ── */}
            <section className="wl-cta wl-reveal">
                <div className="wl-cta-glow" />
                <div className="wl-cta-inner">
                    <h2 className="wl-cta-title">Your exams aren't waiting.<br />Your spot is.</h2>
                    <p className="wl-cta-sub">Join {count > 0 ? count.toLocaleString() : 'hundreds of'} students already on the list.</p>
                    <a href="#" onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                        className="wl-btn-primary wl-btn-xl">
                        Get early access →
                    </a>
                </div>
            </section>

            {/* ── Footer ── */}
            <footer className="wl-footer">
                <div className="wl-footer-inner">
                    <img src={Logo} alt="StudySphere" className="wl-logo-img" style={{ height: 26, opacity: 0.5 }} />
                    <div className="wl-footer-links">
                        <a href="#features">Features</a>
                        <Link to="/for-mentors">For Mentors</Link>
                        <Link to="/login">Log In</Link>
                    </div>
                    <div className="wl-footer-copy">© {new Date().getFullYear()} StudySphere</div>
                </div>
            </footer>
        </div>
    );
};

export default Waitlist;
