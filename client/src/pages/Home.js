import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import Logo from '../Logo1.svg';
import { LiveStatsStrip } from '../components/LiveStatsStrip';
import { TryAiWidget } from '../components/TryAiWidget';
import './Home.css';

const useScrollReveal = () => {
    useEffect(() => {
        const els = document.querySelectorAll('.v2-reveal');
        const observer = new IntersectionObserver(
            (entries) => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('v2-revealed'); }),
            { threshold: 0.08, rootMargin: '0px 0px -32px 0px' }
        );
        els.forEach(el => observer.observe(el));
        return () => observer.disconnect();
    }, []);
};

const BENEFITS = [
    {
        icon: '🎥',
        label: 'Live Study Rooms',
        desc: 'HD video, whiteboard, Pomodoro timer — with classmates or strangers studying the same subject.',
        color: '#4a90e2',
        bg: 'rgba(74,144,226,0.07)',
    },
    {
        icon: '✨',
        label: 'IB AI Assistant',
        desc: 'Ask about command terms, HL/SL depth, past-paper conventions. Gets it right because it was trained on IB material.',
        color: '#7b68ee',
        bg: 'rgba(123,104,238,0.07)',
    },
    {
        icon: '🎓',
        label: 'Alumni Mentors',
        desc: 'Connect with alumni who sat your exact exams. Browse by subject, ask questions, get endorsed answers.',
        color: '#0ea5e9',
        bg: 'rgba(14,165,233,0.07)',
    },
];

const FEATURES = [
    { icon: '⚡', title: 'XP & Leveling',   desc: 'Earn XP every minute you study. Level up, climb the leaderboard, unlock peer resources.' },
    { icon: '🔥', title: 'Daily Streaks',    desc: 'Build the habit. Your streak shows on your public profile — social proof that actually matters.' },
    { icon: '📚', title: 'Knowledge Base',   desc: 'Wiki articles, answered Q&A, and peer-rated resources — all AI-indexed and instantly searchable.' },
    { icon: '🖥',  title: 'Screen Share',     desc: 'Share your working, annotate past papers together, or walk someone through a tough proof.' },
    { icon: '📝',  title: 'Session Recaps',   desc: 'After every session the AI writes a summary: topics covered, links shared, action items.' },
    { icon: '🏪',  title: 'Marketplace',      desc: 'Buy and sell study notes, essay plans, and revision guides. Pay with XP, earn XP by sharing.' },
];

export const Home = () => {
    useScrollReveal();

    const title = 'StudySphere — Get a 7 in IB. Together.';
    const desc  = 'Live study rooms, an AI trained on the IB curriculum, and alumni who already passed your exams — all free.';

    return (
        <div className="v2-home">
            <Helmet>
                <title>{title}</title>
                <meta name="description" content={desc} />
                <meta property="og:title" content={title} />
                <meta property="og:description" content={desc} />
                <meta property="og:type" content="website" />
                <meta property="og:site_name" content="StudySphere" />
                <meta name="twitter:card" content="summary_large_image" />
                <meta name="twitter:title" content={title} />
                <meta name="twitter:description" content={desc} />
            </Helmet>

            {/* ── Navbar ── */}
            <nav className="v2-nav">
                <div className="v2-nav-inner">
                    <Link to="/" className="v2-logo">
                        <img src={Logo} alt="StudySphere" className="v2-logo-img" />
                    </Link>
                    <div className="v2-nav-links">
                        <a href="#features">Features</a>
                        <a href="#try-ai">Try the AI</a>
                    </div>
                    <div className="v2-nav-actions">
                        <Link to="/login" className="v2-btn-ghost">Log in</Link>
                        <Link to="/registration" className="v2-btn-primary">Get Started Free</Link>
                    </div>
                </div>
            </nav>

            {/* ── Hero ── */}
            <section className="v2-hero">
                <div className="v2-hero-noise" />

                <div className="v2-hero-inner">
                    {/* Left — copy */}
                    <div className="v2-hero-copy">
                        <div className="v2-eyebrow v2-reveal">Free for IB students</div>

                        <h1 className="v2-headline v2-reveal">
                            Get your 7.<br />
                            <span className="v2-gradient">Study together.</span>
                        </h1>

                        <p className="v2-hero-tag v2-reveal">
                            Live study rooms &nbsp;·&nbsp; IB AI assistant &nbsp;·&nbsp; alumni mentors
                        </p>

                        <p className="v2-hero-sub v2-reveal">
                            The only platform built end-to-end for IB — not adapted from something generic.
                            Join a room, ask the AI, get a mentor. All free.
                        </p>

                        <div className="v2-hero-ctas v2-reveal">
                            <Link to="/registration" className="v2-btn-primary v2-btn-lg">
                                Start studying free →
                            </Link>
                            <a href="#try-ai" className="v2-btn-ghost v2-btn-lg">
                                Try the AI first
                            </a>
                        </div>
                    </div>

                    {/* Right — 3 benefit cards */}
                    <div className="v2-hero-cards v2-reveal">
                        {BENEFITS.map((b, i) => (
                            <div
                                key={i}
                                className="v2-benefit-card"
                                style={{ '--card-color': b.color, '--card-bg': b.bg, animationDelay: `${i * 0.12}s` }}
                            >
                                <div className="v2-benefit-icon">{b.icon}</div>
                                <div className="v2-benefit-body">
                                    <div className="v2-benefit-label">{b.label}</div>
                                    <div className="v2-benefit-desc">{b.desc}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Live stats ── */}
            <div className="v2-stats-wrap">
                <LiveStatsStrip />
            </div>

            {/* ── Try the AI ── */}
            <div id="try-ai" className="v2-ai-wrap v2-reveal">
                <TryAiWidget />
            </div>

            {/* ── Features ── */}
            <section className="v2-features" id="features">
                <div className="v2-features-inner">
                    <div className="v2-section-label v2-reveal">Everything included</div>
                    <h2 className="v2-section-title v2-reveal">
                        Built for the way<br />IB students actually study
                    </h2>
                    <div className="v2-features-grid">
                        {FEATURES.map((f, i) => (
                            <div
                                key={i}
                                className="v2-feature-card v2-reveal"
                                style={{ transitionDelay: `${i * 60}ms` }}
                            >
                                <span className="v2-feature-icon">{f.icon}</span>
                                <h3 className="v2-feature-title">{f.title}</h3>
                                <p className="v2-feature-desc">{f.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── CTA ── */}
            <section className="v2-cta v2-reveal">
                <div className="v2-cta-inner">
                    <div className="v2-cta-glow" />
                    <h2 className="v2-cta-title">Your exams aren't waiting.<br />Neither should you.</h2>
                    <p className="v2-cta-sub">Free to join. No credit card. Start your first session in under a minute.</p>
                    <Link to="/registration" className="v2-btn-primary v2-btn-xl">
                        Create your free account →
                    </Link>
                </div>
            </section>

            {/* ── Footer ── */}
            <footer className="v2-footer">
                <div className="v2-footer-inner">
                    <img src={Logo} alt="StudySphere" className="v2-logo-img" style={{ height: 28, opacity: 0.6 }} />
                    <div className="v2-footer-links">
                        <a href="#features">Features</a>
                        <Link to="/login">Log In</Link>
                        <Link to="/registration">Sign Up</Link>
                    </div>
                    <div className="v2-footer-copy">© {new Date().getFullYear()} StudySphere</div>
                </div>
            </footer>
        </div>
    );
};

export default Home;
