import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ── socket.io mock (must be before any import that pulls it in) ─────────────
// Use a plain function (not jest.fn) so jest.clearAllMocks() cannot wipe the implementation.
jest.mock('socket.io-client', () => {
    const socket = {
        emit: jest.fn(),
        on: jest.fn(),
        off: jest.fn(),
        disconnect: jest.fn(),
    };
    return () => socket;
});

jest.mock('../../api', () => ({
    __esModule: true,
    default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock('react-router-dom', () => ({
    ...jest.requireActual('react-router-dom'),
    useNavigate: () => jest.fn(),
    useParams: () => ({ id: '42' }),
}));

jest.mock('../../components/NavBar', () => ({
    NavBar: () => <nav data-testid="navbar" />,
}));
jest.mock('../../components/ChatBody', () =>
    () => <div data-testid="chat-body" />
);
jest.mock('../../components/ChatFooter', () =>
    () => <div data-testid="chat-footer" />
);
jest.mock('../../components/Whiteboard', () =>
    () => <div data-testid="whiteboard" />
);
jest.mock('../../components/AiAssistant', () =>
    ({ onClose }) => (
        <div data-testid="ai-assistant">
            <button onClick={onClose}>Close AI</button>
        </div>
    )
);
jest.mock('../../components/AmbientSound', () =>
    () => <div data-testid="ambient-sound" />
);

jest.mock('react-icons/sl', () => ({
    SlMicrophone:     () => <span>mic-icon</span>,
    SlCamrecorder:    () => <span>cam-icon</span>,
    SlBubble:         () => <span>chat-icon</span>,
    SlClose:          () => <span>close-icon</span>,
    SlLogout:         () => <span>logout-icon</span>,
    SlSizeFullscreen: () => <span>fullscreen-icon</span>,
    SlClock:          () => <span>clock-icon</span>,
    SlControlPlay:    () => <span>play-icon</span>,
    SlControlPause:   () => <span>pause-icon</span>,
    SlScreenDesktop:  () => <span>screen-icon</span>,
    SlPencil:         () => <span>pencil-icon</span>,
    SlMagicWand:      () => <span>magic-icon</span>,
    SlEarphones:      () => <span>earphones-icon</span>,
}));

// ── Browser API stubs ───────────────────────────────────────────────────────
// Plain functions (not jest.fn) so jest.clearAllMocks() cannot wipe them out.
const mockTrack = { stop: () => {}, enabled: true };
const mockStream = {
    getTracks:      () => [mockTrack],
    getVideoTracks: () => [mockTrack],
    getAudioTracks: () => [mockTrack],
};

global.RTCPeerConnection = jest.fn(() => ({
    addTrack: jest.fn(),
    createOffer: jest.fn(() => Promise.resolve({ type: 'offer', sdp: '' })),
    setLocalDescription: jest.fn(() => Promise.resolve()),
    setRemoteDescription: jest.fn(() => Promise.resolve()),
    createAnswer: jest.fn(() => Promise.resolve({ type: 'answer', sdp: '' })),
    addIceCandidate: jest.fn(() => Promise.resolve()),
    close: jest.fn(),
    ontrack: null,
    onicecandidate: null,
    onconnectionstatechange: null,
}));
global.RTCSessionDescription = jest.fn(d => d);
global.RTCIceCandidate = jest.fn(c => c);
global.MediaStream = jest.fn(() => mockStream);

import { Group } from '../../pages/Group';
import api from '../../api';

// ── Helpers ─────────────────────────────────────────────────────────────────
const userData = { id: 1, name: 'Alice', email: 'alice@test.com', token: 'tok' };

const defaultGroupData = {
    id: 42,
    groupName: 'Calc Study Room',
    subject: 'Mathematics',
    leader: 1,
};

const setupApiMocks = (overrides = {}) => {
    api.get.mockImplementation((url) => {
        if (url.includes('/users/byEmail'))
            return Promise.resolve({ data: { id: 1, name: 'Alice' } });
        if (url.includes('/groupsUsers/byGroup'))
            return Promise.resolve({ data: [{ id: 1, name: 'Alice' }] });
        if (url.includes('/groups/byID'))
            return Promise.resolve({ data: overrides.group ?? defaultGroupData });
        if (url.includes('/session-goals'))
            return Promise.resolve({ data: overrides.goals ?? [] });
        if (url.includes('/chats'))
            return Promise.resolve({ data: [] });
        return Promise.resolve({ data: [] });
    });
    api.post.mockResolvedValue({ data: { id: 1 } });
    api.put.mockResolvedValue({ data: {} });
};

const renderGroup = () =>
    render(
        <MemoryRouter initialEntries={['/group/42']}>
            <Group />
        </MemoryRouter>
    );

describe('Group study room', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        localStorage.setItem('userData', JSON.stringify(userData));
        setupApiMocks();
        Object.defineProperty(global.navigator, 'mediaDevices', {
            value: {
                getUserMedia: jest.fn().mockResolvedValue(mockStream),
                getDisplayMedia: jest.fn().mockResolvedValue(mockStream),
            },
            writable: true,
            configurable: true,
        });
        global.navigator.sendBeacon = jest.fn();
    });

    afterEach(() => localStorage.clear());

    // ── Render ────────────────────────────────────────────────────────────────

    test('renders without crashing', async () => {
        await act(async () => { renderGroup(); });
        expect(screen.getByTestId('navbar')).toBeInTheDocument();
    });

    test('loads group data and shows participants panel', async () => {
        await act(async () => { renderGroup(); });
        await waitFor(() =>
            expect(screen.getByText(/Participants/)).toBeInTheDocument()
        );
    });

    test('renders local video tile with "You" label', async () => {
        await act(async () => { renderGroup(); });
        expect(screen.getByText(/^You/)).toBeInTheDocument();
    });

    // ── Control buttons ───────────────────────────────────────────────────────

    test('renders mic toggle button (title=Mute when mic on)', async () => {
        await act(async () => { renderGroup(); });
        expect(screen.getByTitle('Mute')).toBeInTheDocument();
    });

    test('renders camera toggle button', async () => {
        await act(async () => { renderGroup(); });
        expect(screen.getByTitle('Turn Camera Off')).toBeInTheDocument();
    });

    test('renders screen share button', async () => {
        await act(async () => { renderGroup(); });
        expect(screen.getByTitle('Share Screen')).toBeInTheDocument();
    });

    test('renders chat toggle button', async () => {
        await act(async () => { renderGroup(); });
        expect(screen.getByTitle('Chat')).toBeInTheDocument();
    });

    test('renders whiteboard toggle button', async () => {
        await act(async () => { renderGroup(); });
        expect(screen.getByTitle('Whiteboard')).toBeInTheDocument();
    });

    test('renders AI assistant toggle button', async () => {
        await act(async () => { renderGroup(); });
        expect(screen.getByTitle('AI Assistant')).toBeInTheDocument();
    });

    test('renders ambient sound toggle button', async () => {
        await act(async () => { renderGroup(); });
        expect(screen.getByTitle('Ambient Sound')).toBeInTheDocument();
    });

    test('renders leave call button', async () => {
        await act(async () => { renderGroup(); });
        expect(screen.getByTitle('Leave Call')).toBeInTheDocument();
    });

    // ── Timer ─────────────────────────────────────────────────────────────────

    test('timer displays 0:00 on initial render', async () => {
        await act(async () => { renderGroup(); });
        expect(screen.getByText('0:00')).toBeInTheDocument();
    });

    test('timer shows Focus mode label by default', async () => {
        await act(async () => { renderGroup(); });
        expect(screen.getByText('Focus')).toBeInTheDocument();
    });

    // ── Sidebar toggles ───────────────────────────────────────────────────────

    test('chat sidebar is hidden by default', async () => {
        await act(async () => { renderGroup(); });
        expect(screen.queryByTestId('chat-body')).not.toBeInTheDocument();
    });

    test('clicking Chat shows chat sidebar', async () => {
        await act(async () => { renderGroup(); });
        fireEvent.click(screen.getByTitle('Chat'));
        expect(screen.getByTestId('chat-body')).toBeInTheDocument();
        expect(screen.getByTestId('chat-footer')).toBeInTheDocument();
    });

    test('clicking Chat again hides the sidebar', async () => {
        await act(async () => { renderGroup(); });
        fireEvent.click(screen.getByTitle('Chat'));
        fireEvent.click(screen.getByTitle('Chat'));
        expect(screen.queryByTestId('chat-body')).not.toBeInTheDocument();
    });

    test('whiteboard is hidden by default', async () => {
        await act(async () => { renderGroup(); });
        expect(screen.queryByTestId('whiteboard')).not.toBeInTheDocument();
    });

    test('clicking Whiteboard shows the whiteboard panel', async () => {
        await act(async () => { renderGroup(); });
        fireEvent.click(screen.getByTitle('Whiteboard'));
        expect(screen.getByTestId('whiteboard')).toBeInTheDocument();
    });

    test('AI assistant is hidden by default', async () => {
        await act(async () => { renderGroup(); });
        expect(screen.queryByTestId('ai-assistant')).not.toBeInTheDocument();
    });

    test('clicking AI Assistant shows the AI panel', async () => {
        await act(async () => { renderGroup(); });
        fireEvent.click(screen.getByTitle('AI Assistant'));
        expect(screen.getByTestId('ai-assistant')).toBeInTheDocument();
    });

    // ── Session goal modal ────────────────────────────────────────────────────

    test('goal modal appears when session has no existing goal', async () => {
        await act(async () => { renderGroup(); });
        await waitFor(() =>
            expect(screen.getByText('Set a Session Goal')).toBeInTheDocument()
        );
    });

    test('goal input has descriptive placeholder', async () => {
        await act(async () => { renderGroup(); });
        await waitFor(() =>
            expect(
                screen.getByPlaceholderText(/complete chapter 5/i)
            ).toBeInTheDocument()
        );
    });

    test('Set Goal button is disabled while goal input is empty', async () => {
        await act(async () => { renderGroup(); });
        await waitFor(() =>
            expect(screen.getByText('Set a Session Goal')).toBeInTheDocument()
        );
        expect(screen.getByRole('button', { name: /set goal/i })).toBeDisabled();
    });

    test('Set Goal button is enabled once goal text is entered', async () => {
        await act(async () => { renderGroup(); });
        await waitFor(() =>
            expect(screen.getByText('Set a Session Goal')).toBeInTheDocument()
        );
        fireEvent.change(
            screen.getByPlaceholderText(/complete chapter 5/i),
            { target: { value: 'Finish integration exercises' } }
        );
        expect(screen.getByRole('button', { name: /set goal/i })).not.toBeDisabled();
    });

    test('clicking Skip closes the goal modal', async () => {
        await act(async () => { renderGroup(); });
        await waitFor(() =>
            expect(screen.getByText('Set a Session Goal')).toBeInTheDocument()
        );
        fireEvent.click(screen.getByRole('button', { name: /skip/i }));
        expect(screen.queryByText('Set a Session Goal')).not.toBeInTheDocument();
    });

    test('goal modal is not shown when an active goal already exists', async () => {
        setupApiMocks({
            goals: [{ id: 5, goal: 'Finish chapter 3', isCompleted: false, carriedForward: false }],
        });
        await act(async () => { renderGroup(); });
        await waitFor(() => expect(api.get).toHaveBeenCalled());
        expect(screen.queryByText('Set a Session Goal')).not.toBeInTheDocument();
    });

    test('existing goal is shown in the goal banner', async () => {
        setupApiMocks({
            goals: [{ id: 5, goal: 'Finish chapter 3', isCompleted: false, carriedForward: false }],
        });
        await act(async () => { renderGroup(); });
        await waitFor(() =>
            expect(screen.getByText('Finish chapter 3')).toBeInTheDocument()
        );
    });

    test('goal banner shows Done button when goal is active', async () => {
        setupApiMocks({
            goals: [{ id: 5, goal: 'Finish chapter 3', isCompleted: false, carriedForward: false }],
        });
        await act(async () => { renderGroup(); });
        await waitFor(() =>
            expect(screen.getByRole('button', { name: /✓ done/i })).toBeInTheDocument()
        );
    });
});
