import React, { useState, useEffect } from 'react';
import { NavBar } from '../components/NavBar';
import './Login.css';
import Logo from '../Logo1.svg';
import { useGoogleLogin } from '@react-oauth/google';
import axios from 'axios';
import api from '../api';
import { useNavigate, Link } from 'react-router-dom';

export const Login = () => {
    const [user, setUser] = useState(null);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const navigate = useNavigate();

    const login = useGoogleLogin({
        onSuccess: (codeResponse) => setUser(codeResponse),
        onError: (error) => {
            console.log('Login Failed:', error);
            alert('Google sign-in failed: ' + (error.error_description || error.error || 'Unknown error'));
        }
    });

    useEffect(() => {
        if (user) {
            // Try to log in with the Google token — server verifies it and returns JWT
            api.post('/users/google-login', { googleAccessToken: user.access_token })
                .then(response => {
                    const { id, name, email, token, picture, role, isAdmin } = response.data;
                    localStorage.setItem('userData', JSON.stringify({ id, name, email, token, picture, role, isAdmin }));
                    navigate('/lobby');
                })
                .catch((err) => {
                    if (err.response?.status === 404) {
                        // User not registered yet — fetch Google profile and go to registration
                        axios.get(`https://www.googleapis.com/oauth2/v1/userinfo?access_token=${user.access_token}`, {
                            headers: { Authorization: `Bearer ${user.access_token}`, Accept: 'application/json' }
                        }).then(res => navigate('/registration', { state: res.data }))
                          .catch(() => navigate('/registration'));
                    } else {
                        const msg = err.response?.data?.error || err.message || 'Login failed';
                        alert('Google login error: ' + msg);
                    }
                });
        }
    }, [user, navigate]);

    const handleCredentialLogin = async (e) => {
        e.preventDefault();
        try {
            const response = await api.post('/users/login', { email, password });
            if (response.data) {
                const { id, name, email: userEmail, token, picture, role, isAdmin } = response.data;
                localStorage.setItem('userData', JSON.stringify({ id, name, email: userEmail, token, picture, role, isAdmin }));
                navigate('/lobby');
            }
        } catch (error) {
            const errorMessage = error.response?.data?.error || "Invalid email or password";
            alert(errorMessage);
        }
    };

    return (
        <div className='main'>
            <div className='navBar'>
                <NavBar />
            </div>
            <div className='loginBox'>
                <img className='biglogo' src={Logo} alt="StudySphere Logo" />
                
                <form onSubmit={handleCredentialLogin} className="credential-login-form">
                    <input 
                        type="text" 
                        placeholder="Email or Username" 
                        value={email} 
                        onChange={(e) => setEmail(e.target.value)} 
                        required 
                        className="login-input"
                    />
                    <input 
                        type="password" 
                        placeholder="Password" 
                        value={password} 
                        onChange={(e) => setPassword(e.target.value)} 
                        required 
                        className="login-input"
                    />
                    <button type="submit" className="login-submit-btn">Log In</button>
                </form>

                <div className="forgot-password-link">
                    <Link to="/forgot-password">Forgot your password?</Link>
                </div>

                <div className="divider">
                    <span>OR</span>
                </div>

                <div className='logbutton'>
                    <button className='google-login-button' onClick={() => login()}>Sign in with Google 🚀 </button>
                </div>
                
                <div className="register-link">
                    Don't have an account? <Link to="/registration">Sign Up</Link>
                </div>
            </div>
        </div>
    );
}