import React from 'react';
import './ConfirmModal.css';

/**
 * ConfirmModal - replaces window.confirm() with a styled modal.
 * Props:
 *   isOpen     {boolean}  - whether the modal is visible
 *   title      {string}   - modal heading (e.g. "Delete Post")
 *   message    {string}   - body text (e.g. "Are you sure? This cannot be undone.")
 *   onConfirm  {function} - called when user clicks the confirm button
 *   onCancel   {function} - called when user clicks cancel or the overlay
 *   confirmText {string}  - label for the confirm button (default "Confirm")
 *   cancelText  {string}  - label for the cancel button (default "Cancel")
 *   danger     {boolean}  - if true, confirm button is red (for destructive actions)
 */
function ConfirmModal({ isOpen, title, message, onConfirm, onCancel, confirmText = 'Confirm', cancelText = 'Cancel', danger = false }) {
    if (!isOpen) return null;
    return (
        <div className="confirm-overlay" onClick={onCancel}>
            <div className="confirm-modal" onClick={e => e.stopPropagation()}>
                {title && <h3 className="confirm-title">{title}</h3>}
                <p className="confirm-message">{message}</p>
                <div className="confirm-actions">
                    <button className="confirm-cancel-btn" onClick={onCancel}>{cancelText}</button>
                    <button className={`confirm-ok-btn${danger ? ' danger' : ''}`} onClick={onConfirm}>{confirmText}</button>
                </div>
            </div>
        </div>
    );
}

export default ConfirmModal;
