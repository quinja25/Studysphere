import React, { useState, useEffect } from 'react';
import { NavBar } from '../components/NavBar';
import ChatBody from '../components/ChatBody';
import ChatFooter from '../components/ChatFooter';
import io from 'socket.io-client';
import axios from 'axios';
import './Chat.css';

const socket = io.connect("http://localhost:3001");

export const Chat = () => {
    const [groups, setGroups] = useState([]);
    const [selectedGroup, setSelectedGroup] = useState(null);
    const [userData, setUserData] = useState({});
    const [messages, setMessages] = useState([]);

    useEffect(() => {
        const data = localStorage.getItem('userData');
        if (data) {
            const parsedData = JSON.parse(data);
            setUserData(parsedData);
            
            axios.get(`http://localhost:3001/users/byEmail/${parsedData.email}`)
                .then((res) => {
                    const userId = res.data.id;
                    return axios.get(`http://localhost:3001/groupsUsers/byUser/${userId}`);
                })
                .then((res) => {
                    if (Array.isArray(res.data)) {
                        setGroups(res.data);
                    }
                })
                .catch(err => console.log(err));
        }
    }, []);

    useEffect(() => {
        const handleReceiveMessage = (data) => {
            if (selectedGroup && String(data.room) === String(selectedGroup.id)) {
                setMessages((list) => [...list, data]);
            }
        };

        socket.on('receive_message', handleReceiveMessage);

        return () => {
            socket.off('receive_message', handleReceiveMessage);
        };
    }, [selectedGroup]);

    const joinRoom = (group) => {
        setSelectedGroup(group);
        setMessages([]);
        socket.emit("join_room", group.id);
    };

    const handleSendMessage = (messageData) => {
        setMessages((list) => [...list, messageData]);
    };

    return (
        <div className="chat-page-wrapper">
            <NavBar />
            <div className="chat-main-container">
                <div className="chat-groups-sidebar">
                    <div className="sidebar-header">
                        <h3>Your Groups</h3>
                    </div>
                    <div className="groups-list">
                        {groups.map((group) => (
                            <div 
                                key={group.id} 
                                className={`group-list-item ${selectedGroup?.id === group.id ? 'active' : ''}`}
                                onClick={() => joinRoom(group)}
                            >
                                <div className="group-avatar">
                                    {group.groupName.charAt(0).toUpperCase()}
                                </div>
                                <div className="group-info">
                                    <span className="group-name">{group.groupName}</span>
                                    <span className="group-subject">{group.subject}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="chat-window">
                    {selectedGroup ? (
                        <>
                            <div className="chat-window-header">
                                <h3>{selectedGroup.groupName}</h3>
                            </div>
                            <div className="chat-window-body">
                                <ChatBody messages={messages} />
                            </div>
                            <div className="chat-window-footer">
                                <ChatFooter socket={socket} selectedGroupId={selectedGroup.id} onSendMessage={handleSendMessage} />
                            </div>
                        </>
                    ) : (
                        <div className="no-chat-selected">
                            <div className="placeholder-content">
                                <h2>Select a group to start chatting</h2>
                                <p>Join the conversation with your study group!</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};