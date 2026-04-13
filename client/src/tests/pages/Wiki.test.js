import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

jest.mock('../../api', () => ({
    __esModule: true,
    default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock('react-router-dom', () => ({
    ...jest.requireActual('react-router-dom'),
    useNavigate: () => jest.fn(),
    Link: ({ children, to }) => <a href={to}>{children}</a>,
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

import { Wiki } from '../../pages/Wiki';
import api from '../../api';

const alumniUser = { id: 2, name: 'Alumni1', role: 'alumni' };
const studentUser = { id: 5, name: 'Student1', role: 'student' };

const mockArticles = [
    {
        id: 1,
        title: 'Introduction to Calculus',
        subject: 'Mathematics',
        content: 'Calculus is the mathematical study of change.',
        tags: 'calculus,math',
        views: 42,
        authorId: 2,
        author: { name: 'Alumni1' },
        createdAt: '2025-01-01T00:00:00Z',
    },
    {
        id: 2,
        title: "Newton's Laws of Motion",
        subject: 'Physics',
        content: 'Newton described three laws of motion.',
        tags: '',
        views: 10,
        authorId: 3,
        author: { name: 'Alumni2' },
        createdAt: '2025-01-02T00:00:00Z',
    },
];

const setupMocks = (overrides = {}) => {
    api.get.mockImplementation((url) => {
        if (/\/wiki\/\d+/.test(url)) {
            const id = parseInt(url.split('/wiki/')[1]);
            const article = mockArticles.find(a => a.id === id) || mockArticles[0];
            return Promise.resolve({ data: article });
        }
        if (url.includes('/wiki')) {
            return Promise.resolve({
                data: { data: overrides.articles ?? mockArticles, hasMore: false },
            });
        }
        return Promise.resolve({ data: {} });
    });
    api.post.mockResolvedValue({ data: { id: 99, title: 'New Article', content: '' } });
    api.put.mockResolvedValue({ data: {} });
    api.delete.mockResolvedValue({});
};

const renderWiki = (user = null) => {
    if (user) localStorage.setItem('userData', JSON.stringify(user));
    return render(<MemoryRouter><Wiki /></MemoryRouter>);
};

describe('Wiki page', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        localStorage.clear();
        setupMocks();
    });

    afterEach(() => localStorage.clear());

    test('renders Knowledge Wiki heading', async () => {
        renderWiki();
        await waitFor(() =>
            expect(screen.getByText('Knowledge Wiki')).toBeInTheDocument()
        );
    });

    test('does not show New Article button for unauthenticated users', async () => {
        renderWiki();
        await waitFor(() => expect(api.get).toHaveBeenCalled());
        expect(screen.queryByText(/\+ new article/i)).not.toBeInTheDocument();
    });

    test('does not show New Article button for students', async () => {
        renderWiki(studentUser);
        await waitFor(() => expect(api.get).toHaveBeenCalled());
        expect(screen.queryByText(/\+ new article/i)).not.toBeInTheDocument();
    });

    test('shows New Article button for alumni', async () => {
        renderWiki(alumniUser);
        await waitFor(() =>
            expect(screen.getByText(/\+ new article/i)).toBeInTheDocument()
        );
    });

    test('renders search input', () => {
        renderWiki();
        expect(screen.getByPlaceholderText(/search articles/i)).toBeInTheDocument();
    });

    test('renders subject filter with All Subjects option', () => {
        renderWiki();
        expect(screen.getByText('All Subjects')).toBeInTheDocument();
    });

    test('renders articles from API in sidebar', async () => {
        renderWiki();
        await waitFor(() => {
            expect(screen.getByText('Introduction to Calculus')).toBeInTheDocument();
            expect(screen.getByText("Newton's Laws of Motion")).toBeInTheDocument();
        });
    });

    test('shows empty state when there are no articles', async () => {
        setupMocks({ articles: [] });
        renderWiki();
        await waitFor(() =>
            expect(screen.getByText(/no articles yet/i)).toBeInTheDocument()
        );
    });

    test('clicking an article opens it in the main panel', async () => {
        renderWiki();
        await waitFor(() =>
            expect(screen.getByText('Introduction to Calculus')).toBeInTheDocument()
        );
        fireEvent.click(screen.getByText('Introduction to Calculus'));
        await waitFor(() =>
            expect(
                screen.getByText('Calculus is the mathematical study of change.')
            ).toBeInTheDocument()
        );
    });

    test('article detail shows view count', async () => {
        renderWiki();
        await waitFor(() =>
            expect(screen.getByText('Introduction to Calculus')).toBeInTheDocument()
        );
        fireEvent.click(screen.getByText('Introduction to Calculus'));
        await waitFor(() =>
            expect(screen.getByText(/42 views/i)).toBeInTheDocument()
        );
    });

    test('article detail shows tags', async () => {
        renderWiki();
        await waitFor(() =>
            expect(screen.getByText('Introduction to Calculus')).toBeInTheDocument()
        );
        fireEvent.click(screen.getByText('Introduction to Calculus'));
        await waitFor(() => {
            expect(screen.getByText('#calculus')).toBeInTheDocument();
            expect(screen.getByText('#math')).toBeInTheDocument();
        });
    });

    test('alumni author sees Edit and Delete buttons on own article', async () => {
        renderWiki(alumniUser);
        await waitFor(() =>
            expect(screen.getByText('Introduction to Calculus')).toBeInTheDocument()
        );
        fireEvent.click(screen.getByText('Introduction to Calculus'));
        await waitFor(() => {
            expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument();
        });
    });

    test('alumni does not see Edit/Delete on another author\'s article', async () => {
        renderWiki(alumniUser);
        await waitFor(() =>
            expect(screen.getByText("Newton's Laws of Motion")).toBeInTheDocument()
        );
        fireEvent.click(screen.getByText("Newton's Laws of Motion"));
        await waitFor(() =>
            expect(
                screen.getByText('Newton described three laws of motion.')
            ).toBeInTheDocument()
        );
        expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument();
    });

    test('New Article form appears when button clicked', async () => {
        renderWiki(alumniUser);
        await waitFor(() =>
            expect(screen.getByText(/\+ new article/i)).toBeInTheDocument()
        );
        fireEvent.click(screen.getByText(/\+ new article/i));
        expect(screen.getByPlaceholderText('Title')).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/write your article/i)).toBeInTheDocument();
    });

    test('Cancel button in form hides the form', async () => {
        renderWiki(alumniUser);
        await waitFor(() =>
            expect(screen.getByText(/\+ new article/i)).toBeInTheDocument()
        );
        fireEvent.click(screen.getByText(/\+ new article/i));
        await waitFor(() =>
            expect(screen.getByPlaceholderText('Title')).toBeInTheDocument()
        );
        // When form is open, both the sidebar toggle and the form itself show "Cancel".
        // The form's cancel button is last in DOM order (main panel renders after sidebar).
        const cancelBtns = screen.getAllByRole('button', { name: /^cancel$/i });
        fireEvent.click(cancelBtns[cancelBtns.length - 1]);
        expect(screen.queryByPlaceholderText('Title')).not.toBeInTheDocument();
    });

    test('AI Suggest button is disabled when content is empty', async () => {
        renderWiki(alumniUser);
        await waitFor(() =>
            expect(screen.getByText(/\+ new article/i)).toBeInTheDocument()
        );
        fireEvent.click(screen.getByText(/\+ new article/i));
        await waitFor(() =>
            expect(screen.getByPlaceholderText('Title')).toBeInTheDocument()
        );
        expect(screen.getByTitle(/auto-suggest/i)).toBeDisabled();
    });

    test('AI Suggest button is enabled when content has text', async () => {
        renderWiki(alumniUser);
        await waitFor(() =>
            expect(screen.getByText(/\+ new article/i)).toBeInTheDocument()
        );
        fireEvent.click(screen.getByText(/\+ new article/i));
        await waitFor(() =>
            expect(screen.getByPlaceholderText(/write your article/i)).toBeInTheDocument()
        );
        fireEvent.change(screen.getByPlaceholderText(/write your article/i), {
            target: { value: 'Here is some article content to summarize.' },
        });
        expect(screen.getByTitle(/auto-suggest/i)).not.toBeDisabled();
    });

    test('clicking Delete on own article opens confirm modal', async () => {
        renderWiki(alumniUser);
        await waitFor(() =>
            expect(screen.getByText('Introduction to Calculus')).toBeInTheDocument()
        );
        fireEvent.click(screen.getByText('Introduction to Calculus'));
        await waitFor(() =>
            expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument()
        );
        fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));
        await waitFor(() =>
            expect(screen.getByTestId('confirm-modal')).toBeInTheDocument()
        );
        expect(screen.getByText('Delete Article')).toBeInTheDocument();
    });

    test('confirming delete calls api.delete and removes article', async () => {
        renderWiki(alumniUser);
        await waitFor(() =>
            expect(screen.getByText('Introduction to Calculus')).toBeInTheDocument()
        );
        fireEvent.click(screen.getByText('Introduction to Calculus'));
        await waitFor(() =>
            expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument()
        );
        fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));
        await waitFor(() =>
            expect(screen.getByTestId('confirm-modal')).toBeInTheDocument()
        );
        fireEvent.click(screen.getByText('Confirm'));
        await waitFor(() => {
            expect(api.delete).toHaveBeenCalledWith('/wiki/1');
            expect(screen.queryByText('Introduction to Calculus')).not.toBeInTheDocument();
        });
    });

    test('Edit button pre-fills form with article data', async () => {
        renderWiki(alumniUser);
        await waitFor(() =>
            expect(screen.getByText('Introduction to Calculus')).toBeInTheDocument()
        );
        fireEvent.click(screen.getByText('Introduction to Calculus'));
        await waitFor(() =>
            expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument()
        );
        fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
        await waitFor(() => {
            const titleInput = screen.getByPlaceholderText('Title');
            expect(titleInput.value).toBe('Introduction to Calculus');
        });
    });
});
