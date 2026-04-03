/** Options-only provider connection status derivation with optional connecting-state smoothing. */
// src/features/options/use-provider-connection-status.ts
import { useEffect, useRef, useState } from 'react';
import type { ProviderConnectionStatus } from '@/features/options/provider-connection-status';

const getRawProviderConnectionStatus = (
  input: {
    hasConfiguredCredentials: boolean;
    isChecking: boolean;
    isConnected: boolean;
  },
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
  input: {
    hasConfiguredCredentials: boolean;
    isChecking: boolean;
    isConnected: boolean;
  },
): Exclude<ProviderConnectionStatus, 'connecting'> =>
  input.hasConfiguredCredentials ? 'configured' : 'not-configured';

export const useProviderConnectionStatus = (
  input: {
    hasConfiguredCredentials: boolean;
    isChecking: boolean;
    isConnected: boolean;
  },
  options?: {
    smoothConnecting?: boolean;
    delayMs?: number;
    minVisibleMs?: number;
  },
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

      const timer = globalThis.setTimeout(() => {
        connectingShownAtRef.current = Date.now();
        setDisplayedStatus('connecting');
      }, delayMs);

      return () => globalThis.clearTimeout(timer);
    }

    if (displayedStatus !== 'connecting') {
      setDisplayedStatus(rawStatus);
      connectingShownAtRef.current = null;
      return;
    }

    const shownAt = connectingShownAtRef.current;
    const elapsed = shownAt ? Date.now() - shownAt : minVisibleMs;
    const remaining = Math.max(0, minVisibleMs - elapsed);

    const timer = globalThis.setTimeout(() => {
      connectingShownAtRef.current = null;
      setDisplayedStatus(rawStatus);
    }, remaining);

    return () => globalThis.clearTimeout(timer);
  }, [delayMs, displayedStatus, minVisibleMs, rawStatus, smoothConnecting]);

  return displayedStatus;
};

export default useProviderConnectionStatus;
