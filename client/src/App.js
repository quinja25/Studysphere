import './App.css';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

// pages
import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { FindGroup } from './pages/FindGroup';
import { Chat } from './pages/Chat';
import { Dashboard } from './pages/Dashboard';
import { Group } from './pages/Group';
import { CreateGroup } from './pages/CreateGroup';
import { Registration } from './pages/Registration';
import { Lobby } from './pages/Lobby';
import { Schedule } from './pages/Schedule';
import { SearchAlumni } from './pages/SearchAlumni';
import { AlumniProfile } from './pages/AlumniProfile';
import { Marketplace } from './pages/Marketplace';
import { Wiki } from './pages/Wiki';
import { QABoard } from './pages/QABoard';
import { AdminDashboard } from './pages/AdminDashboard';
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPassword } from './pages/ResetPassword';
import VerifyEmail from './pages/VerifyEmail';
import { AiChat } from './pages/AiChat';
import { NotFound } from './pages/NotFound';

// Redirect to /login if not authenticated
const ProtectedRoute = ({ children }) => {
  const isLoggedIn = !!localStorage.getItem('userData');
  return isLoggedIn ? children : <Navigate to="/login" replace />;
};

// Redirect to /lobby if not an admin
const AdminRoute = ({ children }) => {
  const raw = localStorage.getItem('userData');
  if (!raw) return <Navigate to="/login" replace />;
  try {
    const user = JSON.parse(raw);
    if (!user.isAdmin) return <Navigate to="/lobby" replace />;
  } catch {
    return <Navigate to="/login" replace />;
  }
  return children;
};

export const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route index element={<Home />} />
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
        <Route path="/search-alumni" element={<ProtectedRoute><SearchAlumni /></ProtectedRoute>} />
        <Route path="/alumni/:id" element={<ProtectedRoute><AlumniProfile /></ProtectedRoute>} />
        <Route path="/marketplace" element={<ProtectedRoute><Marketplace /></ProtectedRoute>} />
        <Route path="/ai-chat" element={<ProtectedRoute><AiChat /></ProtectedRoute>} />

        {/* Admin-only route */}
        <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />

        {/* Redirect legacy duplicate paths */}
        <Route path="/findgroup" element={<Navigate to="/find-group" replace />} />
        <Route path="/creategroup" element={<Navigate to="/create-group" replace />} />

        {/* 404 fallback */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
