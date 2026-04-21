import React from 'react';

export class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, info) {
        console.error('[ErrorBoundary]', error, info.componentStack);
    }

    render() {
        if (!this.state.hasError) return this.props.children;

        return (
            <div style={{
                minHeight: '100vh',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'Outfit, sans-serif',
                background: '#f7f9fc',
                padding: '24px',
                textAlign: 'center',
            }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '16px' }}>⚠️</div>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1a2332', marginBottom: '8px' }}>
                    Something went wrong
                </h2>
                <p style={{ color: '#64748b', fontSize: '0.95rem', marginBottom: '24px', maxWidth: '420px' }}>
                    An unexpected error occurred. Try refreshing the page — if it persists, please let us know.
                </p>
                <button
                    onClick={() => window.location.href = '/'}
                    style={{
                        padding: '10px 24px',
                        background: '#4a90e2',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '10px',
                        fontFamily: 'Outfit, sans-serif',
                        fontWeight: 600,
                        fontSize: '0.9rem',
                        cursor: 'pointer',
                    }}
                >
                    Go to home
                </button>
                {process.env.NODE_ENV === 'development' && (
                    <pre style={{
                        marginTop: '24px',
                        padding: '16px',
                        background: '#fff0f0',
                        border: '1px solid #fca5a5',
                        borderRadius: '8px',
                        fontSize: '0.75rem',
                        color: '#991b1b',
                        textAlign: 'left',
                        maxWidth: '700px',
                        overflowX: 'auto',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                    }}>
                        {this.state.error?.toString()}
                    </pre>
                )}
            </div>
        );
    }
}

export default ErrorBoundary;
