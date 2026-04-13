import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { NavBar } from '../components/NavBar';
import api from '../api';
import './ForgotPassword.css';

export const ForgotPassword = () => {
    const [email, setEmail] = useState('');
    const [submitted, setSubmitted] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await api.post('/users/forgot-password', { email });
            setSubmitted(true);
        } catch (err) {
            setError(err.response?.data?.error || 'Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="forgot-page">
            <NavBar />
            <div className="forgot-container">
                <div className="forgot-card">
                    <h1 className="forgot-title">Reset your password</h1>

                    {submitted ? (
                        <div className="forgot-success">
                            <div className="forgot-success-icon">✓</div>
                            <p>If an account with that email exists, we've sent a reset link.</p>
                            <p className="forgot-success-sub">Check your inbox (and spam folder). The link expires in 15 minutes.</p>
                            <Link to="/login" className="forgot-back-link">Back to Login</Link>
                        </div>
                    ) : (
                        <>
                            <p className="forgot-subtitle">
                                Enter your email address and we'll send you a link to reset your password.
                            </p>
                            <form onSubmit={handleSubmit} className="forgot-form">
                                <input
                                    type="email"
                                    placeholder="Your email address"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    className="forgot-input"
                                />
                                {error && <p className="forgot-error">{error}</p>}
                                <button type="submit" className="forgot-btn" disabled={loading}>
                                    {loading ? 'Sending…' : 'Send Reset Link'}
                                </button>
                            </form>
                            <Link to="/login" className="forgot-back-link">Back to Login</Link>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
