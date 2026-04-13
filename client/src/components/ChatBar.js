import React from 'react';
import { useEffect, useState } from 'react';
import api from '../api';
import './ChatRoom.css';
import { SlEnvolope } from "react-icons/sl";
import { useLocation } from 'react-router-dom';

const ChatBar = ({ socket, setSelectedGroupId, setSelectedGroupName }) => {
    const [groups, setGroups] = useState([]);
    const [userData, setUserData] = useState({ name: '', email: '', picture: '' });
    const [userId, setUserId] = useState(null);
    const location = useLocation();

    useEffect(() => {
        // Check local storage first
        const storedUserData = localStorage.getItem('userData');
        if (storedUserData) {
            const user = JSON.parse(storedUserData);
            setUserData(user);
            fetchUserId(user.email);
        } else if (location.state) {
            // If not in local storage, use location state and update local storage
            const { name, email, picture } = location.state;
            setUserData({ name, email, picture });
            localStorage.setItem('userData', JSON.stringify({ name, email, picture }));
            fetchUserId(email);
        }
    }, [location.state]);
    const fetchUserId = (email) => {
        if (email) {
            api.get(`/users/byEmail/${email}`)
                .then((res) => {
                    setUserId(res.data.id);
                })
                .catch(error => console.error('Error fetching userId:', error));
        }
    };

    // useEffect(() => {
    //     axios.get(`http://localhost:3001/groups/byUser/${userId}`).then((res) => {
    //         setGroups(res.data);
    //     })
    // }, [socket]);
    useEffect(() => {
        if (userId) {
            api.get(`/groupsUsers/byUser/${userId}`)
                .then((res) => {
                    setGroups(res.data);
                })
                .catch(error => console.error('Error fetching groups:', error));
        }
    }, [userId]);

    const handleGroupClick = (groupId, groupName) => {
        setSelectedGroupId(groupId);
        setSelectedGroupName(groupName);
        console.log(groupName);
        socket.emit('join group', groupId); // Emitting an event when a group is selected
        // Call the function passed as a prop to send the groupName information to another component
       
    };


    return (
        <div className="chat__sidebar">
            <h2><SlEnvolope />&nbsp;Your Groups</h2>

            <div>
                <h4 className="chat__header"></h4>
                <div className="chat__users">
                    {groups.map(group => (
                        <p key={group.id} onClick={() => handleGroupClick(group.id, group.groupName)} className="group-item">
                            {group.groupName} ({group.subject})
                        </p>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default ChatBar;