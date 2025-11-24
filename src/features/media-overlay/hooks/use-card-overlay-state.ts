import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { browser } from 'wxt/browser';
import { useAddSeries, useSeriesStatus } from '@/shared/hooks/use-api-queries';
import type { ExtensionError, MediaMetadataHint, SonarrFormState } from '@/shared/types';
import { useToast } from '@/shared/components/toast-provider';

export type OverlayState = 'disabled' | 'in-sonarr' | 'addable' | 'resolving' | 'adding' | 'error';

export interface UseCardOverlayStateParams {
  anilistId: number;
  title: string;
  metadata: MediaMetadataHint | null;
  defaultForm: SonarrFormState | null;
  isConfigured: boolean;
  enabled?: boolean;
}

export interface UseCardOverlayStateResult {
  overlayState: OverlayState;
  quickAddTitle: string;
  quickAddAriaLabel: string;
  quickAddDisabled: boolean;
  handleQuickAdd: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  statusData: ReturnType<typeof useSeriesStatus>['data'];
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
  anilistId,
  title,
  metadata,
  defaultForm,
  isConfigured,
  enabled,
}: UseCardOverlayStateParams): UseCardOverlayStateResult => {
  const bypassFailureCacheRef = useRef(false);

  const statusQuery = useSeriesStatus(
    { anilistId, title, metadata },
    {
      enabled: (enabled ?? (isConfigured && Number.isFinite(anilistId))) && isConfigured && Number.isFinite(anilistId),
      ignoreFailureCache: () => bypassFailureCacheRef.current,
    },
  );

  const addSeriesMutation = useAddSeries();

  const toast = useToast();

  const {
    data: statusData,
    isError: statusHasError,
    error: statusError,
    isLoading: statusIsLoading,
    fetchStatus,
    refetch,
  } = statusQuery;

  const {
    mutate,
    isPending: isAdding,
    isSuccess: addSuccess,
    isError: addHasError,
    error: addError,
    reset,
  } = addSeriesMutation;

  useEffect(() => {
    reset();
  }, [anilistId, title, reset]);

  // Reduce flicker: if we already have previous data, keep showing it while a refetch runs
  const hasPrevData = statusData !== undefined && statusData !== null;
  const isResolving = statusIsLoading || (fetchStatus === 'fetching' && !hasPrevData);
  const mappingUnavailable = statusData?.anilistTvdbLinkMissing === true;
  const hasError = addHasError || statusHasError || mappingUnavailable;
  const alreadyInSonarr = !!statusData?.exists || addSuccess;

  const overlayState: OverlayState = useMemo(() => {
    if (!isConfigured) return 'disabled';
    if (alreadyInSonarr) return 'in-sonarr';
    if (hasError) return 'error';
    if (isAdding) return 'adding';
    if (isResolving) return 'resolving';
    return 'addable';
  }, [alreadyInSonarr, hasError, isAdding, isConfigured, isResolving]);

  const errorMessage =
    mappingUnavailable
      ? 'No Sonarr match found. Click to retry mapping.'
      : resolveErrorMessage(addError) ?? resolveErrorMessage(statusError);

  const quickAddDisabled =
    overlayState === 'in-sonarr' ||
    overlayState === 'resolving' ||
    overlayState === 'adding' ||
    overlayState === 'disabled' ||
    (overlayState === 'addable' && !defaultForm);

  const quickAddTitle = (() => {
    switch (overlayState) {
      case 'in-sonarr':
        return 'Already in Sonarr';
      case 'addable':
        return defaultForm ? 'Quick add to Sonarr' : 'Defaults unavailable';
      case 'resolving':
        return 'Resolving series mapping.';
      case 'adding':
        return 'Adding to Sonarr.';
      case 'error':
        return errorMessage ?? 'Retry Sonarr add';
      case 'disabled':
        return 'Configure Sonarr before adding';
      default:
        return 'Sonarr';
    }
  })();

  const quickAddAriaLabel =
    overlayState === 'error' && mappingUnavailable
      ? 'Retry mapping lookup'
      : overlayState === 'error'
        ? 'Retry adding to Sonarr'
        : quickAddTitle;

  const handleQuickAdd = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();

      if (!isConfigured) {
        toast.showToast({ title: 'Sonarr not configured', description: 'Please configure your Sonarr settings first.', variant: 'info' });
        browser.runtime.openOptionsPage().catch(() => {});
        return;
      }

      if (overlayState === 'in-sonarr' || overlayState === 'resolving' || overlayState === 'adding') {
        return;
      }

      if (overlayState === 'error') {
        if (mappingUnavailable) {
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
          mutate({
            anilistId,
            title,
            primaryTitleHint: title,
            metadata,
            form: { ...defaultForm },
          });
          return;
        }

        if (statusHasError) {
          bypassFailureCacheRef.current = true;
          refetch({ throwOnError: false })
            .catch(() => {})
            .finally(() => {
              bypassFailureCacheRef.current = false;
            });
          return;
        }
      }

      if (!defaultForm) {
        return;
      }

      mutate({
        anilistId,
        title,
        primaryTitleHint: title,
        metadata,
        form: { ...defaultForm },
      });
    },
    [
      addHasError,
      anilistId,
      defaultForm,
      mappingUnavailable,
      metadata,
      mutate,
      overlayState,
      refetch,
      reset,
      isConfigured,
      statusHasError,
      title,
      toast,
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
