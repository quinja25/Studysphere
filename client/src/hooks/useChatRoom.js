import { useState } from 'react';
import api from '../api';

/**
 * Manages chat messages for a study room.
 * Call addMessage() from the parent's socket receive_message handler
 * to append incoming messages without an extra API round-trip.
 */
export const useChatRoom = (id, socketRef) => {
    const [messages, setMessages]   = useState([]);
    const [chatError, setChatError] = useState(null);

    /** Seed messages from the initial GET /chats/:id response. */
    const loadMessages = (msgs) => setMessages(msgs);

    /** Append a single message — used by the socket receive_message handler. */
    const addMessage = (msg) => setMessages(prev => [...prev, msg]);

    const handleSendMessage = async (messageData) => {
        setChatError(null);
        const tempId = `temp-${Date.now()}`;
        setMessages(list => [...list, { ...messageData, id: tempId }]);
        try {
            const response = await api.post('/chats', {
                GroupId: messageData.room,
                message: messageData.message,
                author: messageData.author,
                time: messageData.time,
            });
            const realId = response.data.id;
            setMessages(list => list.map(m => m.id === tempId ? { ...m, id: realId } : m));
            socketRef.current?.emit('send_message', { ...messageData, id: realId });
        } catch (error) {
            if (error.response?.status === 401) {
                setChatError('Session expired — please log out and log back in to save messages.');
            }
        }
    };

    const handlePinMessage = async (messageId) => {
        if (String(messageId).startsWith('temp-')) return;
        try {
            const response = await api.put(`/chats/pin/${messageId}`);
            setMessages(prev => prev.map(m =>
                m.id === messageId ? { ...m, isPinned: response.data.isPinned } : m
            ));
        } catch (error) {
            console.error('Error pinning message:', error);
        }
    };

    const handleDeleteMessage = async (messageId) => {
        if (String(messageId).startsWith('temp-')) return;
        try {
            await api.delete(`/chats/${messageId}`);
            setMessages(prev => prev.filter(m => m.id !== messageId));
        } catch (error) {
            console.error('Error deleting message:', error);
        }
    };

    return {
        messages, chatError,
        loadMessages, addMessage,
        handleSendMessage, handlePinMessage, handleDeleteMessage,
    };
};
