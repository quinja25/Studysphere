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

import { QABoard } from '../../pages/QABoard';
import api from '../../api';

const mockQuestions = [
    {
        id: 1,
        title: 'What is calculus?',
        body: 'I need help understanding derivatives.',
        subject: 'Mathematics',
        tags: 'calculus,math',
        isAnswered: false,
        authorId: 1,
        author: { name: 'Alice' },
        answers: [],
    },
    {
        id: 2,
        title: 'How does photosynthesis work?',
        body: 'Biology question about plants.',
        subject: 'Biology',
        tags: '',
        isAnswered: true,
        authorId: 2,
        author: { name: 'Bob' },
        answers: [
            {
                id: 10,
                content: 'Plants use sunlight to convert CO2 into glucose.',
                votes: 3,
                isAccepted: true,
                authorId: 3,
                author: { name: 'Carol', role: 'alumni' },
            },
        ],
    },
];

const setupMocks = (overrides = {}) => {
    api.get.mockImplementation((url) => {
        if (/\/qa\/\d+/.test(url)) {
            const id = parseInt(url.split('/qa/')[1]);
            const q = mockQuestions.find(q => q.id === id) || mockQuestions[0];
            return Promise.resolve({ data: q });
        }
        if (url.includes('/qa')) {
            return Promise.resolve({
                data: { data: overrides.questions ?? mockQuestions, hasMore: false },
            });
        }
        return Promise.resolve({ data: {} });
    });
    api.post.mockResolvedValue({ data: { id: 99, title: 'New', body: '', subject: '', tags: '' } });
    api.delete.mockResolvedValue({});
};

const renderQA = (user = null) => {
    if (user) localStorage.setItem('userData', JSON.stringify(user));
    return render(<MemoryRouter><QABoard /></MemoryRouter>);
};

