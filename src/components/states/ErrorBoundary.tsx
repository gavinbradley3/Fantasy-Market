// Root render-error boundary. Catches RENDER-phase throws (request errors are
// handled separately by the query layer's error states) and shows a safe
// fallback instead of React's blank-white-screen unmount. Detailed error info
// goes to the console for development; users see a generic, recoverable panel.

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Development/observability detail stays out of the UI. When an error
    // reporter (Sentry-class) arrives, this is its single hook point.
    console.error('[PlayerTicker] render error:', error, info.componentStack);
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  private reload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div
        role="alert"
        className="flex min-h-screen flex-col items-center justify-center bg-base px-6 text-center"
      >
        <p className="font-mono text-4xl" aria-hidden>
          ▼
        </p>
        <h1 className="mt-4 font-display text-xl font-semibold text-text-primary">
          Something went wrong
        </h1>
        <p className="mt-2 max-w-md text-sm text-text-secondary">
          PlayerTicker hit an unexpected error and couldn't render this view. Your watchlist and
          portfolio are safe — they're stored locally on this device.
        </p>
        {import.meta.env.DEV && (
          <pre className="mt-3 max-w-xl overflow-x-auto rounded-control border border-down/30 bg-surface p-3 text-left text-xs text-down">
            {this.state.error.message}
          </pre>
        )}
        <div className="mt-5 flex gap-3">
          <button
            onClick={this.reset}
            className="rounded-control border border-border-subtle px-4 py-2 text-sm font-semibold text-text-primary transition hover:bg-elevated"
          >
            Try again
          </button>
          <button
            onClick={this.reload}
            className="rounded-control bg-up px-4 py-2 text-sm font-semibold text-base transition hover:brightness-110"
          >
            Reload PlayerTicker
          </button>
        </div>
      </div>
    );
  }
}
