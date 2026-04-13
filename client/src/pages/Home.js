import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import Logo from '../Logo1.svg';
import './Home.css';

const useScrollReveal = () => {
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('revealed'); }),
            { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
        );
        document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
        return () => observer.disconnect();
    }, []);
};

const MockStudyRoom = () => (
    <div className="mock-room">
        <div className="mock-room-header">
            <span className="mock-dot green" />
            <span>AP Calculus — Study Session</span>
            <div className="mock-room-badge">4 / 8 joined</div>
        </div>
        <div className="mock-room-body">
            <div className="mock-video-grid">
                {[
                    { init: 'AK', color: '#6366f1', speaking: true },
                    { init: 'SM', color: '#0ea5e9', speaking: false },
                    { init: 'JL', color: '#10b981', speaking: true },
                    { init: 'PR', color: '#f59e0b', speaking: false },
                ].map((p, i) => (
                    <div key={i} className={`mock-video-tile${p.speaking ? ' speaking' : ''}`}>
                        <div className="mock-avatar" style={{ background: p.color }}>{p.init}</div>
                        {!p.speaking && <div className="mock-muted">🔇</div>}
                    </div>
                ))}
            </div>
            <div className="mock-sidebar">
                <div className="mock-sidebar-header">✨ AI Assistant</div>
                <div className="mock-msgs">
                    <div className="mock-msg user">Explain the chain rule</div>
                    <div className="mock-msg ai">If h(x) = f(g(x)), then h′(x) = f′(g(x)) · g′(x). Think of it as peeling layers...</div>
                    <div className="mock-msg user">Give me an example?</div>
                    <div className="mock-typing"><span /><span /><span /></div>
                </div>
            </div>
        </div>
        <div className="mock-controls">
            <div className="mock-ctrl">🎤</div>
            <div className="mock-ctrl">📷</div>
            <div className="mock-ctrl">💬</div>
            <div className="mock-ctrl ai-ctrl">✨</div>
            <div className="mock-ctrl">🖥</div>
            <div className="mock-ctrl timer">25:00</div>
        </div>
    </div>
);

const FEATURES = [
    { icon: '🎥', title: 'Live Study Rooms',      desc: 'HD video, mic, screen share, and a collaborative whiteboard — every tool in one room.' },
    { icon: '✨', title: 'AI Study Assistant',     desc: 'Ask anything mid-session. Powered by GPT-4o with full context of your group\'s subject.' },
    { icon: '🎓', title: 'Alumni Mentorship',      desc: 'Connect with alumni who took the same courses. Browse by subject, endorse the best mentors.' },
    { icon: '⚡', title: 'XP & Leveling',          desc: 'Earn 10 XP per minute studied. Level up, unlock resources, and climb the streak leaderboard.' },
    { icon: '🔥', title: 'Study Streaks',          desc: 'Build a daily habit. Your longest streak lives on your public profile as social proof.' },
    { icon: '📚', title: 'Knowledge Base',         desc: 'Wiki articles, Q&A board, and a peer-rated resource marketplace — all AI-indexed and searchable.' },
];

const STEPS = [
    { num: '01', title: 'Join or create a room',       desc: 'Browse public rooms by subject or spin up a private one. Password-protect it or leave it open.' },
    { num: '02', title: 'Study together with AI help', desc: 'The AI searches the platform\'s knowledge base before answering. Real context, not hallucinations.' },
    { num: '03', title: 'Level up every session',      desc: 'Earn XP, extend your streak, hit your weekly goal. Leave with a clear record of what you covered.' },
];

const STATS = [
    { val: '10×',  label: 'XP per minute studied' },
    { val: '50k',  label: 'AI tokens daily, free' },
    { val: '∞',   label: 'Simultaneous rooms' },
    { val: '4',    label: 'Ambient focus sounds' },
];

