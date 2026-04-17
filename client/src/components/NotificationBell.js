import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../contexts/NotificationContext';
import './NotificationBell.css';

const TYPE_EMOJI = {
    answer: '💬',
    endorsement: '⭐',
    report_actioned: '🛡️',
};

const timeAgo = (iso) => {
    if (!iso) return '';
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(iso).toLocaleDateString();
};

export const NotificationBell = () => {
    const { notifications, unreadCount, markRead, markAllRead, remove, enabled } = useNotifications();
    const [open, setOpen] = useState(false);
    const navigate = useNavigate();
    const containerRef = useRef(null);

    useEffect(() => {
        if (!open) return undefined;
        const onClick = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, [open]);

    if (!enabled) return null;

    const handleNotifClick = async (n) => {
        if (!n.isRead) markRead(n.id);
        if (n.link) {
            setOpen(false);
            navigate(n.link);
        }
    };

    return (
        <div className="notif-bell-wrap" ref={containerRef}>
            <button
                type="button"
                className="notif-bell-btn"
                aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
                onClick={() => setOpen(v => !v)}
            >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                {unreadCount > 0 && (
                    <span className="notif-bell-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
                )}
            </button>

            {open && (
                <div className="notif-panel" role="menu">
                    <div className="notif-panel-header">
                        <span className="notif-panel-title">Notifications</span>
                        {unreadCount > 0 && (
                            <button className="notif-markall-btn" onClick={markAllRead}>
                                Mark all read
                            </button>
                        )}
                    </div>

                    <div className="notif-panel-list">
                        {notifications.length === 0 ? (
                            <p className="notif-panel-empty">You're all caught up.</p>
                        ) : notifications.map(n => (
                            <div
                                key={n.id}
                                className={`notif-item${n.isRead ? '' : ' unread'}`}
                                role="menuitem"
                                onClick={() => handleNotifClick(n)}
                            >
                                <span className="notif-item-emoji">{TYPE_EMOJI[n.type] || '🔔'}</span>
                                <div className="notif-item-body">
                                    <p className="notif-item-content">{n.content}</p>
                                    <span className="notif-item-time">{timeAgo(n.createdAt)}</span>
                                </div>
                                <button
                                    className="notif-item-dismiss"
                                    title="Dismiss"
                                    onClick={(e) => { e.stopPropagation(); remove(n.id); }}
                                >
                                    ×
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotificationBell;
