import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-dark-bg select-none h-full">
          <div className="w-16 h-16 rounded-3xl bg-accent-red/20 border border-accent-red/30 flex items-center justify-center mb-4 text-accent-red">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h2 className="text-base font-bold text-white mb-1">Something went wrong in chat</h2>
          <p className="text-xs text-surface-400 max-w-sm mb-4">
            An unexpected render issue occurred. Tap below to reload the conversation safely.
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            className="px-4 py-2 rounded-xl gradient-primary text-white text-xs font-bold flex items-center gap-2 shadow-lg hover:opacity-90 active:scale-95 transition-all cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Reload Chat</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
