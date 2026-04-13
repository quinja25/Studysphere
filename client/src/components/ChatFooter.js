import React, { useState, useRef } from 'react';
import { SlPaperPlane, SlPaperClip } from "react-icons/sl";
import api from '../api';
import './ChatFooter.css';

const ChatFooter = ({ socket, selectedGroupId, onSendMessage }) => {
    const [currentMessage, setCurrentMessage] = useState("");
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef(null);
    const userData = JSON.parse(localStorage.getItem('userData') || '{}');

    const buildMessageData = (text) => ({
        room: selectedGroupId,
        author: userData.name || "Anonymous",
        message: text,
        time: new Date(Date.now()).getHours() + ":" + String(new Date(Date.now()).getMinutes()).padStart(2, '0'),
    });

    const sendMessage = async () => {
        if (currentMessage.trim() === "") return;
        onSendMessage && onSendMessage(buildMessageData(currentMessage));
        setCurrentMessage("");
    };

    const handleFileSelect = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        e.target.value = '';

        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const res = await api.post('/chats/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            const payload = JSON.stringify({ url: res.data.url, name: res.data.name, type: res.data.type });
            onSendMessage && onSendMessage(buildMessageData(`__file__:${payload}`));
        } catch (err) {
            alert('File upload failed. Max size is 10 MB.');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="chat-footer">
            <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={handleFileSelect}
            />
            <button
                className="attach-btn"
                onClick={() => fileInputRef.current.click()}
                disabled={uploading}
                title="Attach file"
            >
                {uploading ? <span className="upload-spinner" /> : <SlPaperClip size={18} />}
            </button>
            <input
                type="text"
                value={currentMessage}
                placeholder="Type a message..."
                className="chat-input"
                onChange={(e) => setCurrentMessage(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && sendMessage()}
            />
            <button onClick={sendMessage} className="send-btn">
                <SlPaperPlane size={18} />
            </button>
        </div>
    );
};

export default ChatFooter;
