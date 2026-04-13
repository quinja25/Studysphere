import React, { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { NavBar } from '../components/NavBar';
import api from '../api';
import './ForgotPassword.css';

export const ResetPassword = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const token = searchParams.get('token');

    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    if (!token) {
        return (
            <div className="forgot-page">
                <NavBar />
                <div className="forgot-container">
                    <div className="forgot-card">
                        <h1 className="forgot-title">Invalid link</h1>
                        <p className="forgot-subtitle">This password reset link is missing or invalid.</p>
                        <Link to="/forgot-password" className="forgot-btn" style={{ textAlign: 'center', display: 'block', textDecoration: 'none' }}>
                            Request a new link
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (password.length < 6) {
            setError('Password must be at least 6 characters.');
            return;
        }
        if (password !== confirm) {
            setError('Passwords do not match.');
            return;
        }
        setLoading(true);
        try {
            await api.post('/users/reset-password', { token, password });
            setSuccess(true);
            setTimeout(() => navigate('/login'), 3000);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to reset password. The link may have expired.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="forgot-page">
            <NavBar />
            <div className="forgot-container">
                <div className="forgot-card">
                    <h1 className="forgot-title">Set new password</h1>

                    {success ? (
                        <div className="forgot-success">
                            <div className="forgot-success-icon">✓</div>
                            <p>Password updated successfully!</p>
                            <p className="forgot-success-sub">Redirecting you to login…</p>
                            <Link to="/login" className="forgot-back-link">Go to Login now</Link>
                        </div>
                    ) : (
                        <>
                            <p className="forgot-subtitle">Choose a new password for your account.</p>
                            <form onSubmit={handleSubmit} className="forgot-form">
                                <input
                                    type="password"
                                    placeholder="New password (min 6 characters)"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    className="forgot-input"
                                />
                                <input
                                    type="password"
                                    placeholder="Confirm new password"
                                    value={confirm}
                                    onChange={(e) => setConfirm(e.target.value)}
                                    required
                                    className="forgot-input"
                                />
                                {error && <p className="forgot-error">{error}</p>}
                                <button type="submit" className="forgot-btn" disabled={loading}>
                                    {loading ? 'Saving…' : 'Set New Password'}
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
