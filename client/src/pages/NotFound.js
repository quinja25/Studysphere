import React from 'react';
import { Link } from 'react-router-dom';
import { NavBar } from '../components/NavBar';
import './NotFound.css';

export const NotFound = () => {
    return (
        <div className="not-found-page">
            <NavBar />
            <div className="not-found-container">
                <div className="not-found-content">
                    <h1 className="not-found-code">404</h1>
                    <h2 className="not-found-title">Page not found</h2>
                    <p className="not-found-subtitle">
                        The page you're looking for doesn't exist or has been moved.
                    </p>
                    <div className="not-found-actions">
                        <Link to="/" className="not-found-btn not-found-btn-primary">Go Home</Link>
                        <Link to="/lobby" className="not-found-btn not-found-btn-outline">Go to Lobby</Link>
                    </div>
                </div>
            </div>
        </div>
    );
};