describe('QABoard page', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        localStorage.clear();
        setupMocks();
    });

    afterEach(() => localStorage.clear());

    test('renders Q&A Board heading', async () => {
        renderQA();
        // 'Q&A Board' appears in both the sidebar header and the placeholder — getAllByText handles both
        await waitFor(() => expect(screen.getAllByText('Q&A Board').length).toBeGreaterThan(0));
    });

    test('shows Login to Ask link when not authenticated', async () => {
        renderQA();
        await waitFor(() => expect(screen.getByText(/login to ask/i)).toBeInTheDocument());
    });

    test('shows Ask a Question button when authenticated', async () => {
        renderQA({ id: 1, name: 'Alice' });
        await waitFor(() =>
            expect(screen.getByText(/\+ ask a question/i)).toBeInTheDocument()
        );
    });

    test('renders search input', () => {
        renderQA();
        expect(screen.getByPlaceholderText(/search questions/i)).toBeInTheDocument();
    });

    test('renders subject filter with All Subjects option', () => {
        renderQA();
        expect(screen.getByText('All Subjects')).toBeInTheDocument();
    });

    test('renders questions from API', async () => {
        renderQA();
        await waitFor(() => {
            expect(screen.getByText('What is calculus?')).toBeInTheDocument();
            expect(screen.getByText('How does photosynthesis work?')).toBeInTheDocument();
        });
    });

    test('shows empty state when there are no questions', async () => {
        setupMocks({ questions: [] });
        renderQA();
        await waitFor(() =>
            expect(screen.getByText(/no questions yet/i)).toBeInTheDocument()
        );
    });

    test('shows Answered badge on answered questions', async () => {
        renderQA();
        await waitFor(() => expect(screen.getByText('Answered')).toBeInTheDocument());
    });

    test('renders tag pills on questions with tags', async () => {
        renderQA();
        await waitFor(() => {
            expect(screen.getByText('#calculus')).toBeInTheDocument();
            expect(screen.getByText('#math')).toBeInTheDocument();
        });
    });

    test('ask form toggles open when button clicked', async () => {
        renderQA({ id: 1, name: 'Alice' });
        await waitFor(() =>
            expect(screen.getByText(/\+ ask a question/i)).toBeInTheDocument()
        );
        fireEvent.click(screen.getByText(/\+ ask a question/i));
        expect(screen.getByPlaceholderText(/title — be specific/i)).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/describe your question/i)).toBeInTheDocument();
    });

    test('ask form shows Cancel button when open', async () => {
        renderQA({ id: 1, name: 'Alice' });
        await waitFor(() =>
            expect(screen.getByText(/\+ ask a question/i)).toBeInTheDocument()
        );
        fireEvent.click(screen.getByText(/\+ ask a question/i));
        // When form is open: the toggle button switches to "Cancel" AND the form has its own
        // Cancel button — both share the same text so we assert at least one is present.
        expect(screen.getAllByText('Cancel').length).toBeGreaterThan(0);
    });

    test('AI Suggest button is disabled when body is empty', async () => {
        renderQA({ id: 1, name: 'Alice' });
        await waitFor(() => fireEvent.click(screen.getByText(/\+ ask a question/i)));
        expect(screen.getByTitle(/auto-suggest/i)).toBeDisabled();
    });

    test('AI Suggest button is enabled when body has content', async () => {
        renderQA({ id: 1, name: 'Alice' });
        await waitFor(() => fireEvent.click(screen.getByText(/\+ ask a question/i)));
        fireEvent.change(screen.getByPlaceholderText(/describe your question/i), {
            target: { value: 'How do derivatives work in calculus?' },
        });
        expect(screen.getByTitle(/auto-suggest/i)).not.toBeDisabled();
    });

    test('pressing Enter in tag input adds a tag pill', async () => {
        renderQA({ id: 1, name: 'Alice' });
        await waitFor(() => fireEvent.click(screen.getByText(/\+ ask a question/i)));
        const tagInput = screen.getByPlaceholderText(/add tags/i);
        fireEvent.change(tagInput, { target: { value: 'algebra' } });
        fireEvent.keyDown(tagInput, { key: 'Enter' });
        await waitFor(() => expect(screen.getByText('#algebra')).toBeInTheDocument());
    });

    test('pressing comma in tag input adds a tag pill', async () => {
        renderQA({ id: 1, name: 'Alice' });
        await waitFor(() => fireEvent.click(screen.getByText(/\+ ask a question/i)));
        const tagInput = screen.getByPlaceholderText(/add tags/i);
        fireEvent.change(tagInput, { target: { value: 'geometry' } });
        fireEvent.keyDown(tagInput, { key: ',' });
        await waitFor(() => expect(screen.getByText('#geometry')).toBeInTheDocument());
    });

    test('clicking a question opens it in the detail panel', async () => {
        renderQA();
        await waitFor(() => expect(screen.getByText('What is calculus?')).toBeInTheDocument());
        fireEvent.click(screen.getByText('What is calculus?'));
        await waitFor(() =>
            expect(screen.getByText('I need help understanding derivatives.')).toBeInTheDocument()
        );
    });

    test('question detail shows answer count', async () => {
        renderQA();
        await waitFor(() => expect(screen.getByText('What is calculus?')).toBeInTheDocument());
        fireEvent.click(screen.getByText('What is calculus?'));
        await waitFor(() => expect(screen.getByText(/0 answers/i)).toBeInTheDocument());
    });

    test('question author sees Delete button in detail view', async () => {
        renderQA({ id: 1, name: 'Alice' });
        await waitFor(() => expect(screen.getByText('What is calculus?')).toBeInTheDocument());
        fireEvent.click(screen.getByText('What is calculus?'));
        await waitFor(() =>
            expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument()
        );
    });

    test('clicking Delete question opens confirm modal', async () => {
        renderQA({ id: 1, name: 'Alice' });
        await waitFor(() => fireEvent.click(screen.getByText('What is calculus?')));
        await waitFor(() =>
            fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
        );
        await waitFor(() =>
            expect(screen.getByTestId('confirm-modal')).toBeInTheDocument()
        );
        expect(screen.getByText('Delete Question')).toBeInTheDocument();
    });

    test('confirming delete calls api.delete', async () => {
        renderQA({ id: 1, name: 'Alice' });
        await waitFor(() => fireEvent.click(screen.getByText('What is calculus?')));
        await waitFor(() =>
            fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
        );
        await waitFor(() => expect(screen.getByTestId('confirm-modal')).toBeInTheDocument());
        fireEvent.click(screen.getByText('Confirm'));
        await waitFor(() =>
            expect(api.delete).toHaveBeenCalledWith('/qa/1')
        );
    });

    test('answer form is shown for logged-in users on question detail', async () => {
        renderQA({ id: 5, name: 'Dave' });
        await waitFor(() => fireEvent.click(screen.getByText('What is calculus?')));
        await waitFor(() =>
            expect(screen.getByPlaceholderText(/write your answer here/i)).toBeInTheDocument()
        );
    });

    test('unauthenticated users see login prompt instead of answer form', async () => {
        renderQA();
        await waitFor(() => fireEvent.click(screen.getByText('What is calculus?')));
        await waitFor(() =>
            expect(screen.getByText(/log in/i)).toBeInTheDocument()
        );
        expect(screen.queryByPlaceholderText(/write your answer/i)).not.toBeInTheDocument();
    });
});
