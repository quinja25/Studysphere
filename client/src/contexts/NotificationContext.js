import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { io } from 'socket.io-client';
import api from '../api';

const NotificationContext = createContext(null);

export const useNotifications = () => {
    const ctx = useContext(NotificationContext);
    if (!ctx) {
        // When used outside a provider (e.g. on public pages) return a no-op shape
        // so components can render defensively without crashing.
        return {
            notifications: [],
            unreadCount: 0,
            markRead: () => {},
            markAllRead: () => {},
            remove: () => {},
            enabled: false,
        };
    }
    return ctx;
};

export const NotificationProvider = ({ children }) => {
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [userId, setUserId] = useState(null);
    const socketRef = useRef(null);

    // Track logged-in user id from localStorage. Re-check on mount + storage events.
    useEffect(() => {
        const readUser = () => {
            try {
                const raw = localStorage.getItem('userData');
                const parsed = raw ? JSON.parse(raw) : null;
                setUserId(parsed?.id || null);
            } catch {
                setUserId(null);
            }
        };
        readUser();
        window.addEventListener('storage', readUser);
        return () => window.removeEventListener('storage', readUser);
    }, []);

    // Fetch initial notifications whenever user logs in
    useEffect(() => {
        if (!userId) {
            setNotifications([]);
            setUnreadCount(0);
            return;
        }
        api.get('/notifications?limit=20')
            .then(r => {
                setNotifications(r.data.notifications || []);
                setUnreadCount(r.data.unreadCount || 0);
            })
            .catch(() => {});
    }, [userId]);

    // Open a socket subscribed to user_${userId} for real-time pushes
    useEffect(() => {
        if (!userId) return undefined;
        const raw = localStorage.getItem('userData');
        const token = raw ? (JSON.parse(raw).token) : null;
        if (!token) return undefined;

        const socket = io(process.env.REACT_APP_API_URL, {
            auth: { token },
            transports: ['websocket', 'polling'],
        });
        socketRef.current = socket;

        socket.on('notification:new', (notif) => {
            setNotifications(prev => [notif, ...prev].slice(0, 50));
            setUnreadCount(c => c + 1);
        });

        return () => {
            socket.off('notification:new');
            socket.disconnect();
            socketRef.current = null;
        };
    }, [userId]);

    const markRead = useCallback(async (id) => {
        const target = notifications.find(n => n.id === id);
        if (!target || target.isRead) return;
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
        setUnreadCount(c => Math.max(0, c - 1));
        try {
            await api.put(`/notifications/${id}/read`);
        } catch {
            // revert on failure
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: false } : n));
            setUnreadCount(c => c + 1);
        }
    }, [notifications]);

    const markAllRead = useCallback(async () => {
        if (unreadCount === 0) return;
        const snapshot = notifications;
        setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
        setUnreadCount(0);
        try {
            await api.put('/notifications/read-all');
        } catch {
            setNotifications(snapshot);
        }
    }, [notifications, unreadCount]);

    const remove = useCallback(async (id) => {
        const target = notifications.find(n => n.id === id);
        if (!target) return;
        setNotifications(prev => prev.filter(n => n.id !== id));
        if (!target.isRead) setUnreadCount(c => Math.max(0, c - 1));
        try {
            await api.delete(`/notifications/${id}`);
        } catch {}
    }, [notifications]);

    const value = useMemo(() => ({
        notifications,
        unreadCount,
        markRead,
        markAllRead,
        remove,
        enabled: !!userId,
    }), [notifications, unreadCount, markRead, markAllRead, remove, userId]);

    return (
        <NotificationContext.Provider value={value}>
            {children}
        </NotificationContext.Provider>
    );
};

export default NotificationContext;
