import React from 'react';
import { logError, normalizeError, type ExtensionError } from '@/shared/errors/error-utils';
import { logger } from '@/shared/utils/logger';

const errorLogger = logger.create('ErrorBoundary');

export class ExtensionErrorBoundary extends React.Component<
  React.PropsWithChildren<object>,
  { error: ExtensionError | null }
> {
  constructor(props: React.PropsWithChildren<object>) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: unknown): { error: ExtensionError } {
    return { error: normalizeError(error) };
  }

  componentDidCatch(error: unknown, errorInfo: React.ErrorInfo) {
    const normalizedError = normalizeError(error);
    logError(normalizedError, 'ReactErrorBoundary');
    errorLogger.error('React error info:', errorInfo);
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md text-sm">
          <p className="font-bold text-red-800">Something went wrong</p>
          <p className="mt-1 text-red-700">{this.state.error.userMessage}</p>
          <button
            onClick={() => this.setState({ error: null })}
            className="mt-2 px-3 py-1 bg-red-100 text-red-800 rounded text-sm hover:bg-red-200"
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
