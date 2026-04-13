import React, { useEffect, useRef, useState } from 'react';
import { SlPin, SlTrash, SlDoc } from "react-icons/sl";
import './ChatBody.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const renderMessageContent = (message) => {
    if (!message.startsWith('__file__:')) return <p className="message-text">{message}</p>;
    try {
        const { url, name, type } = JSON.parse(message.slice(9));
        const fullUrl = `${API_URL}${url}`;
        if (type.startsWith('image/')) {
            return (
                <a href={fullUrl} target="_blank" rel="noreferrer">
                    <img src={fullUrl} alt={name} className="chat-image" />
                </a>
            );
        }
        return (
            <a href={fullUrl} download={name} className="chat-file-link" target="_blank" rel="noreferrer">
                <SlDoc size={16} /> {name}
            </a>
        );
    } catch {
        return <p className="message-text">{message}</p>;
    }
};

const ChatBody = ({ messages, onPinMessage, onDeleteMessage }) => {
    const lastMessageRef = useRef(null);
    const userData = JSON.parse(localStorage.getItem('userData') || '{}');
    const pinnedMessages = messages.filter(msg => msg.isPinned);
    const [contextMenu, setContextMenu] = useState(null);

    useEffect(() => {
        lastMessageRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        window.addEventListener("click", handleClick);
        return () => window.removeEventListener("click", handleClick);
    }, []);

    const handleRightClick = (e, msg) => {
        e.preventDefault();
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            message: msg
        });
    };

    return (
        <div className="chat-body-container">
            {pinnedMessages.length > 0 && (
                <div className="pinned-messages-container">
                    <h4 className="pinned-messages-title"><SlPin /> Pinned Messages</h4>
                    {pinnedMessages.map((msg) => (
                        <div key={msg.id} className="pinned-message-item">
                            <span className="pinned-message-content">
                                <strong>{msg.author}:</strong>{' '}
                                {msg.message.startsWith('__file__:') ? '📎 File attachment' : msg.message}
                            </span>
                            {onPinMessage && <SlPin className="unpin-icon" size={14} onClick={() => onPinMessage(msg.id)} title="Unpin message" />}
                        </div>
                    ))}
                </div>
            )}
        <div className="message-list">
            {messages.map((messageContent, index) => {
                const isMe = messageContent.author === userData.name;
                return (
                    <div
                        className={`message-wrapper ${isMe ? "me" : "other"}`}
                        key={messageContent.id || index}
                    >
                        <div
                            className={`message-bubble ${messageContent.isPinned ? 'pinned' : ''}`}
                            onContextMenu={(e) => handleRightClick(e, messageContent)}
                        >
                            {renderMessageContent(messageContent.message)}
                            <div className="message-meta">
                                <span>{messageContent.time}</span>
                                {!isMe && <span>{messageContent.author}</span>}
                            </div>
                        </div>
                    </div>
                );
            })}
            <div ref={lastMessageRef} />
        </div>
        {contextMenu && (
                <div 
                    className="context-menu"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                >
                    {onPinMessage && (
                        <div 
                            className="context-menu-item"
                            onClick={() => {
                                onPinMessage(contextMenu.message.id);
                                setContextMenu(null);
                            }}
                        >
                            <SlPin size={14} />
                            {contextMenu.message.isPinned ? 'Unpin Message' : 'Pin Message'}
                        </div>
                    )}
                    {onDeleteMessage && contextMenu.message.author === userData.name && (
                        <div 
                            className="context-menu-item delete"
                            onClick={() => {
                                onDeleteMessage(contextMenu.message.id);
                                setContextMenu(null);
                            }}
                        >
                            <SlTrash size={14} />
                            Delete Message
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ChatBody;