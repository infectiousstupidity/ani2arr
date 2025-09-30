import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';

const { errorLogger, createMock } = vi.hoisted(() => {
  const errorLogger = {
    error: vi.fn(),
  };

  return {
    errorLogger,
    createMock: vi.fn(() => errorLogger),
  };
});

vi.mock('@/utils/logger', () => ({
  logger: {
    create: createMock,
    configure: vi.fn(),
    isLevelEnabled: vi.fn(),
  },
}));

import {
  createError,
  normalizeError,
  logError,
  ExtensionErrorBoundary,
  ErrorCode,
} from '@/utils/error-handling';
import type { ExtensionError } from '@/types';

describe('error-handling utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createError', () => {
    it('returns frozen error objects', () => {
      const error = createError(
        ErrorCode.API_ERROR,
        'API request failed',
        'Unable to complete the request.',
      );

      expect(Object.isFrozen(error)).toBe(true);
      expect(() => {
        (error as ExtensionError & { code?: string }).code = ErrorCode.UNKNOWN_ERROR;
      }).toThrow();
    });
  });

  describe('normalizeError', () => {
    it('returns the same instance for ExtensionError inputs', () => {
      const baseError = createError(
        ErrorCode.PERMISSION_ERROR,
        'Missing permission',
        'Permission required.',
      );

      const normalized = normalizeError(baseError);
      expect(normalized).toBe(baseError);
    });

    it('normalizes generic Error instances', () => {
      const genericError = new Error('Something blew up');

      const normalized = normalizeError(genericError);
      expect(normalized.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(normalized.message).toBe('Something blew up');
      expect(normalized.userMessage).toBe('An unexpected error occurred. Please try again.');
      expect(normalized.details?.originalStack).toBe(genericError.stack);
    });

    it('maps fetch TypeError instances to network errors', () => {
      const fetchError = new TypeError('Failed to fetch');

      const normalized = normalizeError(fetchError);
      expect(normalized.code).toBe(ErrorCode.NETWORK_ERROR);
      expect(normalized.message).toBe('Failed to fetch');
      expect(normalized.userMessage).toBe('Unable to connect. Check the URL, your network, and CORS settings.');
      expect(normalized.details?.originalStack).toBe(fetchError.stack);
    });

    it('wraps primitive values in a generic error', () => {
      const normalized = normalizeError('totally-broken');

      expect(normalized.code).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(normalized.message).toBe('An unknown value was thrown.');
      expect(normalized.userMessage).toBe('An unexpected error occurred.');
      expect(normalized.details?.originalValue).toBe('totally-broken');
    });
  });

  describe('logError', () => {
    it('prefixes context information when logging errors', () => {
      const error = createError(
        ErrorCode.API_ERROR,
        'Bad response',
        'Could not process request.',
      );

      logError(error, 'SonarrService');

      expect(errorLogger.error).toHaveBeenCalledWith(
        'SonarrService | [API_ERROR] - Bad response',
        expect.objectContaining({
          userMessage: 'Could not process request.',
          details: error.details,
        }),
      );
    });
  });

  describe('ExtensionErrorBoundary', () => {
    it('renders a fallback UI and recovers after reset', async () => {
      let shouldThrow = true;

      const FlakyComponent: React.FC = () => {
        if (shouldThrow) {
          throw new Error('Render failure');
        }
        return <div>Recovered content</div>;
      };

      render(
        <ExtensionErrorBoundary>
          <FlakyComponent />
        </ExtensionErrorBoundary>,
      );

      const fallbackHeading = await screen.findByText('Something went wrong');
      expect(fallbackHeading).toBeTruthy();
      expect(
        screen.getByText('An unexpected error occurred. Please try again.'),
      ).toBeTruthy();

      shouldThrow = false;
      fireEvent.click(screen.getByText('Try Again'));

      await waitFor(() => {
        expect(screen.getByText('Recovered content')).toBeTruthy();
      });
      expect(screen.queryByText('Something went wrong')).toBeNull();
    });
  });
});
