import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

jest.mock('../../api', () => ({
    __esModule: true,
    default: { get: jest.fn(), post: jest.fn(), delete: jest.fn() },
}));

jest.mock('react-router-dom', () => ({
    ...jest.requireActual('react-router-dom'),
    useNavigate: () => jest.fn(),
    useLocation: () => ({ state: null }),
}));

jest.mock('../../components/NavBar', () => ({
    NavBar: () => <nav data-testid="navbar" />,
}));

jest.mock('../../components/ConfirmModal', () =>
    ({ isOpen, title, onConfirm, onCancel }) =>
        isOpen ? (
            <div data-testid="confirm-modal">
                <span>{title}</span>
                <button onClick={onConfirm}>Confirm</button>
                <button onClick={onCancel}>Cancel</button>
            </div>
        ) : null
);

jest.mock('react-icons/sl', () => ({
    SlPlus: () => <span>plus</span>,
    SlMagnifier: () => <span>mag</span>,
    SlTrash: () => <span>trash</span>,
}));

import { Lobby } from '../../pages/Lobby';
import api from '../../api';

const TODAY = new Date().toLocaleDateString('en-CA');
const YESTERDAY = new Date(Date.now() - 86400000).toLocaleDateString('en-CA');

const userData = { id: 1, name: 'Alice', email: 'alice@test.com' };

const mockGroups = [
    { id: 10, groupName: 'Math Study', subject: 'Math', major: 'Science', gradeLevel: 'Grade 11', leader: 1 },
    { id: 11, groupName: 'Physics Study', subject: 'Physics', major: 'Science', gradeLevel: 'Grade 12', leader: 2 },
    { id: 12, groupName: '__dm_1_2', subject: '', major: '', gradeLevel: '', leader: 1 },
];

const setupMocks = (overrides = {}) => {
    api.get.mockImplementation((url) => {
        if (url.includes('/users/byEmail')) {
            return Promise.resolve({
                data: {
                    id: 1,
                    currentStreak: overrides.streak ?? 5,
                    lastStudyDate: overrides.lastStudyDate ?? YESTERDAY,
                },
            });
        }
        if (url.includes('/groupsUsers/byUser')) {
            return Promise.resolve({ data: overrides.groups ?? mockGroups });
        }
        return Promise.resolve({ data: [] });
    });
    api.delete.mockResolvedValue({});
};

const renderLobby = () =>
    render(<MemoryRouter><Lobby /></MemoryRouter>);

describe('Lobby page', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        localStorage.setItem('userData', JSON.stringify(userData));
        setupMocks();
    });

    afterEach(() => localStorage.clear());

    test('renders welcome message with user name from localStorage', async () => {
        renderLobby();
        await waitFor(() => {
            expect(screen.getByText('Alice')).toBeInTheDocument();
        });
    });

    test('renders Create Study Room button', () => {
        renderLobby();
        expect(screen.getByText(/create study room/i)).toBeInTheDocument();
    });

    test('renders Find Study Room button', () => {
        renderLobby();
        expect(screen.getByText(/find study room/i)).toBeInTheDocument();
    });

    test('renders groups from API and filters out __dm_ groups', async () => {
        renderLobby();
        await waitFor(() => {
            expect(screen.getByText('Math Study')).toBeInTheDocument();
            expect(screen.getByText('Physics Study')).toBeInTheDocument();
            expect(screen.queryByText('__dm_1_2')).not.toBeInTheDocument();
        });
    });

    test('shows empty state when user has no groups', async () => {
        setupMocks({ groups: [] });
        renderLobby();
        await waitFor(() => {
            expect(screen.getByText(/haven't joined any study rooms yet/i)).toBeInTheDocument();
        });
    });

    test('shows streak banner when streak is active and not studied today', async () => {
        setupMocks({ streak: 7, lastStudyDate: YESTERDAY });
        renderLobby();
        await waitFor(() => {
            expect(screen.getByText(/7-day streak/i)).toBeInTheDocument();
        });
    });

    test('does not show streak banner when already studied today', async () => {
        setupMocks({ streak: 7, lastStudyDate: TODAY });
        renderLobby();
        await waitFor(() => expect(api.get).toHaveBeenCalled());
        expect(screen.queryByText(/day streak/i)).not.toBeInTheDocument();
    });

    test('does not show streak banner when streak is zero', async () => {
        setupMocks({ streak: 0, lastStudyDate: YESTERDAY });
        renderLobby();
        await waitFor(() => expect(api.get).toHaveBeenCalled());
        expect(screen.queryByText(/day streak/i)).not.toBeInTheDocument();
    });

    test('shows Host badge on rooms where user is the leader', async () => {
        renderLobby();
        await waitFor(() => {
            expect(screen.getByText('Host')).toBeInTheDocument();
        });
    });

    test('right-click on own room opens context menu', async () => {
        renderLobby();
        await waitFor(() => expect(screen.getByText('Math Study')).toBeInTheDocument());
        fireEvent.contextMenu(screen.getByText('Math Study').closest('.group-card'));
        expect(screen.getByText(/delete room/i)).toBeInTheDocument();
    });

    test('right-click on non-owned room does not open context menu', async () => {
        renderLobby();
        await waitFor(() => expect(screen.getByText('Physics Study')).toBeInTheDocument());
        fireEvent.contextMenu(screen.getByText('Physics Study').closest('.group-card'));
        expect(screen.queryByText(/delete room/i)).not.toBeInTheDocument();
    });

    test('clicking Delete Room opens confirm modal', async () => {
        renderLobby();
        await waitFor(() => expect(screen.getByText('Math Study')).toBeInTheDocument());
        fireEvent.contextMenu(screen.getByText('Math Study').closest('.group-card'));
        fireEvent.click(screen.getByText(/delete room/i));
        expect(screen.getByTestId('confirm-modal')).toBeInTheDocument();
        expect(screen.getByText('Delete Room')).toBeInTheDocument();
    });

    test('confirming delete calls api.delete and removes the group', async () => {
        renderLobby();
        await waitFor(() => expect(screen.getByText('Math Study')).toBeInTheDocument());
        fireEvent.contextMenu(screen.getByText('Math Study').closest('.group-card'));
        fireEvent.click(screen.getByText(/delete room/i));
        fireEvent.click(screen.getByText('Confirm'));
        await waitFor(() => {
            expect(api.delete).toHaveBeenCalledWith('/groups/10');
            expect(screen.queryByText('Math Study')).not.toBeInTheDocument();
        });
    });

    test('cancelling delete modal keeps group in list', async () => {
        renderLobby();
        await waitFor(() => expect(screen.getByText('Math Study')).toBeInTheDocument());
        fireEvent.contextMenu(screen.getByText('Math Study').closest('.group-card'));
        fireEvent.click(screen.getByText(/delete room/i));
        fireEvent.click(screen.getByText('Cancel'));
        expect(api.delete).not.toHaveBeenCalled();
        expect(screen.getByText('Math Study')).toBeInTheDocument();
    });
});
