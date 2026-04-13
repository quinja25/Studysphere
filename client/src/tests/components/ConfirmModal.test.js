import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ConfirmModal from '../../components/ConfirmModal';

describe('ConfirmModal', () => {
    const defaultProps = {
        isOpen: true,
        title: 'Delete Item',
        message: 'Are you sure? This cannot be undone.',
        onConfirm: jest.fn(),
        onCancel: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('renders nothing when isOpen is false', () => {
        const { container } = render(<ConfirmModal {...defaultProps} isOpen={false} />);
        expect(container.firstChild).toBeNull();
    });

    test('renders modal content when isOpen is true', () => {
        render(<ConfirmModal {...defaultProps} />);
        expect(screen.getByText('Delete Item')).toBeInTheDocument();
        expect(screen.getByText('Are you sure? This cannot be undone.')).toBeInTheDocument();
    });

    test('renders correct title and message text', () => {
        render(<ConfirmModal {...defaultProps} title="Custom Title" message="Custom message." />);
        expect(screen.getByText('Custom Title')).toBeInTheDocument();
        expect(screen.getByText('Custom message.')).toBeInTheDocument();
    });

    test('calls onConfirm when confirm button is clicked', () => {
        render(<ConfirmModal {...defaultProps} />);
        fireEvent.click(screen.getByText('Confirm'));
        expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1);
    });

    test('calls onCancel when cancel button is clicked', () => {
        render(<ConfirmModal {...defaultProps} />);
        fireEvent.click(screen.getByText('Cancel'));
        expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
    });

    test('calls onCancel when overlay is clicked', () => {
        render(<ConfirmModal {...defaultProps} />);
        const overlay = document.querySelector('.confirm-overlay');
        fireEvent.click(overlay);
        expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
    });

    test('applies danger class to confirm button when danger prop is true', () => {
        render(<ConfirmModal {...defaultProps} danger={true} />);
        const confirmBtn = screen.getByText('Confirm');
        expect(confirmBtn).toHaveClass('danger');
    });

    test('does not apply danger class when danger prop is false', () => {
        render(<ConfirmModal {...defaultProps} danger={false} />);
        const confirmBtn = screen.getByText('Confirm');
        expect(confirmBtn).not.toHaveClass('danger');
    });

    test('uses confirmText prop for confirm button label', () => {
        render(<ConfirmModal {...defaultProps} confirmText="Yes, Delete" />);
        expect(screen.getByText('Yes, Delete')).toBeInTheDocument();
    });

    test('uses cancelText prop for cancel button label', () => {
        render(<ConfirmModal {...defaultProps} cancelText="No, Keep It" />);
        expect(screen.getByText('No, Keep It')).toBeInTheDocument();
    });

    test('uses default button labels when not provided', () => {
        render(<ConfirmModal {...defaultProps} />);
        expect(screen.getByText('Confirm')).toBeInTheDocument();
        expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    test('does not render title element when title is not provided', () => {
        render(<ConfirmModal {...defaultProps} title={undefined} />);
        expect(screen.queryByRole('heading')).toBeNull();
    });
});
