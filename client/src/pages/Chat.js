import React, { useState, useEffect, useRef } from 'react';
import { NavBar } from '../components/NavBar';
import ChatBody from '../components/ChatBody';
import ChatFooter from '../components/ChatFooter';
import io from 'socket.io-client';
import api from '../api';
import { useLocation } from 'react-router-dom';
import './Chat.css';

export const Chat = () => {
    const [groups, setGroups] = useState([]);
    const [selectedGroup, setSelectedGroup] = useState(null);
    const [userData, setUserData] = useState({});
    const [messages, setMessages] = useState([]);
    const [myId, setMyId] = useState(null);
    const [dmPartnerNames, setDmPartnerNames] = useState({}); // groupId -> partner display name
    const socketRef = useRef(null);
    const location = useLocation();
    const autoOpenGroup = location.state?.openGroup || null;
    const autoOpened = useRef(false);

    // Create socket connection once on mount, disconnect on unmount
    useEffect(() => {
        socketRef.current = io(process.env.REACT_APP_API_URL);
        return () => {
            socketRef.current.disconnect();
        };
    }, []);

    useEffect(() => {
        const data = localStorage.getItem('userData');
        if (data) {
            const parsedData = JSON.parse(data);
            setUserData(parsedData);

            api.get(`/users/byEmail/${parsedData.email}`)
                .then(async (res) => {
                    const userId = res.data.id;
                    setMyId(userId);
                    const groupsRes = await api.get(`/groupsUsers/byUser/${userId}`);
                    const allGroups = Array.isArray(groupsRes.data) ? groupsRes.data : [];
                    setGroups(allGroups);

                    // Resolve partner names for all DM groups
                    const dms = allGroups.filter(g => g.groupName?.startsWith('__dm_'));
                    const nameMap = {};
                    await Promise.all(dms.map(async (dm) => {
                        const ids = dm.groupName.replace('__dm_', '').split('_').map(Number);
                        const partnerId = ids.find(id => id !== userId);
                        if (partnerId) {
                            try {
                                const userRes = await api.get(`/users/${partnerId}`);
                                nameMap[dm.id] = userRes.data.name || userRes.data.username || 'Unknown';
                            } catch { nameMap[dm.id] = 'Unknown'; }
                        }
                    }));
                    setDmPartnerNames(nameMap);
                })
                .catch(err => console.log(err));
        }
    }, []);

    useEffect(() => {
        if (!socketRef.current) return;
        const socket = socketRef.current;

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

    useEffect(() => {
        if (selectedGroup) {
            api.get(`/chats/${selectedGroup.id}`).then((response) => {
                setMessages(response.data);
            });
        }
    }, [selectedGroup]);

    // Auto-select group when navigating from Message button
    useEffect(() => {
        if (autoOpenGroup && groups.length > 0 && !autoOpened.current) {
            const target = groups.find(g => g.id === autoOpenGroup.id);
            if (target) {
                autoOpened.current = true;
                joinRoom(target);
            }
        }
    }, [groups, autoOpenGroup]);

    const joinRoom = (group) => {
        setSelectedGroup(group);
        setMessages([]);
        socketRef.current.emit("join_room", group.id);
    };

    const handleSendMessage = async (messageData) => {
        // Show locally immediately
        const tempId = `temp-${Date.now()}`;
        setMessages((list) => [...list, { ...messageData, id: tempId }]);

        // Save to DB then emit with real ID so receivers can pin/delete
        try {
            const chatData = {
                GroupId: messageData.room,
                message: messageData.message,
                author: messageData.author,
                time: messageData.time
            };
            const response = await api.post('/chats', chatData);
            const realId = response.data.id;

            setMessages((list) =>
                list.map(m => m.id === tempId ? { ...m, id: realId } : m)
            );
            socketRef.current.emit("send_message", { ...messageData, id: realId });
        } catch (error) {
            if (error.response?.status === 401) {
                console.error('Chat auth failed — please log out and log back in.');
            }
        }
    };

    const handlePinMessage = async (messageId) => {
        if (String(messageId).startsWith('temp-')) return;
        try {
            const response = await api.put(`/chats/pin/${messageId}`);
            setMessages(prev => prev.map(m => m.id === messageId ? { ...m, isPinned: response.data.isPinned } : m));
        } catch (error) {
            console.error("Error pinning message:", error);
        }
    };

    const handleDeleteMessage = async (messageId) => {
        if (String(messageId).startsWith('temp-')) return;
        try {
            await api.delete(`/chats/${messageId}`);
            setMessages(prev => prev.filter(m => m.id !== messageId));
        } catch (error) {
            console.error("Error deleting message:", error);
        }
    };

    const studyRooms = groups.filter(g => !g.groupName?.startsWith('__dm_'));
    const dmGroups   = groups.filter(g =>  g.groupName?.startsWith('__dm_'));

    const renderGroupItem = (group) => {
        const isDm = group.groupName.startsWith('__dm_');
        const displayName = isDm ? (dmPartnerNames[group.id] || 'Direct Message') : group.groupName;
        const subtitle    = isDm ? 'Direct message' : group.subject;
        const avatar      = isDm ? '💬' : displayName.charAt(0).toUpperCase();
        return (
            <div
                key={group.id}
                className={`group-list-item ${selectedGroup?.id === group.id ? 'active' : ''}`}
                onClick={() => joinRoom(group)}
            >
                <div className="group-avatar">{avatar}</div>
                <div className="group-info">
                    <span className="group-name">{displayName}</span>
                    <span className="group-subject">{subtitle}</span>
                </div>
            </div>
        );
    };

    return (
        <div className="chat-page-wrapper">
            <NavBar />
            <div className="chat-main-container">
                <div className="chat-groups-sidebar">
                    <div className="groups-list">
                        {studyRooms.length > 0 && (
                            <>
                                <div className="sidebar-section-header">Study Rooms</div>
                                {studyRooms.map(renderGroupItem)}
                            </>
                        )}
                        {dmGroups.length > 0 && (
                            <>
                                <div className="sidebar-section-header">Messages</div>
                                {dmGroups.map(renderGroupItem)}
                            </>
                        )}
                        {groups.length === 0 && (
                            <div className="sidebar-empty">No rooms yet</div>
                        )}
                    </div>
                </div>
                <div className="chat-window">
                    {selectedGroup ? (
                        <>
                            <div className="chat-window-header">
                                <h3>
                                    {selectedGroup.groupName.startsWith('__dm_')
                                        ? (dmPartnerNames[selectedGroup.id] || 'Direct Message')
                                        : selectedGroup.groupName}
                                </h3>
                            </div>
                            <div className="chat-window-body">
                                <ChatBody messages={messages} onPinMessage={handlePinMessage} onDeleteMessage={handleDeleteMessage} />
                            </div>
                            <div className="chat-window-footer">
                                <ChatFooter socket={socketRef.current} selectedGroupId={selectedGroup.id} onSendMessage={handleSendMessage} />
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
