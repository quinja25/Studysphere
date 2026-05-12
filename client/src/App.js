import './App.css';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { HelmetProvider } from 'react-helmet-async';
import api from './api';
import { NotificationProvider } from './contexts/NotificationContext';
import { ErrorBoundary } from './components/ErrorBoundary';

// pages
import { Home } from './pages/Home';
import { Waitlist } from './pages/Waitlist';
import { Login } from './pages/Login';
import { FindGroup } from './pages/FindGroup';
import { Chat } from './pages/Chat';
import { Dashboard } from './pages/Dashboard';
import { Group } from './pages/Group';
import { CreateGroup } from './pages/CreateGroup';
import { Registration } from './pages/Registration';
import { Lobby } from './pages/Lobby';
import { Schedule } from './pages/Schedule';
import { Marketplace } from './pages/Marketplace';
import { Wiki } from './pages/Wiki';
import { QABoard } from './pages/QABoard';
import { AdminDashboard } from './pages/AdminDashboard';
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPassword } from './pages/ResetPassword';
import VerifyEmail from './pages/VerifyEmail';
import { AiChat } from './pages/AiChat';
import { BillingSuccess } from './pages/BillingSuccess';
import { NotFound } from './pages/NotFound';

// Redirect to /login if not authenticated
const ProtectedRoute = ({ children }) => {
  const isLoggedIn = !!localStorage.getItem('userData');
  return isLoggedIn ? children : <Navigate to="/login" replace />;
};

// Redirect to /lobby if not an admin — verified server-side to prevent localStorage spoofing
const AdminRoute = ({ children }) => {
  const [status, setStatus] = useState('checking'); // 'checking' | 'allowed' | 'denied' | 'unauthed'

  useEffect(() => {
    const raw = localStorage.getItem('userData');
    if (!raw) { setStatus('unauthed'); return; }
    api.get('/admin/dashboard')
      .then(() => setStatus('allowed'))
      .catch((err) => {
        if (err.response?.status === 401) setStatus('unauthed');
        else setStatus('denied');
      });
  }, []);

  if (status === 'checking') return null;
  if (status === 'unauthed') return <Navigate to="/login" replace />;
  if (status === 'denied') return <Navigate to="/lobby" replace />;
  return children;
};

export const App = () => {
  return (
    <HelmetProvider>
    <BrowserRouter>
      <ErrorBoundary>
      <NotificationProvider>
      <Routes>
        {/* Public routes */}
        <Route index element={<Waitlist />} />
        <Route path="/home" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/registration" element={<Registration />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/verify-email" element={<VerifyEmail />} />

        {/* Publicly readable — auth only required for write actions (handled in component) */}
        <Route path="/wiki" element={<Wiki />} />
        <Route path="/qa" element={<QABoard />} />

        {/* Protected routes */}
        <Route path="/lobby" element={<ProtectedRoute><Lobby /></ProtectedRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/find-group" element={<ProtectedRoute><FindGroup /></ProtectedRoute>} />
        <Route path="/create-group" element={<ProtectedRoute><CreateGroup /></ProtectedRoute>} />
        <Route path="/chat" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
        <Route path="/group/:id" element={<ProtectedRoute><Group /></ProtectedRoute>} />
        <Route path="/schedule" element={<ProtectedRoute><Schedule /></ProtectedRoute>} />
        <Route path="/marketplace" element={<ProtectedRoute><Marketplace /></ProtectedRoute>} />
        <Route path="/ai-chat" element={<ProtectedRoute><AiChat /></ProtectedRoute>} />
        <Route path="/billing/success" element={<ProtectedRoute><BillingSuccess /></ProtectedRoute>} />

        {/* Admin-only route */}
        <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />

        {/* Redirect legacy duplicate paths */}
        <Route path="/findgroup" element={<Navigate to="/find-group" replace />} />
        <Route path="/creategroup" element={<Navigate to="/create-group" replace />} />

        {/* 404 fallback */}
        <Route path="*" element={<NotFound />} />
      </Routes>
      </NotificationProvider>
      </ErrorBoundary>
    </BrowserRouter>
    </HelmetProvider>
  );
}

export default App;