export const Home = () => {
    useScrollReveal();

    return (
        <div className="home">
            <div className="bg-grid" />

            {/* ── Navbar ── */}
            <nav className="home-nav">
                <div className="home-nav-inner">
                    <Link to="/" className="home-logo">
                        <img src={Logo} alt="" className="home-logo-img" />
                    </Link>
                    <div className="home-nav-links">
                        <a href="#features">Features</a>
                        <a href="#how-it-works">How It Works</a>
                        <a href="#community">Community</a>
                    </div>
                    <div className="home-nav-actions">
                        <Link to="/login" className="btn-ghost">Log in</Link>
                        <Link to="/registration" className="btn-primary">Get Started Free</Link>
                    </div>
                </div>
            </nav>

            {/* ── Hero ── */}
            <section className="hero">
                <div className="hero-glow" />
                <div className="hero-content">
                    <div className="hero-eyebrow reveal">Virtual study rooms for serious students</div>
                    <h1 className="hero-headline reveal">
                        Study smarter.<br />
                        <span className="gradient-text">Together.</span>
                    </h1>
                    <p className="hero-sub reveal">
                        Real-time video rooms, an AI assistant that knows your subject,
                        alumni mentors, and a habit system that keeps you coming back.
                    </p>
                    <div className="hero-ctas reveal">
                        <Link to="/registration" className="btn-primary btn-lg">Get Started Free</Link>
                        <Link to="/login" className="btn-ghost btn-lg">Log in →</Link>
                    </div>
                </div>
                <div className="hero-visual reveal">
                    <MockStudyRoom />
                </div>
            </section>

            {/* ── Stats ── */}
            <div className="stats-bar reveal">
                {STATS.map((s, i) => (
                    <div key={i} className="stat-item">
                        <span className="stat-val">{s.val}</span>
                        <span className="stat-label">{s.label}</span>
                    </div>
                ))}
            </div>

            {/* ── Features ── */}
            <section className="features-section" id="features">
                <div className="section-eyebrow reveal">Everything you need</div>
                <h2 className="section-title reveal">Built for the way<br />students actually study</h2>
                <div className="features-grid">
                    {FEATURES.map((f, i) => (
                        <div key={i} className="feature-card reveal" style={{ transitionDelay: `${i * 55}ms` }}>
                            <div className="feature-icon">{f.icon}</div>
                            <h3 className="feature-title">{f.title}</h3>
                            <p className="feature-desc">{f.desc}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* ── How it works ── */}
            <section className="how-section" id="how-it-works">
                <div className="section-eyebrow reveal">Simple by design</div>
                <h2 className="section-title reveal">How it works</h2>
                <div className="steps">
                    {STEPS.map((s, i) => (
                        <div key={i} className="step reveal">
                            <div className="step-num">{s.num}</div>
                            <div className="step-body">
                                <h3 className="step-title">{s.title}</h3>
                                <p className="step-desc">{s.desc}</p>
                            </div>
                            {i < STEPS.length - 1 && <div className="step-line" />}
                        </div>
                    ))}
                </div>
            </section>

            {/* ── Community ── */}
            <section className="community-section" id="community">
                <div className="community-inner">
                    <div className="community-text reveal">
                        <div className="section-eyebrow">More than a study tool</div>
                        <h2 className="section-title">A community of<br />learners and mentors</h2>
                        <p className="community-body">
                            Alumni who navigated the same path share essays, answer questions,
                            and host open sessions. Students endorse the mentors who helped most.
                            Every article and answer is AI-indexed so the assistant surfaces
                            real knowledge — not hallucinations.
                        </p>
                        <div className="community-pills">
                            <span className="pill">📖 Wiki Articles</span>
                            <span className="pill">❓ Q&amp;A Board</span>
                            <span className="pill">🏪 Marketplace</span>
                            <span className="pill">🌟 Endorsements</span>
                        </div>
                    </div>
                    <div className="community-cards reveal">
                        <div className="comm-card">
                            <div className="comm-card-header">
                                <div className="comm-avatar" style={{ background: '#6366f1' }}>AK</div>
                                <div>
                                    <div className="comm-name">Arjun K.</div>
                                    <div className="comm-role">Alumni · CS · MIT '23</div>
                                </div>
                                <div className="comm-streak">🔥 14</div>
                            </div>
                            <p className="comm-bio">Helped 47 students with algorithms. 3 wiki articles, 12 accepted answers.</p>
                            <div className="comm-tags"><span>DSA</span><span>Python</span><span>System Design</span></div>
                        </div>
                        <div className="comm-card comm-card-offset">
                            <div className="comm-card-header">
                                <div className="comm-avatar" style={{ background: '#0ea5e9' }}>SM</div>
                                <div>
                                    <div className="comm-name">Sofia M.</div>
                                    <div className="comm-role">Alumni · Pre-Med · Johns Hopkins '22</div>
                                </div>
                                <div className="comm-streak">🔥 31</div>
                            </div>
                            <p className="comm-bio">Published 8 orgo study guides. Top resource: "MCAT Bio Blueprint" — 200+ unlocks.</p>
                            <div className="comm-tags"><span>Orgo</span><span>Bio</span><span>MCAT</span></div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── CTA Banner ── */}
            <section className="cta-banner reveal">
                <div className="cta-glow" />
                <h2 className="cta-title">Start studying smarter today.</h2>
                <p className="cta-sub">Free to join. No credit card. Your first study session is one click away.</p>
                <Link to="/registration" className="btn-primary btn-xl">Create Your Account →</Link>
            </section>

            {/* ── Footer ── */}
            <footer className="home-footer">
                <div className="footer-inner">
                    <div className="home-logo">
                        <img src={Logo} alt="" className="home-logo-img" />
                    </div>
                    <div className="footer-links">
                        <a href="#features">Features</a>
                        <a href="#community">Community</a>
                        <Link to="/login">Log In</Link>
                        <Link to="/registration">Sign Up</Link>
                    </div>
                    <div className="footer-copy">© {new Date().getFullYear()} StudySphere. All rights reserved.</div>
                </div>
            </footer>
        </div>
    );
};
