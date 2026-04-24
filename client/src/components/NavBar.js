import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { googleLogout } from '@react-oauth/google';
import Logo from '../Logo1.svg';
import { NotificationBell } from './NotificationBell';
import './NavBar.css';

export const NavBar = () => {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const navigate = useNavigate();

    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => {
        const userData = localStorage.getItem('userData');
        setIsLoggedIn(!!userData);
        if (userData) {
            try {
                const parsed = JSON.parse(userData);
                setIsAdmin(!!parsed.isAdmin);
            } catch (e) {}
        }
    }, []);

    const handleLogout = () => {
        googleLogout();
        localStorage.removeItem('userData');
        setIsLoggedIn(false);
        navigate('/');
    };

    const logoLink = isLoggedIn ? '/lobby' : '/';

    return (
        <div className='main-navbar'>
            <Link to={logoLink} className="navbar-logo-container">
                <img className='navbar-logo' src={Logo} alt="StudySphere Logo" />
            </Link>

            <div className="navbar-links">
                {isLoggedIn && (
                    <>
                        <Link to="/find-group" className="navbar-link">Find Group</Link>
                        <Link to="/marketplace" className="navbar-link">Marketplace</Link>
                        <Link to="/wiki" className="navbar-link">Wiki</Link>
                        <Link to="/qa" className="navbar-link">Q&A</Link>
                        <Link to="/ai-chat" className="navbar-link">AI Chat</Link>
                        <Link to="/schedule" className="navbar-link">Schedule</Link>
                        <Link to="/create-group" className="navbar-link">Create Group</Link>
                        <Link to="/dashboard" className="navbar-link">My Profile</Link>
                        <Link to="/chat" className="navbar-link">Chat</Link>
                        {isAdmin && <Link to="/admin" className="navbar-link navbar-admin-link">Admin</Link>}
                        <NotificationBell />
                        <button onClick={handleLogout} className="navbar-button">Log Out</button>
                    </>
                )}
            </div>
        </div>
    );
}