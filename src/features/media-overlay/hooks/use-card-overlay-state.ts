/** Card overlay state machine for AniList quick-add actions on browse surfaces. */
// src/features/media-overlay/hooks/use-card-overlay-state.ts

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { browser } from 'wxt/browser';
import type { ExtensionError } from '@/shared/errors';
import type { AniListMediaHint } from '@/shared/schemas/anilist/anilist-media.schema';
import type { Provider } from '@/providers';
import type { RadarrFormState } from '@/providers/settings/radarr-settings.schema';
import type { SonarrFormState } from '@/providers/settings/sonarr-settings.schema';
import { getProviderLabel } from '@/providers/provider-routing';
import { useAddMovie, useMovieStatus } from '@/providers/hooks/radarr.queries';
import { useAddSeries, useSeriesStatus } from '@/providers/hooks/sonarr.queries';

export type OverlayState = 'disabled' | 'in-library' | 'addable' | 'resolving' | 'adding' | 'error';

export interface UseCardOverlayStateParams {
  provider: Provider;
  anilistId: number;
  title: string;
  metadata: AniListMediaHint | null;
  defaultForm: SonarrFormState | RadarrFormState | null;
  isConfigured: boolean;
  enabled?: boolean;
}

export interface UseCardOverlayStateResult {
  overlayState: OverlayState;
  quickAddTitle: string;
  quickAddAriaLabel: string;
  quickAddDisabled: boolean;
  handleQuickAdd: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  statusData: ReturnType<typeof useSeriesStatus>['data'] | ReturnType<typeof useMovieStatus>['data'];
  mappingUnavailable: boolean;
}

const resolveErrorMessage = (error: unknown): string | null => {
  if (!error) return null;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null && 'userMessage' in (error as ExtensionError)) {
    const { userMessage } = error as ExtensionError;
    if (typeof userMessage === 'string' && userMessage.trim().length > 0) return userMessage;
  }
  if (error instanceof Error) return error.message;
  return null;
};

