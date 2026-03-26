/**
 * @file Options-only provider connection status derivation.
 * Derives the UI-facing provider connection status from persisted configuration
 * and live connection-check state, with optional smoothing for the transient
 * "connecting" state to reduce badge flicker.
 */

// src/features/options/use-provider-connection-status.ts
import { useEffect, useRef, useState } from 'react';

export type ProviderConnectionStatus =
  | 'connected'
  | 'configured'
  | 'connecting'
  | 'not-configured';

export interface UseProviderConnectionStatusInput {
  hasConfiguredCredentials: boolean;
  isChecking: boolean;
  isConnected: boolean;
}

export interface UseProviderConnectionStatusOptions {
  smoothConnecting?: boolean;
  delayMs?: number;
  minVisibleMs?: number;
}

const getRawProviderConnectionStatus = (
  input: UseProviderConnectionStatusInput,
): ProviderConnectionStatus => {
  if (input.isChecking) {
    return 'connecting';
  }

  if (input.isConnected) {
    return 'connected';
  }

  if (input.hasConfiguredCredentials) {
    return 'configured';
  }

  return 'not-configured';
};

const getFallbackStatus = (
  input: UseProviderConnectionStatusInput,
): Exclude<ProviderConnectionStatus, 'connecting'> =>
  input.hasConfiguredCredentials ? 'configured' : 'not-configured';

export const useProviderConnectionStatus = (
  input: UseProviderConnectionStatusInput,
  options?: UseProviderConnectionStatusOptions,
): ProviderConnectionStatus => {
  const rawStatus = getRawProviderConnectionStatus(input);
  const smoothConnecting = options?.smoothConnecting ?? false;
  const delayMs = options?.delayMs ?? 350;
  const minVisibleMs = options?.minVisibleMs ?? 700;
  const fallbackStatus = getFallbackStatus(input);

  const [displayedStatus, setDisplayedStatus] = useState<ProviderConnectionStatus>(
    rawStatus === 'connecting' && smoothConnecting ? fallbackStatus : rawStatus,
  );

  const connectingShownAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!smoothConnecting) {
      setDisplayedStatus(rawStatus);
      connectingShownAtRef.current = null;
      return;
    }

    if (rawStatus === 'connecting') {
      if (displayedStatus === 'connecting') {
        return;
      }

      const timer = window.setTimeout(() => {
        connectingShownAtRef.current = Date.now();
        setDisplayedStatus('connecting');
      }, delayMs);

      return () => window.clearTimeout(timer);
    }

    if (displayedStatus !== 'connecting') {
      setDisplayedStatus(rawStatus);
      connectingShownAtRef.current = null;
      return;
    }

    const shownAt = connectingShownAtRef.current;
    const elapsed = shownAt ? Date.now() - shownAt : minVisibleMs;
    const remaining = Math.max(0, minVisibleMs - elapsed);

    const timer = window.setTimeout(() => {
      connectingShownAtRef.current = null;
      setDisplayedStatus(rawStatus);
    }, remaining);

    return () => window.clearTimeout(timer);
  }, [delayMs, displayedStatus, minVisibleMs, rawStatus, smoothConnecting]);

  return displayedStatus;
};

export default useProviderConnectionStatus;
