import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import Logo from '../Logo1.svg';
import { LiveStatsStrip } from '../components/LiveStatsStrip';
import { TryAiWidget } from '../components/TryAiWidget';
import './Waitlist.css';

const LAUNCH_DATE = new Date('2026-06-10T00:00:00+09:00'); // KST — June 10 2026

const useCountdown = () => {
    const calc = () => {
        const diff = Math.max(0, LAUNCH_DATE - Date.now());
        return {
            days:    Math.floor(diff / 86400000),
            hours:   Math.floor((diff % 86400000) / 3600000),
            minutes: Math.floor((diff % 3600000) / 60000),
            seconds: Math.floor((diff % 60000) / 1000),
            total:   diff,
        };
    };
    const [time, setTime] = useState(calc);
    useEffect(() => {
        const id = setInterval(() => setTime(calc()), 1000);
        return () => clearInterval(id);
    }, []);
    return time;
};

const CURRICULA = ['IB Diploma', 'A-Level', 'AP', 'GCSE / IGCSE', 'Other'];

const PRIMARY_FEATURES = [
    {
        num: '01',
        label: 'AI built for IB',
        desc: 'Not adapted from generic tools. Built around command terms, HL/SL depth, and mark scheme conventions. It knows what "evaluate" means in IB context — and why that matters.',
        Mockup: AiMockup,
    },
    {
        num: '02',
        label: 'Learn from your own notes',
        desc: 'Upload your textbooks, teacher notes, and past papers. The AI answers questions drawing directly from your materials, with source citations you can verify.',
        Mockup: NotesMockup,
    },
    {
        num: '03',
        label: 'Study rooms built for focus',
        desc: 'HD video, collaborative whiteboard, and a Pomodoro timer that keeps the whole room on the same session. No tab-switching. No distractions.',
        Mockup: RoomMockup,
    },
];

const SECONDARY_FEATURES = [
    {
        num: '04',
        label: 'Alumni mentors',
        desc: 'Connect with students who already passed your exact exams. Ask questions, get endorsed answers from people who know the mark scheme firsthand.',
    },
    {
        num: '05',
        label: 'Streaks and XP',
        desc: 'Build a daily study habit. Your streak lives on your public profile — the kind of social stakes that make consistency easier to maintain.',
    },
    {
        num: '06',
        label: 'Knowledge base',
        desc: 'Wiki articles, answered Q&A, peer-reviewed resources — all AI-indexed and instantly searchable across your subjects.',
    },
];

