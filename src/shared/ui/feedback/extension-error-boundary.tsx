/** Reusable React root error boundary for extension-owned UI surfaces. */
// src/shared/ui/feedback/extension-error-boundary.tsx

import { Component, type ErrorInfo, type PropsWithChildren, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

import {
	logError,
	normalizeError,
} from "@/shared/errors/error-utils";
import type { ExtensionError } from "@/shared/errors/error.types";
import { logger } from '@/shared/utils/logger';

const errorLogger = logger.create('ErrorBoundary');

type ExtensionErrorBoundaryProps = PropsWithChildren<{
  scope?: string;
}>;

export class ExtensionErrorBoundary extends Component<
  ExtensionErrorBoundaryProps,
  { error: ExtensionError | null }
> {
  constructor(props: ExtensionErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: unknown): { error: ExtensionError } {
    return { error: normalizeError(error) };
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    const normalizedError = normalizeError(error);
    const scope = this.props.scope?.trim();
    const context = scope ? `ReactErrorBoundary:${scope}` : 'ReactErrorBoundary';
    logError(normalizedError, context);
    errorLogger.error('React error info:', {
      scope: scope ?? 'unknown',
      componentStack: errorInfo.componentStack,
    });
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="w-full rounded-2xl border border-border-primary bg-bg-secondary/80 p-4 text-sm text-text-primary shadow-[0_18px_44px_rgba(2,8,18,0.24)] backdrop-blur-sm">
          <div className="inline-flex items-center gap-2 rounded-full border border-error/30 bg-error/12 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-error">
            <AlertTriangle className="h-3.5 w-3.5" />
            Extension error
          </div>
          <p className="mt-3 text-base font-semibold text-text-primary">Something went wrong</p>
          <p className="mt-1 leading-relaxed text-text-secondary">{this.state.error.userMessage}</p>
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="inline-flex items-center gap-2 rounded-lg border border-accent-primary/35 bg-accent-primary/12 px-3 py-1.5 font-medium text-text-primary transition-colors hover:bg-accent-primary/20"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
