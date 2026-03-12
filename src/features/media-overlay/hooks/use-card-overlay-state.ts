import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { browser } from 'wxt/browser';
import { useAddMovie, useAddSeries, useMovieStatus, useSeriesStatus } from '@/shared/queries';
import type {
  ExtensionError,
  MediaMetadataHint,
  MediaService,
  RadarrFormState,
  SonarrFormState,
} from '@/shared/types';
import { getProviderLabel } from '@/services/providers/resolver';

export type OverlayState = 'disabled' | 'in-library' | 'addable' | 'resolving' | 'adding' | 'error';

export interface UseCardOverlayStateParams {
  service: MediaService;
  anilistId: number;
  title: string;
  metadata: MediaMetadataHint | null;
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
  service,
  anilistId,
  title,
  metadata,
  defaultForm,
  isConfigured,
  enabled,
}: UseCardOverlayStateParams): UseCardOverlayStateResult => {
  const bypassFailureCacheRef = useRef(false);
  const providerLabel = getProviderLabel(service);

  const seriesStatusQuery = useSeriesStatus(
    { anilistId, title, metadata },
    {
      enabled:
        service === 'sonarr' &&
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
        service === 'radarr' &&
        (enabled ?? (isConfigured && Number.isFinite(anilistId))) &&
        isConfigured &&
        Number.isFinite(anilistId),
      ignoreFailureCache: () => bypassFailureCacheRef.current,
    },
  );

  const addSeriesMutation = useAddSeries();
  const addMovieMutation = useAddMovie();

  const statusData = service === 'radarr' ? movieStatusQuery.data : seriesStatusQuery.data;
  const statusHasError = service === 'radarr' ? movieStatusQuery.isError : seriesStatusQuery.isError;
  const statusError = service === 'radarr' ? movieStatusQuery.error : seriesStatusQuery.error;
  const statusIsLoading = service === 'radarr' ? movieStatusQuery.isLoading : seriesStatusQuery.isLoading;
  const fetchStatus = service === 'radarr' ? movieStatusQuery.fetchStatus : seriesStatusQuery.fetchStatus;
  const refetch = service === 'radarr' ? movieStatusQuery.refetch : seriesStatusQuery.refetch;
  const isAdding = service === 'radarr' ? addMovieMutation.isPending : addSeriesMutation.isPending;
  const addSuccess = service === 'radarr' ? addMovieMutation.isSuccess : addSeriesMutation.isSuccess;
  const addHasError = service === 'radarr' ? addMovieMutation.isError : addSeriesMutation.isError;
  const addError = service === 'radarr' ? addMovieMutation.error : addSeriesMutation.error;
  const reset = service === 'radarr' ? addMovieMutation.reset : addSeriesMutation.reset;

  useEffect(() => {
    reset();
  }, [anilistId, reset, title]);

  const hasPrevData = statusData !== undefined && statusData !== null;
  const isResolving = statusIsLoading || (fetchStatus === 'fetching' && !hasPrevData);
  const mappingUnavailable =
    service === 'radarr'
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
      ? `No ${providerLabel} match found. Click to retry mapping.`
      : resolveErrorMessage(addError) ?? resolveErrorMessage(statusError);

  const quickAddDisabled =
    overlayState === 'in-library' ||
    overlayState === 'resolving' ||
    overlayState === 'adding' ||
    overlayState === 'disabled' ||
    (overlayState === 'addable' && !defaultForm);

  const quickAddTitle = (() => {
    switch (overlayState) {
      case 'in-library':
        return `Already in ${providerLabel}`;
      case 'addable':
        return defaultForm ? `Quick add to ${providerLabel}` : 'Defaults unavailable';
      case 'resolving':
        return `Resolving ${providerLabel} mapping.`;
      case 'adding':
        return `Adding to ${providerLabel}.`;
      case 'error':
        return errorMessage ?? `Retry ${providerLabel} add`;
      case 'disabled':
        return `Configure ${providerLabel} before adding`;
      default:
        return providerLabel;
    }
  })();

  const quickAddAriaLabel =
    overlayState === 'error' && mappingUnavailable
      ? 'Retry mapping lookup'
      : overlayState === 'error'
        ? `Retry adding to ${providerLabel}`
        : quickAddTitle;

  const handleQuickAdd = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();

      if (!isConfigured) {
        void browser.runtime
          .sendMessage({
            _a2a: true,
            type: 'OPEN_OPTIONS_PAGE',
            sectionId: service,
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
          if (service === 'radarr') {
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

      if (service === 'radarr') {
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
      service,
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
