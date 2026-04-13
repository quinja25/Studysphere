import React from 'react';
import { render, screen } from '@testing-library/react';

// Prevent axios ESM parse error (axios v1+ ships ESM-only index.js)
jest.mock('axios', () => ({
  create: jest.fn(() => ({
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
  })),
}));

jest.mock('./api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('@react-oauth/google', () => ({
  GoogleOAuthProvider: ({ children }) => <>{children}</>,
  useGoogleLogin: () => jest.fn(),
}));

// Stub all pages to avoid deep import chains (socket.io, WebRTC, canvas, AiAssistant, etc.)
jest.mock('./pages/Home', () => ({ Home: () => <div data-testid="page-home">Home</div> }));
jest.mock('./pages/Login', () => ({ Login: () => <div data-testid="page-login">Login</div> }));
jest.mock('./pages/FindGroup', () => ({ FindGroup: () => <div data-testid="page-findgroup" /> }));
jest.mock('./pages/Chat', () => ({ Chat: () => <div data-testid="page-chat" /> }));
jest.mock('./pages/Dashboard', () => ({ Dashboard: () => <div data-testid="page-dashboard" /> }));
jest.mock('./pages/Group', () => ({ Group: () => <div data-testid="page-group" /> }));
jest.mock('./pages/CreateGroup', () => ({ CreateGroup: () => <div data-testid="page-creategroup" /> }));
jest.mock('./pages/Registration', () => ({ Registration: () => <div data-testid="page-registration" /> }));
jest.mock('./pages/Lobby', () => ({ Lobby: () => <div data-testid="page-lobby" /> }));
jest.mock('./pages/Schedule', () => ({ Schedule: () => <div data-testid="page-schedule" /> }));
jest.mock('./pages/SearchAlumni', () => ({ SearchAlumni: () => <div data-testid="page-searchalumni" /> }));
jest.mock('./pages/AlumniProfile', () => ({ AlumniProfile: () => <div data-testid="page-alumniprofile" /> }));
jest.mock('./pages/Marketplace', () => ({ Marketplace: () => <div data-testid="page-marketplace" /> }));
jest.mock('./pages/Wiki', () => ({ Wiki: () => <div data-testid="page-wiki" /> }));
jest.mock('./pages/QABoard', () => ({ QABoard: () => <div data-testid="page-qaboard" /> }));
jest.mock('./pages/AdminDashboard', () => ({ AdminDashboard: () => <div data-testid="page-admindashboard" /> }));
jest.mock('./pages/ForgotPassword', () => ({ ForgotPassword: () => <div data-testid="page-forgotpassword" /> }));
jest.mock('./pages/ResetPassword', () => ({ ResetPassword: () => <div data-testid="page-resetpassword" /> }));
jest.mock('./pages/VerifyEmail', () => ({ __esModule: true, default: () => <div data-testid="page-verifyemail" /> }));
jest.mock('./pages/AiChat', () => ({ AiChat: () => <div data-testid="page-aichat" /> }));
jest.mock('./pages/NotFound', () => ({ NotFound: () => <div data-testid="page-notfound" /> }));

import App from './App';

describe('App routing', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.pushState({}, '', '/');
  });

  afterEach(() => {
    localStorage.clear();
  });

  test('renders home page at root path', () => {
    render(<App />);
    expect(screen.getByTestId('page-home')).toBeInTheDocument();
  });

  test('renders login page at /login', () => {
    window.history.pushState({}, '', '/login');
    render(<App />);
    expect(screen.getByTestId('page-login')).toBeInTheDocument();
  });

  test('ProtectedRoute redirects to /login when not authenticated', () => {
    window.history.pushState({}, '', '/lobby');
    render(<App />);
    expect(screen.getByTestId('page-login')).toBeInTheDocument();
    expect(screen.queryByTestId('page-lobby')).not.toBeInTheDocument();
  });

  test('ProtectedRoute renders protected page when authenticated', () => {
    localStorage.setItem('userData', JSON.stringify({ id: 1, name: 'Alice', isAdmin: false }));
    window.history.pushState({}, '', '/lobby');
    render(<App />);
    expect(screen.getByTestId('page-lobby')).toBeInTheDocument();
  });

  test('AdminRoute redirects to /login when not authenticated', () => {
    window.history.pushState({}, '', '/admin');
    render(<App />);
    expect(screen.getByTestId('page-login')).toBeInTheDocument();
    expect(screen.queryByTestId('page-admindashboard')).not.toBeInTheDocument();
  });

  test('AdminRoute redirects to /lobby when authenticated but not admin', () => {
    localStorage.setItem('userData', JSON.stringify({ id: 1, name: 'Alice', isAdmin: false }));
    window.history.pushState({}, '', '/admin');
    render(<App />);
    expect(screen.queryByTestId('page-admindashboard')).not.toBeInTheDocument();
    expect(screen.getByTestId('page-lobby')).toBeInTheDocument();
  });

  test('AdminRoute renders admin dashboard when user is admin', () => {
    localStorage.setItem('userData', JSON.stringify({ id: 1, name: 'Admin', isAdmin: true }));
    window.history.pushState({}, '', '/admin');
    render(<App />);
    expect(screen.getByTestId('page-admindashboard')).toBeInTheDocument();
  });

  test('/wiki is publicly accessible without auth', () => {
    window.history.pushState({}, '', '/wiki');
    render(<App />);
    expect(screen.getByTestId('page-wiki')).toBeInTheDocument();
  });

  test('/qa is publicly accessible without auth', () => {
    window.history.pushState({}, '', '/qa');
    render(<App />);
    expect(screen.getByTestId('page-qaboard')).toBeInTheDocument();
  });

  test('renders 404 page for unknown routes', () => {
    window.history.pushState({}, '', '/this-does-not-exist');
    render(<App />);
    expect(screen.getByTestId('page-notfound')).toBeInTheDocument();
  });

  test('/findgroup legacy path redirects to /find-group', () => {
    localStorage.setItem('userData', JSON.stringify({ id: 1, name: 'Alice', isAdmin: false }));
    window.history.pushState({}, '', '/findgroup');
    render(<App />);
    // After redirect, find-group page should be shown
    expect(screen.getByTestId('page-findgroup')).toBeInTheDocument();
  });
});
