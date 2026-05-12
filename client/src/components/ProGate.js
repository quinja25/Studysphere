import React, { useState } from 'react';
import api from '../api';
import './ProGate.css';

// Wraps any Pro-only feature. If the user is not Pro, renders an upgrade overlay.
// Usage: <ProGate feature="Spaced Repetition">{children}</ProGate>
export const ProGate = ({ children, feature = 'this feature' }) => {
    const raw = localStorage.getItem('userData');
    const user = raw ? JSON.parse(raw) : null;
    const isPro = user?.isPro;

    const [loading, setLoading] = useState(false);
    const [plan, setPlan] = useState('monthly');

    const handleUpgrade = async () => {
        setLoading(true);
        try {
            const { data } = await api.post('/billing/checkout', { plan });
            window.location.href = data.url;
        } catch {
            setLoading(false);
        }
    };

    if (isPro) return children;

    return (
        <div className="pg-gate">
            <div className="pg-blur">{children}</div>
            <div className="pg-overlay">
                <div className="pg-card">
                    <div className="pg-lock">🔒</div>
                    <h3 className="pg-title">Pro feature</h3>
                    <p className="pg-desc">
                        <strong>{feature}</strong> is available on StudySphere Pro.
                        Unlock unlimited AI, your personal study documents, and more.
                    </p>

                    <div className="pg-plans">
                        <button
                            className={`pg-plan ${plan === 'monthly' ? 'pg-plan--active' : ''}`}
                            onClick={() => setPlan('monthly')}
                        >
                            <span className="pg-plan-name">Monthly</span>
                            <span className="pg-plan-price">$7<span>/mo</span></span>
                        </button>
                        <button
                            className={`pg-plan ${plan === 'yearly' ? 'pg-plan--active' : ''}`}
                            onClick={() => setPlan('yearly')}
                        >
                            <span className="pg-plan-name">Yearly</span>
                            <span className="pg-plan-price">$59<span>/yr</span></span>
                            <span className="pg-plan-badge">Save 30%</span>
                        </button>
                    </div>

                    <button
                        className="pg-btn"
                        onClick={handleUpgrade}
                        disabled={loading}
                    >
                        {loading ? 'Redirecting…' : 'Upgrade to Pro →'}
                    </button>

                    <p className="pg-note">Cancel anytime · No hidden fees</p>
                </div>
            </div>
        </div>
    );
};

export default ProGate;
