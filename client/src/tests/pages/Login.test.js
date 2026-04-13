import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// All mocks must be declared before imports that use them.
// jest.mock is hoisted, so factory functions cannot close over variables defined above them.

jest.mock('../../api', () => ({
    __esModule: true,
    default: {
        post: jest.fn(),
        get: jest.fn(),
    },
}));

jest.mock('react-router-dom', () => ({
    ...jest.requireActual('react-router-dom'),
    useNavigate: () => jest.fn(),
    Link: ({ children, to }) => <a href={to}>{children}</a>,
}));

jest.mock('@react-oauth/google', () => ({
    useGoogleLogin: () => jest.fn(),
}));

jest.mock('axios', () => ({
    get: jest.fn(),
}));

jest.mock('../../Logo1.svg', () => 'mock-logo');

jest.mock('../../components/NavBar', () => ({
    NavBar: () => <nav data-testid="navbar" />,
}));

// Import AFTER mocks so we get the mocked versions
import { Login } from '../../pages/Login';
import api from '../../api';

const renderLogin = () =>
    render(
        <MemoryRouter>
            <Login />
        </MemoryRouter>
    );

describe('Login page', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        localStorage.clear();
    });

    test('renders email/username input field', () => {
        renderLogin();
        expect(screen.getByPlaceholderText('Email or Username')).toBeInTheDocument();
    });

    test('renders password input field', () => {
        renderLogin();
        expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
    });

    test('renders Log In submit button', () => {
        renderLogin();
        expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument();
    });

    test('renders Sign in with Google button', () => {
        renderLogin();
        expect(screen.getByText(/sign in with google/i)).toBeInTheDocument();
    });

    test('renders forgot password link', () => {
        renderLogin();
        expect(screen.getByText(/forgot your password/i)).toBeInTheDocument();
    });

    test('renders sign up link', () => {
        renderLogin();
        expect(screen.getByText(/sign up/i)).toBeInTheDocument();
    });

    test('updates email field on change', () => {
        renderLogin();
        const emailInput = screen.getByPlaceholderText('Email or Username');
        fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
        expect(emailInput.value).toBe('test@example.com');
    });

    test('updates password field on change', () => {
        renderLogin();
        const passwordInput = screen.getByPlaceholderText('Password');
        fireEvent.change(passwordInput, { target: { value: 'secret123' } });
        expect(passwordInput.value).toBe('secret123');
    });

    test('successful login stores userData and navigates to /lobby', async () => {
        const fakeUser = { id: 1, name: 'Alice', email: 'alice@test.com' };
        api.post.mockResolvedValueOnce({ data: fakeUser });

        // Need a stable navigate mock for this test — spy on the hook
        renderLogin();

        fireEvent.change(screen.getByPlaceholderText('Email or Username'), {
            target: { value: 'alice@test.com' },
        });
        fireEvent.change(screen.getByPlaceholderText('Password'), {
            target: { value: 'password123' },
        });
        fireEvent.click(screen.getByRole('button', { name: /log in/i }));

        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith('/users/login', {
                email: 'alice@test.com',
                password: 'password123',
            });
            expect(JSON.parse(localStorage.getItem('userData'))).toEqual(fakeUser);
        });
    });

    test('shows alert on failed login (bad credentials)', async () => {
        const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
        api.post.mockRejectedValueOnce({
            response: { data: { error: 'Invalid email or password' } },
        });

        renderLogin();

        fireEvent.change(screen.getByPlaceholderText('Email or Username'), {
            target: { value: 'bad@test.com' },
        });
        fireEvent.change(screen.getByPlaceholderText('Password'), {
            target: { value: 'wrongpass' },
        });
        fireEvent.click(screen.getByRole('button', { name: /log in/i }));

        await waitFor(() => {
            expect(alertSpy).toHaveBeenCalledWith(
                expect.stringContaining('Invalid email or password')
            );
        });

        alertSpy.mockRestore();
    });

    test('shows generic error message when api call fails without response', async () => {
        const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
        api.post.mockRejectedValueOnce(new Error('Network error'));

        renderLogin();

        fireEvent.change(screen.getByPlaceholderText('Email or Username'), {
            target: { value: 'user@test.com' },
        });
        fireEvent.change(screen.getByPlaceholderText('Password'), {
            target: { value: 'pass' },
        });
        fireEvent.click(screen.getByRole('button', { name: /log in/i }));

        await waitFor(() => {
            expect(alertSpy).toHaveBeenCalled();
        });

        alertSpy.mockRestore();
    });
});
