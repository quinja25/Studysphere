import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Dashboard } from '../../pages/Dashboard';
import api from '../../api';

// jest.mock is hoisted — factories cannot close over variables defined above them.
// Import the mocked module after jest.mock to get the mock reference.

jest.mock('../../api', () => ({
    __esModule: true,
    default: {
        get: jest.fn(),
        post: jest.fn(),
        put: jest.fn(),
    },
}));

jest.mock('react-router-dom', () => ({
    ...jest.requireActual('react-router-dom'),
    useNavigate: () => jest.fn(),
}));

jest.mock('../../components/NavBar', () => ({
    NavBar: () => <nav data-testid="navbar" />,
}));

jest.mock('react-icons/sl', () => ({
    SlPencil: () => <span>pencil</span>,
    SlCheck: () => <span>check</span>,
    SlClose: () => <span>close</span>,
    SlPlus: () => <span>plus</span>,
    SlFire: () => <span>fire</span>,
    SlBadge: () => <span>badge</span>,
    SlGraduation: () => <span>grad</span>,
    SlBookOpen: () => <span>book</span>,
    SlClock: () => <span>clock</span>,
    SlGraph: () => <span>graph</span>,
    SlTarget: () => <span>target</span>,
    SlDoc: () => <span>doc</span>,
}));

jest.mock('react-icons/fa', () => ({
    FaLinkedin: () => <span>li</span>,
    FaGithub: () => <span>gh</span>,
    FaGlobe: () => <span>globe</span>,
}));

const studentUserData = {
    id: 1,
    name: 'Test User',
    email: 'test@example.com',
    username: 'testuser',
    role: 'student',
    xp: 150,
    level: 2,
    isVerified: false,
    currentStreak: 5,
    longestStreak: 10,
    weeklyGoalMinutes: 120,
    weeklyStudiedMinutes: 60,
    totalStudyMinutes: 300,
    totalSessions: 10,
};

const setupApiMocks = (overrides = {}) => {
    api.get.mockImplementation((url) => {
        if (url.includes('/users/byEmail')) {
            return Promise.resolve({ data: overrides.user || studentUserData });
        }
        if (url.includes('/groupsUsers/byUser')) {
            return Promise.resolve({ data: [] });
        }
        if (url.includes('/recaps/byUser')) {
            return Promise.resolve({ data: { data: [] } });
        }
        return Promise.resolve({ data: [] });
    });
    api.post.mockResolvedValue({ data: { message: 'sent' } });
    api.put.mockResolvedValue({ data: {} });
};

const renderDashboard = () =>
    render(
        <MemoryRouter>
            <Dashboard />
        </MemoryRouter>
    );

describe('Dashboard page', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        localStorage.setItem('userData', JSON.stringify(studentUserData));
        setupApiMocks();
    });

    afterEach(() => {
        localStorage.clear();
    });

    test('shows verification banner when isVerified is false', async () => {
        renderDashboard();
        await waitFor(() => {
            expect(screen.getByText(/your email is not verified/i)).toBeInTheDocument();
        });
    });

    test('renders resend verification button in the banner', async () => {
        renderDashboard();
        await waitFor(() => {
            expect(
                screen.getByRole('button', { name: /resend verification email/i })
            ).toBeInTheDocument();
        });
    });

    test('does not show verification banner when isVerified is true', async () => {
        const verifiedUser = { ...studentUserData, isVerified: true };
        localStorage.setItem('userData', JSON.stringify(verifiedUser));
        setupApiMocks({ user: verifiedUser });

        renderDashboard();

        // Wait for async effects to settle
        await waitFor(() => {
            expect(api.get).toHaveBeenCalled();
        });

        expect(screen.queryByText(/your email is not verified/i)).toBeNull();
    });

    test('renders XP value from userData', async () => {
        renderDashboard();
        await waitFor(() => {
            // XP appears in multiple places (bar label and stat card); just verify at least one
            expect(screen.getAllByText(/150/).length).toBeGreaterThan(0);
        });
    });

    test('renders level from userData', async () => {
        renderDashboard();
        await waitFor(() => {
            const levelElements = screen.getAllByText(/lvl 2/i);
            expect(levelElements.length).toBeGreaterThan(0);
        });
    });

    test('clicking resend verification calls api.post with correct endpoint', async () => {
        renderDashboard();

        await waitFor(() => {
            expect(
                screen.getByRole('button', { name: /resend verification email/i })
            ).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: /resend verification email/i }));

        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith('/users/send-verification');
        });
    });

    test('shows success message after resend verification email', async () => {
        api.post.mockResolvedValueOnce({ data: { message: 'sent' } });

        renderDashboard();

        await waitFor(() => {
            expect(
                screen.getByRole('button', { name: /resend verification email/i })
            ).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: /resend verification email/i }));

        await waitFor(() => {
            expect(screen.getByText(/verification email sent/i)).toBeInTheDocument();
        });
    });

    test('renders tab navigation buttons', async () => {
        renderDashboard();
        await waitFor(() => {
            expect(screen.getByRole('button', { name: /^profile$/i })).toBeInTheDocument();
        });
        await waitFor(() => {
            expect(screen.getByRole('button', { name: /study stats/i })).toBeInTheDocument();
        });
        await waitFor(() => {
            expect(screen.getByRole('button', { name: /my groups/i })).toBeInTheDocument();
        });
        await waitFor(() => {
            expect(screen.getByRole('button', { name: /session recaps/i })).toBeInTheDocument();
        });
    });
});
