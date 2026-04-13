import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import AiAssistant from '../../components/AiAssistant';

jest.mock('../../api', () => ({
    __esModule: true,
    default: {
        get: jest.fn((url) => {
            if (url === '/ai/credits') return Promise.resolve({ data: { creditsUsed: 1000, creditsLimit: 50000 } });
            return Promise.resolve({ data: [] });
        }),
        post: jest.fn().mockResolvedValue({ data: {} }),
        delete: jest.fn().mockResolvedValue({ data: {} }),
    },
}));

jest.mock('../../components/ConfirmModal', () => () => null);

jest.mock('react-icons/sl', () => ({
    SlClose: () => null,
    SlPaperPlane: () => null,
    SlDocs: () => null,
    SlCheck: () => null,
    SlTrash: () => null,
}));

const mockSocket = {
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
};

const defaultProps = {
    groupId: 1,
    group: { id: 1, subject: 'Mathematics', major: 'Science', gradeLevel: 'IB HL' },
    socket: mockSocket,
    onClose: jest.fn(),
};

describe('AiAssistant component', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('renders without crashing with required props', () => {
        const { container } = render(<AiAssistant {...defaultProps} />);
        expect(container.firstChild).not.toBeNull();
    });

    test('renders AI Assistant heading', () => {
        render(<AiAssistant {...defaultProps} />);
        expect(screen.getByText('AI Assistant')).toBeInTheDocument();
    });

    test('renders the chat textarea input field', () => {
        render(<AiAssistant {...defaultProps} />);
        const textarea = screen.getByRole('textbox');
        expect(textarea).toBeInTheDocument();
    });

    test('send button is present', () => {
        render(<AiAssistant {...defaultProps} />);
        expect(screen.getByTitle('Send')).toBeInTheDocument();
    });

    test('send button is disabled when input is empty', () => {
        render(<AiAssistant {...defaultProps} />);
        expect(screen.getByTitle('Send')).toBeDisabled();
    });

    test('send button is enabled when input has text', () => {
        render(<AiAssistant {...defaultProps} />);
        const textarea = screen.getByRole('textbox');
        fireEvent.change(textarea, { target: { value: 'What is calculus?' } });
        expect(screen.getByTitle('Send')).not.toBeDisabled();
    });

    test('renders close button', () => {
        render(<AiAssistant {...defaultProps} />);
        expect(screen.getByTitle('Close')).toBeInTheDocument();
    });

    test('calls onClose when close button is clicked', () => {
        render(<AiAssistant {...defaultProps} />);
        fireEvent.click(screen.getByTitle('Close'));
        expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    });

    test('renders group subject tag in the header', () => {
        render(<AiAssistant {...defaultProps} />);
        // The subject tag is inside .ai-subject-tag — use a more specific query
        const subjectTag = document.querySelector('.ai-subject-tag');
        expect(subjectTag).not.toBeNull();
        expect(subjectTag.textContent).toBe('Mathematics');
    });

    test('renders toolbar buttons (Quiz Me, Summarise, Docs)', () => {
        render(<AiAssistant {...defaultProps} />);
        expect(screen.getByText(/quiz me/i)).toBeInTheDocument();
        expect(screen.getByText(/summarise/i)).toBeInTheDocument();
        expect(screen.getByText(/docs/i)).toBeInTheDocument();
    });

    test('renders tokens left indicator', () => {
        render(<AiAssistant {...defaultProps} />);
        expect(screen.getByText(/tokens left today/i)).toBeInTheDocument();
    });

    test('renders without socket (socket prop is null)', () => {
        const { container } = render(<AiAssistant {...defaultProps} socket={null} />);
        expect(container.firstChild).not.toBeNull();
    });

    test('renders suggested prompts for Mathematics in empty state', () => {
        render(<AiAssistant {...defaultProps} />);
        expect(screen.getByText('Explain the chain rule')).toBeInTheDocument();
    });

    test('textarea placeholder reflects group subject', () => {
        render(<AiAssistant {...defaultProps} />);
        const textarea = screen.getByRole('textbox');
        expect(textarea).toHaveAttribute('placeholder', 'Ask about Mathematics\u2026');
    });
});
