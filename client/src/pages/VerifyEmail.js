import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import api from '../api';
import './VerifyEmail.css';

function VerifyEmail() {
    const [searchParams] = useSearchParams();
    const [status, setStatus] = useState('loading'); // 'loading' | 'success' | 'error'
    const [message, setMessage] = useState('');

    useEffect(() => {
        const token = searchParams.get('token');
        if (!token) {
            setStatus('error');
            setMessage('No verification token found in the URL.');
            return;
        }
        api.get(`/users/verify-email?token=${token}`)
            .then(res => {
                setStatus('success');
                setMessage(res.data.message || 'Email verified successfully!');
            })
            .catch(err => {
                setStatus('error');
                setMessage(err.response?.data?.error || 'Invalid or expired verification link.');
            });
    }, [searchParams]);

    return (
        <div className="verify-email-page">
            <div className="verify-email-card">
                <h1>Email Verification</h1>
                {status === 'loading' && <p className="verify-loading">Verifying your email...</p>}
                {status === 'success' && (
                    <>
                        <div className="verify-icon verify-success">✓</div>
                        <p className="verify-message">{message}</p>
                        <Link to="/login" className="verify-btn">Go to Login</Link>
                    </>
                )}
                {status === 'error' && (
                    <>
                        <div className="verify-icon verify-error">✗</div>
                        <p className="verify-message">{message}</p>
                        <Link to="/login" className="verify-btn">Go to Login</Link>
                    </>
                )}
            </div>
        </div>
    );
}

export default VerifyEmail;
