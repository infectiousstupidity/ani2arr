/** Options-local provider connection query and mutation hooks for provider settings. */
// src/features/options/use-provider-connection-check.ts
import { useMutation, useQuery } from '@tanstack/react-query';
import { getAni2arrApi } from '@/rpc';
import type { TestProviderConnectionInput } from '@/rpc/schemas';
import { normalizeError, type ExtensionError } from '@/shared/errors';
import { queryKeys } from '@/shared/queries/query-keys';
import type { Provider, ProviderCredentials } from '@/providers';

export const getProviderCredentialScope = (
  credentials?: ProviderCredentials | null,
): string =>
  credentials?.url && credentials.apiKey
    ? `${credentials.url}|${credentials.apiKey}`
    : 'configured';

export const useProviderConnectionCheck = (
  options: {
    provider: Provider;
    credentials?: ProviderCredentials | null;
    enabled?: boolean;
  },
) =>
  useQuery<{ version: string }, ExtensionError>({
    queryKey:
      options.provider === 'sonarr'
        ? queryKeys.sonarrConnection(getProviderCredentialScope(options.credentials))
        : queryKeys.radarrConnection(getProviderCredentialScope(options.credentials)),
    queryFn: async () => {
      if (!options.credentials) {
        throw new Error(
          `${options.provider === 'sonarr' ? 'Sonarr' : 'Radarr'} credentials are required to verify the connection.`,
        );
      }

      return getAni2arrApi().testProviderConnection({
        provider: options.provider,
        credentials: options.credentials,
      });
    },
    enabled:
      (options.enabled ?? true) &&
      Boolean(options.credentials?.url && options.credentials.apiKey),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: 'always',
    retry: 0,
  });

export const useTestProviderConnection = () =>
  useMutation<{ version: string }, ExtensionError, TestProviderConnectionInput>({
    mutationFn: async (input: TestProviderConnectionInput) => {
      try {
        return await getAni2arrApi().testProviderConnection(input);
      } catch (error) {
        throw normalizeError(error);
      }
    },
  });

export default useProviderConnectionCheck;
