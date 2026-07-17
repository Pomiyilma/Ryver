import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(249,115,22,0.10),_transparent_30%),linear-gradient(135deg,_#050607_0%,_#0b0d10_100%)] text-zinc-100 flex items-center justify-center px-4">
          <div className="rounded-[24px] border border-white/10 bg-[#0f1115]/90 p-8 max-w-md text-center shadow-[0_20px_60px_-30px_rgba(0,0,0,0.55)]">
            <div className="flex justify-center mb-4">
              <div className="rounded-full border border-brand-rose/30 bg-brand-rose/10 p-3">
                <svg className="h-8 w-8 text-brand-rose" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">Something went wrong</h2>
            <p className="text-sm text-zinc-400 mb-4">
              The dashboard encountered an unexpected error. This has been logged and we're working to fix it.
            </p>
            {this.state.error && (
              <details className="text-left mb-4">
                <summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-300">
                  Technical details
                </summary>
                <pre className="mt-2 text-xs text-zinc-600 bg-black/20 p-2 rounded overflow-auto">
                  {this.state.error.toString()}
                </pre>
              </details>
            )}
            <button
              onClick={() => window.location.reload()}
              className="rounded-full bg-brand-orange px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-orange/90"
            >
              Reload the page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
