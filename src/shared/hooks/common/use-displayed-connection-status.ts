import { useEffect, useRef, useState } from 'react';
import type { ProviderConnectionStatus } from '@/shared/providers/connection-status';

type UseDisplayedConnectionStatusOptions = {
  delayMs?: number;
  minVisibleMs?: number;
  fallbackStatus: ProviderConnectionStatus;
};

export const useDisplayedConnectionStatus = (
  rawStatus: ProviderConnectionStatus,
  options: UseDisplayedConnectionStatusOptions,
): ProviderConnectionStatus => {
  const delayMs = options.delayMs ?? 350;
  const minVisibleMs = options.minVisibleMs ?? 700;
  const [displayedStatus, setDisplayedStatus] = useState<ProviderConnectionStatus>(
    rawStatus === 'connecting' ? options.fallbackStatus : rawStatus,
  );
  const connectingShownAtRef = useRef<number | null>(null);

  useEffect(() => {
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
  }, [delayMs, displayedStatus, minVisibleMs, rawStatus]);

  return displayedStatus;
};
