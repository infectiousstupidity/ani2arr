/** Options-owned provider connection status metadata for popup and settings UIs. */
// src/features/options/provider-connection-status.ts

export type ProviderConnectionStatus =
  | 'connected'
  | 'configured'
  | 'connecting'
  | 'not-configured';

export interface ProviderConnectionStatusMeta {
  label: string;
  shortLabel: string;
  variantClassName?: string;
}

export const PROVIDER_CONNECTION_STATUS_META: Record<
  ProviderConnectionStatus,
  ProviderConnectionStatusMeta
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
): ProviderConnectionStatusMeta => PROVIDER_CONNECTION_STATUS_META[status];