export const useCardOverlayState = ({
  provider,
  anilistId,
  title,
  metadata,
  defaultForm,
  isConfigured,
  enabled,
}: UseCardOverlayStateParams): UseCardOverlayStateResult => {
  const bypassFailureCacheRef = useRef(false);
  const providerLabel = getProviderLabel(provider);

  const seriesStatusQuery = useSeriesStatus(
    { anilistId, title, metadata },
    {
      enabled:
        provider === 'sonarr' &&
        (enabled ?? (isConfigured && Number.isFinite(anilistId))) &&
        isConfigured &&
        Number.isFinite(anilistId),
      ignoreFailureCache: () => bypassFailureCacheRef.current,
    },
  );

  const movieStatusQuery = useMovieStatus(
    { anilistId, title, metadata },
    {
      enabled:
        provider === 'radarr' &&
        (enabled ?? (isConfigured && Number.isFinite(anilistId))) &&
        isConfigured &&
        Number.isFinite(anilistId),
      ignoreFailureCache: () => bypassFailureCacheRef.current,
    },
  );

  const addSeriesMutation = useAddSeries();
  const addMovieMutation = useAddMovie();

  const statusData = provider === 'radarr' ? movieStatusQuery.data : seriesStatusQuery.data;
  const statusHasError = provider === 'radarr' ? movieStatusQuery.isError : seriesStatusQuery.isError;
  const statusError = provider === 'radarr' ? movieStatusQuery.error : seriesStatusQuery.error;
  const statusIsLoading = provider === 'radarr' ? movieStatusQuery.isLoading : seriesStatusQuery.isLoading;
  const fetchStatus = provider === 'radarr' ? movieStatusQuery.fetchStatus : seriesStatusQuery.fetchStatus;
  const refetch = provider === 'radarr' ? movieStatusQuery.refetch : seriesStatusQuery.refetch;
  const isAdding = provider === 'radarr' ? addMovieMutation.isPending : addSeriesMutation.isPending;
  const addSuccess = provider === 'radarr' ? addMovieMutation.isSuccess : addSeriesMutation.isSuccess;
  const addHasError = provider === 'radarr' ? addMovieMutation.isError : addSeriesMutation.isError;
  const addError = provider === 'radarr' ? addMovieMutation.error : addSeriesMutation.error;
  const reset = provider === 'radarr' ? addMovieMutation.reset : addSeriesMutation.reset;

  useEffect(() => {
    reset();
  }, [anilistId, reset, title]);

  const hasPrevData = statusData !== undefined && statusData !== null;
  const isResolving = statusIsLoading || (fetchStatus === 'fetching' && !hasPrevData);
  const mappingUnavailable =
    provider === 'radarr'
      ? movieStatusQuery.data?.anilistTmdbLinkMissing === true
      : seriesStatusQuery.data?.anilistTvdbLinkMissing === true;
  const hasError = addHasError || statusHasError || mappingUnavailable;
  const alreadyInLibrary = Boolean(statusData?.exists || addSuccess);

  const overlayState: OverlayState = useMemo(() => {
    if (!isConfigured) return 'disabled';
    if (alreadyInLibrary) return 'in-library';
    if (hasError) return 'error';
    if (isAdding) return 'adding';
    if (isResolving) return 'resolving';
    return 'addable';
  }, [alreadyInLibrary, hasError, isAdding, isConfigured, isResolving]);

  const errorMessage =
    mappingUnavailable
      ? `No automatic ${providerLabel} match was found. Click to search manually.`
      : resolveErrorMessage(addError) ?? resolveErrorMessage(statusError);

  const quickAddDisabled =
    overlayState === 'in-library' ||
    overlayState === 'resolving' ||
    overlayState === 'adding' ||
    (overlayState === 'addable' && !defaultForm);

  const quickAddTitle = (() => {
    switch (overlayState) {
      case 'in-library': {
        return `Already in ${providerLabel}`;
      }
      case 'addable': {
        return defaultForm ? `Quick add to ${providerLabel}` : 'Defaults unavailable';
      }
      case 'resolving': {
        return `Resolving ${providerLabel} mapping.`;
      }
      case 'adding': {
        return `Adding to ${providerLabel}.`;
      }
      case 'error': {
        return errorMessage ?? `Retry ${providerLabel} add`;
      }
      case 'disabled': {
        return `Configure ${providerLabel} before adding`;
      }
      default: {
        return providerLabel;
      }
    }
  })();

  let quickAddAriaLabel = quickAddTitle;
  if (overlayState === 'disabled') {
    quickAddAriaLabel = `Open ${providerLabel} settings`;
  } else if (overlayState === 'error' && mappingUnavailable) {
    quickAddAriaLabel = `Find ${providerLabel} match manually`;
  } else if (overlayState === 'error') {
    quickAddAriaLabel = `Retry adding to ${providerLabel}`;
  }

  const handleQuickAdd = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();

      if (!isConfigured) {
        void browser.runtime
          .sendMessage({
            _a2a: true,
            type: 'OPEN_OPTIONS_PAGE',
            sectionId: provider,
            timestamp: Date.now(),
          })
          .catch(() => {});
        return;
      }

      if (overlayState === 'in-library' || overlayState === 'resolving' || overlayState === 'adding') {
        return;
      }

      if (overlayState === 'error') {
        if (mappingUnavailable || statusHasError) {
          bypassFailureCacheRef.current = true;
          refetch({ throwOnError: false })
            .catch(() => {})
            .finally(() => {
              bypassFailureCacheRef.current = false;
            });
          return;
        }

        if (addHasError && defaultForm) {
          reset();
          if (provider === 'radarr') {
            addMovieMutation.mutate({
              anilistId,
              title,
              primaryTitleHint: title,
              metadata,
              form: { ...(defaultForm as RadarrFormState) },
            });
          } else {
            addSeriesMutation.mutate({
              anilistId,
              title,
              primaryTitleHint: title,
              metadata,
              form: { ...(defaultForm as SonarrFormState) },
            });
          }
          return;
        }
      }

      if (!defaultForm) {
        return;
      }

      if (provider === 'radarr') {
        addMovieMutation.mutate({
          anilistId,
          title,
          primaryTitleHint: title,
          metadata,
          form: { ...(defaultForm as RadarrFormState) },
        });
      } else {
        addSeriesMutation.mutate({
          anilistId,
          title,
          primaryTitleHint: title,
          metadata,
          form: { ...(defaultForm as SonarrFormState) },
        });
      }
    },
    [
      addHasError,
      addMovieMutation,
      addSeriesMutation,
      anilistId,
      defaultForm,
      isConfigured,
      mappingUnavailable,
      metadata,
      overlayState,
      refetch,
      reset,
      provider,
      statusHasError,
      title,
    ],
  );

  return {
    overlayState,
    quickAddTitle,
    quickAddAriaLabel,
    quickAddDisabled,
    handleQuickAdd,
    statusData,
    mappingUnavailable,
  };
};
