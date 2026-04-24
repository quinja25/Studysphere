import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import Logo from '../Logo1.svg';
import api from '../api';
import { LiveStatsStrip } from '../components/LiveStatsStrip';
import './Home.css';
import './ForMentors.css';

const useScrollReveal = () => {
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('v2-revealed'); }),
            { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
        );
        document.querySelectorAll('.v2-reveal').forEach(el => observer.observe(el));
        return () => observer.disconnect();
    }, []);
};

const MENTOR_ITEMS = [
    { key: 'unansweredQuestions', label: 'IB questions waiting', dotWhen: 'positive' },
    { key: 'studentsOnline', label: 'students online now', dotWhen: 'positive' },
    { key: 'questionsLast24h', label: 'new questions today' },
    { key: 'lastAnswerMinutesAgo', label: 'last answer', format: 'minutesAgo', mono: true },
];

const PILLARS = [
    {
        icon: '💸',
        title: 'Earn from your expertise',
        tag: 'Coming soon',
        desc: 'Students will post bounties ($2–$20) on tough questions. Answer on your commute, get paid the same week. 80% to you, 20% to the platform.',
    },
    {
        icon: '🛡️',
        title: 'Verified Mentor badge',
        tag: 'Live',
        desc: 'LinkedIn-verified mentor profile with recruiter-visible metrics: "Helped 47 IB students", "3 accepted answers on IB Chem HL", your streak, your universities.',
    },
    {
        icon: '🎓',
        title: 'University cohorts',
        tag: 'Coming soon',
        desc: 'Private rooms for Imperial, Oxford, Cambridge, Ivy alumni. Help IB students thinking of applying. Meet peers from your year and program.',
    },
    {
        icon: '✉️',
        title: 'Answer from your inbox',
        tag: 'Coming soon',
        desc: 'Daily digest of 3 unanswered questions in your subject. Reply to the email to post the answer. Zero login required — meet students where you already are.',
    },
];

const SAMPLE_MENTORS = [
    {
        init: 'AK', color: '#6366f1',
        name: 'Arjun K.',
        uni: "MIT ‘23 · CS",
        metric: '47 IB students helped',
        lines: '12 accepted answers · 3 wiki articles · 14 endorsements',
        tags: ['IB Maths AA HL', 'DSA', 'Python'],
    },
    {
        init: 'SM', color: '#0ea5e9',
        name: 'Sofia M.',
        uni: "Johns Hopkins '22 · Pre-Med",
        metric: '63 IB students helped',
        lines: '8 accepted answers on IB Bio HL · top resource: "MCAT Bio Blueprint"',
        tags: ['IB Bio HL', 'IB Chem HL', 'MCAT'],
    },
    {
        init: 'YL', color: '#10b981',
        name: 'Yara L.',
        uni: "Oxford '24 · PPE",
        metric: '22 IB students helped',
        lines: '5 accepted answers on IB Econ HL · 2 university prep sessions hosted',
        tags: ['IB Econ HL', 'TOK', 'Oxford apps'],
    },
];

const subjectColor = (subject) => {
    const s = (subject || '').toLowerCase();
    if (s.includes('bio'))   return '#10b981';
    if (s.includes('chem'))  return '#8b5cf6';
    if (s.includes('phys'))  return '#f59e0b';
    if (s.includes('math'))  return '#4a90e2';
    if (s.includes('econ'))  return '#ef4444';
    if (s.includes('hist'))  return '#d97706';
    if (s.includes('eng') || s.includes('lit')) return '#ec4899';
    return '#64748b';
};

