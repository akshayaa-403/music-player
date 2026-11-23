import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Last line of defence: a friendly screen instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Harmonic Mandala crashed:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid h-full place-items-center bg-void p-6 text-center">
        <div className="max-w-md">
          <h1 className="text-lg font-semibold text-white">Something went wrong</h1>
          <p className="mt-2 text-sm text-white/60">
            The mandala hit an unexpected error. Reloading usually fixes it; your Spotify login is kept.
          </p>
          <pre className="mt-4 max-h-32 overflow-auto rounded-lg bg-white/5 p-3 text-left text-xs text-rose-200/80">
            {this.state.error.message}
          </pre>
          <button onClick={() => window.location.reload()} className="btn-primary mt-5">
            Reload
          </button>
        </div>
      </div>
    );
  }
}
