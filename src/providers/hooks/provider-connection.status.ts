/** Provider connection status type, display metadata, and smoothing hook. */
// src/providers/hooks/provider-connection.status.ts
import { useEffect, useRef, useState } from 'react';

export type ProviderConnectionStatus =
  | 'connected'
  | 'configured'
  | 'connecting'
  | 'not-configured';

export const PROVIDER_CONNECTION_STATUS_META: Record<
  ProviderConnectionStatus,
  {
    label: string;
    shortLabel: string;
    variantClassName?: string;
  }
> = {
  connected: {
    label: 'Connected',
    shortLabel: 'Connected',
    variantClassName: 'a2a-provider-status--connected',
  },
  configured: {
    label: 'Configured',
    shortLabel: 'Configured',
    variantClassName: 'a2a-provider-status--configured',
  },
  connecting: {
    label: 'Checking connection',
    shortLabel: 'Checking',
    variantClassName: 'a2a-provider-status--connecting',
  },
  'not-configured': {
    label: 'Not configured',
    shortLabel: 'Not set',
  },
};

export const getProviderConnectionStatusMeta = (
  status: ProviderConnectionStatus,
): {
  label: string;
  shortLabel: string;
  variantClassName?: string;
} => PROVIDER_CONNECTION_STATUS_META[status];

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
