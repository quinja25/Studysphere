import React from 'react';
import { Link } from 'react-router-dom';

export const BillingSuccess = () => (
    <div style={{
        minHeight: '100vh', background: '#080e1a', display: 'flex',
        alignItems: 'center', justifyContent: 'center', fontFamily: 'Outfit, sans-serif'
    }}>
        <div style={{
            background: '#0f1824', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 20, padding: '3rem 2.5rem', maxWidth: 440, textAlign: 'center'
        }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎉</div>
            <h2 style={{ color: '#e2e8f0', marginBottom: '0.5rem' }}>You're now Pro!</h2>
            <p style={{ color: '#94a3b8', marginBottom: '2rem', lineHeight: 1.6 }}>
                Welcome to StudySphere Pro. Unlimited AI, your personal documents, and
                Spaced Repetition are all unlocked.
            </p>
            <Link to="/dashboard" style={{
                display: 'inline-block', padding: '0.85rem 2rem',
                background: 'linear-gradient(135deg, #4a90e2, #7b68ee)',
                color: '#fff', fontWeight: 600, borderRadius: 12,
                textDecoration: 'none', fontSize: '0.95rem'
            }}>
                Go to Dashboard →
            </Link>
        </div>
    </div>
);

export default BillingSuccess;