const minutesAgo = (iso) => {
    if (!iso) return '';
    const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (m < 1) return 'just now';
    if (m < 60) return `${m} min ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
};

const OpenQuestionsFeed = () => {
    const [questions, setQuestions] = useState(null);

    useEffect(() => {
        let cancelled = false;
        api.get('/public/open-questions?limit=3')
            .then((res) => { if (!cancelled) setQuestions(res.data.questions || []); })
            .catch(() => { if (!cancelled) setQuestions([]); });
        return () => { cancelled = true; };
    }, []);

    if (questions === null) {
        return <div className="fm-feed-empty">Loading live questions…</div>;
    }

    if (questions.length === 0) {
        return (
            <div className="fm-feed-empty">
                No unanswered questions right now — you'd be answering the next one.
            </div>
        );
    }

    return (
        <div className="fm-feed">
            {questions.map((q) => (
                <div key={q.id} className="fm-feed-card">
                    <div className="fm-feed-top">
                        {q.subject && (
                            <span
                                className="fm-feed-subject"
                                style={{ background: subjectColor(q.subject) }}
                            >
                                {q.subject}
                            </span>
                        )}
                        <span className="fm-feed-time">{minutesAgo(q.createdAt)}</span>
                    </div>
                    <div className="fm-feed-title">{q.title}</div>
                    <div className="fm-feed-cta">Unanswered · waiting for a mentor</div>
                </div>
            ))}
        </div>
    );
};

export const ForMentors = () => {
    useScrollReveal();

    const pageTitle = 'Become a StudySphere Mentor — Your IB experience is worth paying for';
    const pageDesc = 'Answer IB questions from current students on your commute. Earn bounties, build a recruiter-visible Verified Mentor profile, and help the next cohort crush their exams.';

    return (
        <div className="v2-home for-mentors">
            <Helmet>
                <title>{pageTitle}</title>
                <meta name="description" content={pageDesc} />
                <meta property="og:title" content={pageTitle} />
                <meta property="og:description" content={pageDesc} />
                <meta property="og:type" content="website" />
                <meta property="og:site_name" content="StudySphere" />
                <meta property="og:url" content="/for-mentors" />
                <meta name="twitter:card" content="summary_large_image" />
                <meta name="twitter:title" content={pageTitle} />
                <meta name="twitter:description" content={pageDesc} />
            </Helmet>

            {/* ── Navbar ── */}
            <nav className="v2-nav">
                <div className="v2-nav-inner">
                    <Link to="/" className="v2-logo">
                        <img src={Logo} alt="" className="v2-logo-img" />
                    </Link>
                    <div className="v2-nav-links">
                        <a href="#why">Why mentor</a>
                        <a href="#live">Live questions</a>
                        <a href="#mentors">Mentors</a>
                        <Link to="/">For Students</Link>
                    </div>
                    <div className="v2-nav-actions">
                        <Link to="/login" className="v2-btn-ghost">Log in</Link>
                        <Link to="/registration?role=alumni" className="v2-btn-primary">
                            Apply as Mentor
                        </Link>
                    </div>
                </div>
            </nav>

            {/* ── Hero ── */}
            <section className="v2-hero fm-hero">
                <div className="v2-hero-noise" />
                <div className="v2-hero-inner">
                    <div className="v2-hero-copy">
                        <div className="v2-eyebrow v2-reveal">For alumni — IB, A-Level, top universities</div>
                        <h1 className="v2-headline v2-reveal">
                            Your IB experience is<br />
                            <span className="v2-gradient">worth paying for.</span>
                        </h1>
                        <p className="v2-hero-sub v2-reveal">
                            Answer real IB questions from current students. Build a recruiter-visible
                            mentor profile. Earn bounties on your commute. Zero schedule commitment.
                        </p>
                        <div className="v2-hero-ctas v2-reveal">
                            <Link to="/registration?role=alumni" className="v2-btn-primary v2-btn-lg">
                                Apply as Mentor →
                            </Link>
                            <a href="#live" className="v2-btn-ghost v2-btn-lg">See live questions</a>
                        </div>
                    </div>

                    <div className="fm-hero-card v2-reveal">
                        <div className="fm-hero-card-header">
                            <span className="fm-hero-dot" />
                            <span className="fm-hero-card-label">Your projected impact</span>
                        </div>
                        <div className="fm-hero-card-row">
                            <span className="fm-hero-card-label">Answers / week</span>
                            <span className="fm-hero-card-val">~3</span>
                        </div>
                        <div className="fm-hero-card-row">
                            <span className="fm-hero-card-label">Students reached / month</span>
                            <span className="fm-hero-card-val">~12</span>
                        </div>
                        <div className="fm-hero-card-row">
                            <span className="fm-hero-card-label">Bounty earnings / month</span>
                            <span className="fm-hero-card-val fm-hero-card-accent">$24–$80</span>
                            <span className="fm-hero-card-tag">coming soon</span>
                        </div>
                        <div className="fm-hero-card-row">
                            <span className="fm-hero-card-label">LinkedIn-ready credit</span>
                            <span className="fm-hero-card-val">Verified Mentor</span>
                        </div>
                        <div className="fm-hero-card-foot">
                            Based on typical mentor activity across partner schools.
                        </div>
                    </div>
                </div>
            </section>

            {/* ── Live stats strip ── */}
            <LiveStatsStrip items={MENTOR_ITEMS} />

            {/* ── Live unanswered questions feed ── */}
            <section className="fm-section" id="live">
                <div className="v2-section-label v2-reveal">Right now on StudySphere</div>
                <h2 className="v2-section-title v2-reveal">Questions waiting for someone like you</h2>
                <p className="fm-sub v2-reveal">
                    Pulled live from the Q&amp;A board — no login required to browse.
                </p>
                <div className="v2-reveal">
                    <OpenQuestionsFeed />
                </div>
            </section>

            {/* ── Why mentor ── */}
            <section className="fm-section" id="why">
                <div className="v2-section-label v2-reveal">Why mentor here</div>
                <h2 className="v2-section-title v2-reveal">
                    A mentor platform built for<br />the 20 minutes you have
                </h2>
                <div className="fm-pillars">
                    {PILLARS.map((p, i) => (
                        <div key={i} className="fm-pillar v2-reveal" style={{ transitionDelay: `${i * 60}ms` }}>
                            <div className="fm-pillar-icon">{p.icon}</div>
                            <div className="fm-pillar-row">
                                <h3 className="fm-pillar-title">{p.title}</h3>
                                <span className={`fm-pillar-tag ${p.tag === 'Live' ? 'live' : 'soon'}`}>
                                    {p.tag}
                                </span>
                            </div>
                            <p className="fm-pillar-desc">{p.desc}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* ── Mentors ── */}
            <section className="fm-section" id="mentors">
                <div className="v2-section-label v2-reveal">Mentors already on the platform</div>
                <h2 className="v2-section-title v2-reveal">You'll be in good company</h2>
                <div className="fm-mentors">
                    {SAMPLE_MENTORS.map((m, i) => (
                        <div key={i} className="fm-mentor v2-reveal" style={{ transitionDelay: `${i * 80}ms` }}>
                            <div className="fm-mentor-head">
                                <div className="fm-mentor-avatar" style={{ background: m.color }}>
                                    {m.init}
                                </div>
                                <div>
                                    <div className="fm-mentor-name">{m.name}</div>
                                    <div className="fm-mentor-uni">{m.uni}</div>
                                </div>
                                <div className="fm-mentor-verified" title="Verified Mentor">✔</div>
                            </div>
                            <div className="fm-mentor-metric">{m.metric}</div>
                            <div className="fm-mentor-lines">{m.lines}</div>
                            <div className="fm-mentor-tags">
                                {m.tags.map((t, j) => <span key={j}>{t}</span>)}
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* ── FAQ ── */}
            <section className="fm-section fm-faq-section">
                <div className="v2-section-label v2-reveal">Honest answers</div>
                <h2 className="v2-section-title v2-reveal">What mentors actually ask</h2>
                <div className="fm-faq">
                    <details className="fm-faq-item v2-reveal">
                        <summary>How much time does this take?</summary>
                        <p>
                            As little as 10 minutes a week. Most mentors answer 1–3 questions on their
                            commute. No scheduled sessions, no meeting commitments.
                        </p>
                    </details>
                    <details className="fm-faq-item v2-reveal">
                        <summary>Is there a vetting process?</summary>
                        <p>
                            Yes. We verify your university via LinkedIn OAuth and your IB subjects
                            against your public profile. Unverified accounts can't earn bounties.
                        </p>
                    </details>
                    <details className="fm-faq-item v2-reveal">
                        <summary>When do paid bounties launch?</summary>
                        <p>
                            Stripe Connect is in build. First 50 mentors get early access and a
                            permanent "Founding Mentor" badge — separate from the standard Verified
                            Mentor badge.
                        </p>
                    </details>
                    <details className="fm-faq-item v2-reveal">
                        <summary>Do I have to be from a top university?</summary>
                        <p>
                            No. We prioritize mentors who actually took the IB / A-Level curriculum and
                            can speak to specific command terms and mark schemes. A 45 pointer from
                            any school helps more than a PhD who never saw an IB exam.
                        </p>
                    </details>
                </div>
            </section>

            {/* ── CTA Banner ── */}
            <section className="v2-cta">
                <div className="v2-cta-inner v2-reveal">
                    <div className="v2-cta-glow" />
                    <h2 className="v2-cta-title">Your first answer is one reply away.</h2>
                    <p className="v2-cta-sub">
                        Join as a mentor, and a student will have your help within hours — not weeks.
                    </p>
                    <Link to="/registration?role=alumni" className="v2-btn-primary v2-btn-xl">
                        Apply as Mentor →
                    </Link>
                </div>
            </section>

            {/* ── Footer ── */}
            <footer className="v2-footer">
                <div className="v2-footer-inner">
                    <Link to="/" className="v2-logo">
                        <img src={Logo} alt="" className="v2-logo-img" />
                    </Link>
                    <div className="v2-footer-links">
                        <Link to="/">For Students</Link>
                        <a href="#why">Why mentor</a>
                        <a href="#live">Live questions</a>
                        <Link to="/login">Log In</Link>
                        <Link to="/registration?role=alumni">Apply as Mentor</Link>
                    </div>
                    <div className="v2-footer-copy">© {new Date().getFullYear()} StudySphere. All rights reserved.</div>
                </div>
            </footer>
        </div>
    );
};

export default ForMentors;
