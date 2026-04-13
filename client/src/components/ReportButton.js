import React, { useState } from 'react';
import api from '../api';
import './ReportButton.css';

const ReportButton = ({ reportedUserId, small }) => {
    const [showModal, setShowModal] = useState(false);
    const [type, setType] = useState('spam');
    const [description, setDescription] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const currentUser = (() => {
        const raw = localStorage.getItem('userData');
        return raw ? JSON.parse(raw) : null;
    })();

    // Don't show report button for own profile
    if (currentUser && String(currentUser.id) === String(reportedUserId)) return null;

    const handleSubmit = async () => {
        setSubmitting(true);
        try {
            await api.post('/reports', { reportedUserId, type, description });
            setSubmitted(true);
            setTimeout(() => {
                setShowModal(false);
                setSubmitted(false);
                setDescription('');
            }, 1500);
        } catch (e) {
            alert(e.response?.data?.error || 'Could not submit report');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <>
            <button
                className={`report-trigger ${small ? 'report-trigger-sm' : ''}`}
                onClick={() => setShowModal(true)}
                title="Report user"
            >
                {small ? '\u2691' : '\u2691 Report'}
            </button>

            {showModal && (
                <div className="report-modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="report-modal" onClick={e => e.stopPropagation()}>
                        {submitted ? (
                            <div className="report-success">
                                <p>Report submitted. Thank you.</p>
                            </div>
                        ) : (
                            <>
                                <h3>Report User</h3>
                                <div className="report-form-field">
                                    <label>Type</label>
                                    <select value={type} onChange={e => setType(e.target.value)}>
                                        <option value="spam">Spam</option>
                                        <option value="harassment">Harassment</option>
                                        <option value="inappropriate">Inappropriate Content</option>
                                        <option value="impersonation">Impersonation</option>
                                        <option value="other">Other</option>
                                    </select>
                                </div>
                                <div className="report-form-field">
                                    <label>Description (optional)</label>
                                    <textarea
                                        value={description}
                                        onChange={e => setDescription(e.target.value)}
                                        placeholder="Describe the issue..."
                                        rows={3}
                                    />
                                </div>
                                <div className="report-form-actions">
                                    <button className="report-cancel-btn" onClick={() => setShowModal(false)}>Cancel</button>
                                    <button className="report-submit-btn" onClick={handleSubmit} disabled={submitting}>
                                        {submitting ? 'Submitting...' : 'Submit Report'}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </>
    );
};

export default ReportButton;
