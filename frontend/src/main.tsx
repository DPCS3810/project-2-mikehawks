import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Global error handler for startup crashes
window.onerror = function (msg, url, line, col, error) {
    document.body.innerHTML = '<div style="color:red; padding:20px; font-size:20px;">' +
        '<h1>Startup Error</h1>' +
        '<p>' + msg + '</p>' +
        '<p>' + url + ':' + line + ':' + col + '</p>' +
        '<pre>' + (error ? error.stack : 'No stack') + '</pre>' +
        '</div>';
    return false;
};

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
    constructor(props: any) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error: any) {
        return { hasError: true, error };
    }
    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: 20, color: 'red' }}>
                    <h1>Something went wrong.</h1>
                    <pre>{this.state.error?.toString()}</pre>
                </div>
            );
        }
        return this.props.children;
    }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <ErrorBoundary>
            <App />
        </ErrorBoundary>
    </React.StrictMode>
);