const SOCIAL_PROOF = [
    { initials: 'AK', name: 'Aryan K.',  tag: 'IB Maths AA HL',      quote: 'Finally an AI that actually understands mark scheme language.' },
    { initials: 'SL', name: 'Sofia L.',  tag: 'IB Biology HL',       quote: 'The study rooms kept me accountable through my entire revision period.' },
    { initials: 'JM', name: 'James M.',  tag: 'A-Level Chemistry',    quote: 'Uploaded my teacher\'s notes and it answered questions from them directly.' },
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
            { threshold: 0.07, rootMargin: '0px 0px -28px 0px' }
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

function AiMockup() {
    return (
        <div className="wl-feat-mockup">
            <div className="wl-mock-bar">
                <span className="wl-mock-dot" />
                <span className="wl-mock-dot" />
                <span className="wl-mock-dot" />
                <span className="wl-mock-title">StudySphere AI</span>
            </div>
            <div className="wl-mock-body">
                <div className="wl-mock-q">
                    Explain Newton's Law of Gravitation for HL, using mark scheme language.
                </div>
                <div className="wl-mock-a">
                    <div className="wl-mock-a-text">
                        For <strong>HL</strong>, candidates must state the inverse-square law and derive{' '}
                        <em>g = GM/r²</em> from first principles. Mark scheme awards{' '}
                        <strong>[2]</strong> for correct substitution with units shown…
                    </div>
                    <div className="wl-mock-citation">
                        <span style={{ fontSize: '0.85rem' }}>📄</span>
                        IB Physics HL · Past Paper May 2023 · TZ1
                    </div>
                </div>
            </div>
        </div>
    );
}

function NotesMockup() {
    const files = [
        { name: 'Chemistry_Notes_SL.pdf',          size: '2.4 MB', status: 'indexed' },
        { name: 'Physics_Past_Papers_2019-24.pdf',  size: '8.1 MB', status: 'indexed' },
        { name: 'Biology_HL_Teacher_Notes.pdf',     size: '3.7 MB', status: 'indexing' },
    ];
    return (
        <div className="wl-feat-mockup">
            <div className="wl-mock-bar">
                <span className="wl-mock-dot" />
                <span className="wl-mock-dot" />
                <span className="wl-mock-dot" />
                <span className="wl-mock-title">My Documents</span>
            </div>
            <div className="wl-mock-body">
                {files.map(f => (
                    <div key={f.name} className="wl-mock-file">
                        <span className="wl-mock-file-icon">📄</span>
                        <div className="wl-mock-file-info">
                            <span className="wl-mock-file-name">{f.name}</span>
                            <span className="wl-mock-file-size">{f.size}</span>
                        </div>
                        <span className={`wl-mock-file-status wl-mock-file-status--${f.status}`}>
                            {f.status === 'indexed' ? '✓ Indexed' : 'Indexing…'}
                        </span>
                    </div>
                ))}
                <div className="wl-mock-upload-btn">+ Upload document</div>
            </div>
        </div>
    );
}

function RoomMockup() {
    const users = [
        { initials: 'AK', name: 'Aryan K.' },
        { initials: 'SL', name: 'Sofia L.' },
        { initials: 'JM', name: 'James M.' },
    ];
    return (
        <div className="wl-feat-mockup">
            <div className="wl-mock-bar">
                <span className="wl-mock-dot" />
                <span className="wl-mock-dot" />
                <span className="wl-mock-dot" />
                <span className="wl-mock-title">Physics Study Room · 3 online</span>
            </div>
            <div className="wl-mock-body">
                <div className="wl-mock-grid">
                    {users.map(u => (
                        <div key={u.initials} className="wl-mock-tile">
                            <div className="wl-mock-avatar">{u.initials}</div>
                            <div className="wl-mock-name">{u.name}</div>
                        </div>
                    ))}
                </div>
                <div className="wl-mock-controls">
                    <span className="wl-mock-ctrl wl-mock-ctrl--red">●</span>
                    <span className="wl-mock-ctrl">🎤</span>
                    <span className="wl-mock-ctrl">📹</span>
                    <span className="wl-mock-timer">25:00</span>
                </div>
            </div>
        </div>
    );
}

export const Waitlist = () => {
    useScrollReveal();
    const countdown = useCountdown();
    const [email, setEmail]         = useState('');
    const [role, setRole]           = useState('student');
    const [curriculum, setCurriculum] = useState('IB Diploma');
    const [status, setStatus]       = useState('idle'); // idle | loading | success | duplicate | error
    const [errorMsg, setErrorMsg]   = useState('');
    const [count, setCount]         = useState(0);

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
            <nav className="wl-nav" aria-label="Main navigation">
                <div className="wl-nav-inner">
                    <Link to="/" className="wl-logo">
                        <img src={Logo} alt="StudySphere" className="wl-logo-img" />
                    </Link>
                    <div className="wl-nav-links">
                        <a href="#features">Features</a>
                        <a href="#try-ai">Try the AI</a>
                    </div>
                    <div className="wl-nav-actions">
                        <Link to="/login" className="wl-btn-ghost">Log in</Link>
                    </div>
                </div>
            </nav>

            {/* ── Hero ── */}
            <section className="wl-hero" aria-labelledby="hero-headline">
                <div className="wl-hero-glow wl-glow-1" aria-hidden="true" />
                <div className="wl-hero-glow wl-glow-2" aria-hidden="true" />

                <div className="wl-hero-inner">
                    <div className="wl-hero-copy">
                        <div className="wl-badge wl-reveal" aria-label="Launch date">
                            <span className="wl-badge-dot" aria-hidden="true" />
                            Launching June 10, 2026 · Worldwide
                        </div>

                        <h1 id="hero-headline" className="wl-headline wl-reveal">
                            The AI study platform<br />
                            <span className="wl-headline-accent">built for IB students.</span>
                        </h1>

                        <p className="wl-sub wl-reveal">
                            Upload your notes. Study with classmates. Ask the AI that actually
                            knows what command terms mean. Get mentored by alumni who passed
                            your exact exams.
                        </p>

                        <div className="wl-countdown wl-reveal" aria-label="Time until launch">
                            {[
                                { value: countdown.days,    label: 'Days' },
                                { value: countdown.hours,   label: 'Hours' },
                                { value: countdown.minutes, label: 'Min' },
                                { value: countdown.seconds, label: 'Sec' },
                            ].map(({ value, label }, i) => (
                                <React.Fragment key={label}>
                                    {i > 0 && <span className="wl-cd-sep" aria-hidden="true">:</span>}
                                    <div className="wl-cd-unit">
                                        <span className="wl-cd-num">{String(value).padStart(2, '0')}</span>
                                        <span className="wl-cd-label">{label}</span>
                                    </div>
                                </React.Fragment>
                            ))}
                        </div>

                        {count > 0 && (
                            <p className="wl-count-line wl-reveal">
                                <span className="wl-count-arrow" aria-hidden="true">→</span>
                                <strong><CountUp target={count} /></strong>
                                <span>students already on the list</span>
                            </p>
                        )}
                    </div>

                    {/* ── Signup card ── */}
                    <div className="wl-card wl-reveal">
                        {status === 'success' ? (
                            <div className="wl-success" role="status">
                                <div className="wl-success-mark" aria-hidden="true">✓</div>
                                <h3>You're on the list.</h3>
                                <p>We'll email you when early access opens. You're number{' '}
                                    <strong>{count.toLocaleString()}</strong> in line.</p>
                                <a href="#try-ai" className="wl-btn-primary wl-btn-full">
                                    Try the AI now
                                </a>
                            </div>
                        ) : status === 'duplicate' ? (
                            <div className="wl-success" role="status">
                                <div className="wl-success-mark" aria-hidden="true">✓</div>
                                <h3>Already registered.</h3>
                                <p>You're already on the waitlist. We'll let you know when access opens.</p>
                                <a href="#try-ai" className="wl-btn-primary wl-btn-full">
                                    Try the AI now
                                </a>
                            </div>
                        ) : (
                            <>
                                <div className="wl-card-header">
                                    <h2>Get early access</h2>
                                    <p>Be first when we open. No spam, ever.</p>
                                </div>
                                <form className="wl-form" onSubmit={handleSubmit} noValidate>
                                    <input
                                        className="wl-input"
                                        type="email"
                                        placeholder="your@email.com"
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        required
                                        disabled={status === 'loading'}
                                        aria-label="Email address"
                                        autoComplete="email"
                                    />
                                    <div className="wl-form-row">
                                        <select
                                            className="wl-select"
                                            value={role}
                                            onChange={e => setRole(e.target.value)}
                                            disabled={status === 'loading'}
                                            aria-label="I am a"
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
                                            aria-label="Curriculum"
                                        >
                                            {CURRICULA.map(c => (
                                                <option key={c} value={c}>{c}</option>
                                            ))}
                                        </select>
                                    </div>
                                    {status === 'error' && (
                                        <p className="wl-form-error" role="alert">{errorMsg}</p>
                                    )}
                                    <button
                                        type="submit"
                                        className="wl-btn-primary wl-btn-full"
                                        disabled={status === 'loading' || !email.trim()}
                                    >
                                        {status === 'loading' ? 'Joining…' : 'Join the waitlist'}
                                    </button>
                                </form>
                                <p className="wl-card-note">
                                    Already have an account? <Link to="/login">Log in</Link>
                                </p>
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
            <section className="wl-features" id="features" aria-labelledby="features-title">
                <div className="wl-section-inner">
                    <span className="wl-section-tag wl-reveal">What you get</span>
                    <h2 id="features-title" className="wl-section-title wl-reveal">
                        Everything IB students need.<br />Nothing they don't.
                    </h2>

                    {/* Primary features — alternating rows */}
                    <div className="wl-feature-rows">
                        {PRIMARY_FEATURES.map((f, i) => (
                            <div
                                key={f.num}
                                className={`wl-feature-row wl-reveal${i % 2 === 1 ? ' wl-feature-row--flip' : ''}`}
                                style={{ transitionDelay: `${i * 60}ms` }}
                            >
                                <div className="wl-feature-row-text">
                                    <span className="wl-feature-row-num">{f.num}</span>
                                    <h3 className="wl-feature-row-title">{f.label}</h3>
                                    <p className="wl-feature-row-desc">{f.desc}</p>
                                </div>
                                <div className="wl-feature-row-visual" aria-hidden="true">
                                    <f.Mockup />
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Secondary features — numbered grid */}
                    <div className="wl-features-secondary wl-reveal">
                        {SECONDARY_FEATURES.map(f => (
                            <div key={f.num} className="wl-features-secondary-item">
                                <span className="wl-feat-sec-num">{f.num}</span>
                                <div className="wl-feat-sec-title">{f.label}</div>
                                <p className="wl-feat-sec-desc">{f.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Try AI ── */}
            <div id="try-ai" className="wl-ai-wrap">
                <div className="wl-section-inner">
                    <span className="wl-section-tag wl-reveal">Try it now</span>
                    <h2 className="wl-section-title wl-reveal" style={{ marginBottom: '2rem' }}>
                        Ask the IB AI anything.
                    </h2>
                </div>
                <TryAiWidget />
            </div>

            {/* ── Testimonials ── */}
            <section className="wl-testimonials wl-reveal" aria-labelledby="testimonials-title">
                <div className="wl-section-inner">
                    <span className="wl-section-tag">Early users</span>
                    <h2 id="testimonials-title" className="wl-section-title">
                        Students who tried the beta.
                    </h2>
                    <div className="wl-testimonials-grid">
                        {SOCIAL_PROOF.map((t, i) => (
                            <div key={i} className="wl-testimonial-card">
                                <span className="wl-testimonial-qmark" aria-hidden="true">"</span>
                                <blockquote className="wl-testimonial-quote">{t.quote}</blockquote>
                                <div className="wl-testimonial-author">
                                    <div className="wl-testimonial-avatar" aria-hidden="true">
                                        {t.initials}
                                    </div>
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
                <div className="wl-cta-inner">
                    <h2 className="wl-cta-title">Your exams aren't waiting.<br />Your spot is.</h2>
                    <p className="wl-cta-sub">
                        Join {count > 0 ? count.toLocaleString() : 'hundreds of'} students already on the list.
                    </p>
                    <a
                        href="#"
                        className="wl-btn-primary wl-btn-xl"
                        onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                        aria-label="Scroll to top to join the waitlist"
                    >
                        Get early access
                    </a>
                </div>
            </section>

            {/* ── Footer ── */}
            <footer className="wl-footer">
                <div className="wl-footer-inner">
                    <img src={Logo} alt="StudySphere" style={{ height: 26, opacity: 0.45 }} />
                    <div className="wl-footer-links">
                        <a href="#features">Features</a>
                        <Link to="/login">Log In</Link>
                    </div>
                    <div className="wl-footer-copy">© {new Date().getFullYear()} StudySphere</div>
                </div>
            </footer>
        </div>
    );
};

export default Waitlist;
