// src/hooks/use-api-queries.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { getAni2arrApi } from '@/rpc';
import {
  getExtensionOptionsSnapshot,
  getPublicOptionsSnapshot,
  publicOptions,
  setExtensionOptionsSnapshot,
  sonarrSecrets,
} from '@/shared/utils/storage';
import type {
  AniMedia,
  CheckSeriesStatusPayload,
  CheckSeriesStatusResponse,
  ExtensionError,
  ExtensionOptions,
  PublicOptions,
  SonarrFormState,
  MediaMetadataHint,
  SonarrCredentialsPayload,
  SonarrSeries,
  TestConnectionPayload,
  MappingOverrideRecord,
  UiOptions,
} from '@/shared/types';
import type { AddInput, UpdateSonarrInput, StatusInput, SetMappingOverrideInput, ClearMappingOverrideInput } from '@/rpc/schemas';
import { normalizeError } from '@/shared/utils/error-handling';
import { logger } from '@/shared/utils/logger';

const rootQueryKey = ['a2a'] as const;

const normalizeTitleKey = (title?: string) => {
  const trimmed = title?.trim();
  return trimmed ? trimmed.toLowerCase() : '::';
};

const normalizeMetadataKey = (metadata?: MediaMetadataHint | null) => {
  if (!metadata) return '::';
  const titles = metadata.titles ?? {};
  const english = typeof titles?.english === 'string' ? titles.english.trim() : '';
  const romaji = typeof titles?.romaji === 'string' ? titles.romaji.trim() : '';
  const native = typeof titles?.native === 'string' ? titles.native.trim() : '';
  const synonyms = Array.isArray(metadata.synonyms) ? metadata.synonyms.slice(0, 5).join('|') : '';
  const startYear = metadata.startYear ?? '';
  const format = metadata.format ?? '';
  const prequels = Array.isArray(metadata.relationPrequelIds)
    ? metadata.relationPrequelIds.join(',')
    : '';
  return [english, romaji, native, synonyms, startYear, format, prequels].join('~');
};

const seriesStatusBaseKey = (anilistId: number) => [...rootQueryKey, 'seriesStatus', anilistId] as const;

const defaultUiOptions: UiOptions = {
  browseOverlayEnabled: true,
  badgeVisibility: 'always',
  headerInjectionEnabled: true,
  modalEnabled: true,
};

const mergeUiOptions = (ui?: UiOptions): UiOptions => ({
  ...defaultUiOptions,
  ...(ui ?? {}),
  badgeVisibility: ui?.badgeVisibility === 'hover' || ui?.badgeVisibility === 'hidden' ? ui.badgeVisibility : 'always',
});

export const queryKeys = {
  all: rootQueryKey,
  options: () => [...rootQueryKey, 'options'] as const,
  publicOptions: () => [...rootQueryKey, 'publicOptions'] as const,
  aniListMedia: (anilistId: number) => [...rootQueryKey, 'aniListMedia', anilistId] as const,
  seriesStatusRoot: () => [...rootQueryKey, 'seriesStatus'] as const,
  seriesStatusBase: seriesStatusBaseKey,
  seriesStatus: (payload: CheckSeriesStatusPayload) => [
    ...seriesStatusBaseKey(payload.anilistId),
    normalizeTitleKey(payload.title),
    normalizeMetadataKey(payload.metadata),
  ] as const,
  sonarrMetadata: (scope?: string) => [...rootQueryKey, 'sonarrMetadata', scope ?? 'configured'] as const,
  mappingSearch: (service: 'sonarr' | 'radarr', query: string) =>
    [...rootQueryKey, 'mappingSearch', service, query.trim().toLowerCase()] as const,
  mappingOverrides: () => [...rootQueryKey, 'mappingOverrides'] as const,
};

/**
 * Internal hooks to centralize storage -> query cache synchronization.
 * These keep responsibilities split (public vs combined options) while
 * avoiding duplicated effect bodies across callers.
 */
const useSyncExtensionOptionsQuery = (queryClient: QueryClient): void => {
  useEffect(() => {
    const refreshOptions = async () => {
      const snapshot = await getExtensionOptionsSnapshot();
      queryClient.setQueryData(queryKeys.options(), snapshot);
    };
    const unsubscribes = [
      publicOptions.watch(() => {
        void refreshOptions();
      }),
      sonarrSecrets.watch(() => {
        void refreshOptions();
      }),
    ];
    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  }, [queryClient]);
};

const useSyncPublicOptionsQuery = (queryClient: QueryClient): void => {
  useEffect(() => {
    const unsubscribe = publicOptions.watch(newValue => {
      queryClient.setQueryData(queryKeys.publicOptions(), {
        ...newValue,
        titleLanguage: newValue?.titleLanguage ?? 'english',
        ui: mergeUiOptions(newValue?.ui),
        debugLogging: newValue?.debugLogging ?? false,
      } satisfies PublicOptions);
      logger.configure({ enabled: (newValue?.debugLogging ?? false) || import.meta.env.DEV });
    });
    return () => unsubscribe();
  }, [queryClient]);
};

export type SeriesStatusOptions = {
  enabled?: boolean;
  force_verify?: boolean;
  network?: 'never';
  ignoreFailureCache?: boolean | (() => boolean);
  priority?: 'high' | 'normal' | (() => 'high' | 'normal' | undefined);
};

export const useSeriesStatus = (payload: CheckSeriesStatusPayload, options?: SeriesStatusOptions) => {
  const forceVerify = options?.force_verify === true;
  return useQuery<CheckSeriesStatusResponse, ExtensionError>({
    queryKey: queryKeys.seriesStatus(payload),
    queryFn: async () => {
      const request: StatusInput = { anilistId: payload.anilistId };
      if (payload.title !== undefined) {
        request.title = payload.title;
      }
      if (payload.metadata !== undefined) {
        request.metadata = payload.metadata;
      }
      if (options?.force_verify) {
        request.force_verify = true;
      }
      if (options?.network) {
        request.network = options.network;
      }
      const bypassFailureCache =
        typeof options?.ignoreFailureCache === 'function'
          ? options.ignoreFailureCache()
          : options?.ignoreFailureCache === true;
      if (bypassFailureCache) {
        request.ignoreFailureCache = true;
      }
      const prio = typeof options?.priority === 'function' ? options.priority() : options?.priority;
      if (prio) {
        request.priority = prio;
      }
      return getAni2arrApi().getSeriesStatus(request);
    },
    enabled: !!payload.anilistId && (options?.enabled ?? true),
    staleTime: forceVerify ? 0 : 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    meta: { persist: false },
  });
};

export const useAniListMedia = (
  anilistId: number | undefined,
  opts?: { enabled?: boolean; forceRefresh?: boolean },
) => {
  const forceRefresh = opts?.forceRefresh ?? false;

  const fetchAniListDirect = async (id: number): Promise<AniMedia | null> => {
    const FIND_MEDIA_QUERY = `
      query FindMedia($id: Int) {
        Media(id: $id) {
          id
          format
          title { romaji english native }
          startDate { year }
          synonyms
          description(asHtml: false)
          episodes
          duration
          nextAiringEpisode { episode airingAt }
          relations { edges { relationType node { id } } }
          bannerImage
          coverImage { extraLarge large medium color }
          status
          season
          seasonYear
          genres
          studios(isMain: true) { nodes { name } }
        }
      }
    `;

    const response = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: FIND_MEDIA_QUERY, variables: { id } }),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { data?: { Media?: AniMedia } };
    const media = payload?.data?.Media;
    if (!media) return null;
    // sanitize to plain data for React Query cache safety
    try {
      return JSON.parse(JSON.stringify(media)) as AniMedia;
    } catch {
      return media;
    }
  };

  return useQuery<AniMedia | null, ExtensionError>({
    queryKey: queryKeys.aniListMedia(anilistId ?? 0),
    queryFn: async () => {
      if (!anilistId) return null;
      try {
        const api = getAni2arrApi();
        const media = await api.fetchAniListMedia(anilistId);
        return media ?? null;
      } catch (error) {
        // Fallback to direct AniList fetch if messaging/proxy fails (e.g., DataCloneError)
        const msg = (error as Error | undefined)?.message ?? '';
        if (msg.includes('DataCloneError') || msg.includes('could not be cloned')) {
          const direct = await fetchAniListDirect(anilistId);
          if (direct) return direct;
        }
        const normalized = normalizeError(error);
        console.error('[useAniListMedia] Failed to fetch AniList media:', normalized);
        throw normalized;
      }
    },
    enabled: (opts?.enabled ?? true) && Boolean(anilistId),
    staleTime: forceRefresh ? 0 : 14 * 24 * 60 * 60 * 1000, // 14 days
    gcTime: 60 * 24 * 60 * 60 * 1000, // 60 days
    retry: 1,
    refetchOnWindowFocus: false,
    refetchOnMount: forceRefresh ? 'always' : true,
    meta: { persist: false },
  });
};

export const useExtensionOptions = () => {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.options(),
    queryFn: () => getExtensionOptionsSnapshot(),
    staleTime: Infinity,
    meta: { persist: false },
  });

  // Keep combined options in sync when either public slice or secrets change.
  useSyncExtensionOptionsQuery(queryClient);

  return query;
};

export const usePublicOptions = () => {
  const queryClient = useQueryClient();
  const query = useQuery<PublicOptions>({
    queryKey: queryKeys.publicOptions(),
    queryFn: () => getPublicOptionsSnapshot(),
    staleTime: Infinity,
    meta: { persist: false },
  });

  // Keep public options in sync for content/UI contexts.
  useSyncPublicOptionsQuery(queryClient);

  return query;
};

export const useSonarrMetadata = (options?: { enabled?: boolean; credentials?: SonarrCredentialsPayload | null }) => {
  const credentialScope = options?.credentials?.url && options.credentials.apiKey
    ? `${options.credentials.url}|${options.credentials.apiKey}`
    : 'configured';

  const request = options?.credentials ? { credentials: options.credentials } : undefined;

  return useQuery({
    queryKey: queryKeys.sonarrMetadata(credentialScope),
    queryFn: async () => {
      const api = getAni2arrApi();
      return api.getSonarrMetadata(request);
    },
    enabled: options?.enabled ?? true,
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
};

export const useAddSeries = () => {
  const queryClient = useQueryClient();
  return useMutation<SonarrSeries, ExtensionError, AddInput>({
    mutationFn: async (input: AddInput) => {
      try {
        return await getAni2arrApi().addToSonarr(input);
      } catch (error) {
        throw normalizeError(error);
      }
    },
    onSuccess: (_createdSeries, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.seriesStatusBase(variables.anilistId) });
    },
  });
};

export const useUpdateSeries = () => {
  const queryClient = useQueryClient();
  return useMutation<SonarrSeries, ExtensionError, UpdateSonarrInput>({
    mutationFn: async (input: UpdateSonarrInput) => {
      try {
        return await getAni2arrApi().updateSonarrSeries(input);
      } catch (error) {
        throw normalizeError(error);
      }
    },
    onSuccess: (_updatedSeries, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.seriesStatusBase(variables.anilistId) });
    },
  });
};

export const useSetMappingOverride = () => {
  const queryClient = useQueryClient();
  return useMutation<{ ok: true }, ExtensionError, SetMappingOverrideInput>({
    mutationFn: async (input: SetMappingOverrideInput) => {
      try {
        return await getAni2arrApi().setMappingOverride(input);
      } catch (error) {
        throw normalizeError(error);
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.seriesStatusBase(variables.anilistId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.mappingOverrides() });
    },
  });
};

export const useClearMappingOverride = () => {
  const queryClient = useQueryClient();
  return useMutation<{ ok: true }, ExtensionError, ClearMappingOverrideInput>({
    mutationFn: async (input: ClearMappingOverrideInput) => {
      try {
        return await getAni2arrApi().clearMappingOverride(input);
      } catch (error) {
        throw normalizeError(error);
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.seriesStatusBase(variables.anilistId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.mappingOverrides() });
    },
  });
};

export const useClearAllMappingOverrides = () => {
  const queryClient = useQueryClient();
  return useMutation<{ ok: true }, ExtensionError>({
    mutationFn: async () => {
      try {
        return await getAni2arrApi().clearAllMappingOverrides();
      } catch (error) {
        throw normalizeError(error);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mappingOverrides() });
      queryClient.invalidateQueries({ queryKey: queryKeys.seriesStatusRoot() });
    },
  });
};

export const useMappingOverrides = () =>
  useQuery<MappingOverrideRecord[], ExtensionError>({
    queryKey: queryKeys.mappingOverrides(),
    queryFn: async () => {
      const api = getAni2arrApi();
      return api.getMappingOverrides();
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

export const useTestConnection = () => {
  return useMutation<{ version: string }, ExtensionError, TestConnectionPayload>({
    mutationFn: async (payload: TestConnectionPayload) => {
      try {
        return await getAni2arrApi().testConnection(payload);
      } catch (error) {
        throw normalizeError(error);
      }
    },
  });
};

export const useSaveOptions = () => {
  const queryClient = useQueryClient();

  return useMutation<void, ExtensionError, ExtensionOptions, { previousOptions: ExtensionOptions | undefined }>({
    mutationFn: async (options: ExtensionOptions) => {
      try {
        await setExtensionOptionsSnapshot(options);
        await getAni2arrApi().notifySettingsChanged();
      } catch (error) {
        throw normalizeError(error);
      }
    },

    onMutate: async (newOptions) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: queryKeys.options() }),
        queryClient.cancelQueries({ queryKey: queryKeys.publicOptions() }),
      ]);
      const previousOptions = queryClient.getQueryData<ExtensionOptions>(queryKeys.options());
      queryClient.setQueryData(queryKeys.options(), newOptions);
      queryClient.setQueryData(queryKeys.publicOptions(), {
        sonarrUrl: newOptions.sonarrUrl,
        defaults: newOptions.defaults,
        titleLanguage: newOptions.titleLanguage,
        ui: mergeUiOptions(newOptions.ui),
        debugLogging: newOptions.debugLogging ?? false,
        isConfigured: Boolean(newOptions.sonarrUrl && newOptions.sonarrApiKey),
      } satisfies PublicOptions);
      return { previousOptions };
    },

    onError: (_err, _newOptions, context) => {
      if (context?.previousOptions) {
        queryClient.setQueryData(queryKeys.options(), context.previousOptions);
        queryClient.setQueryData(queryKeys.publicOptions(), {
          sonarrUrl: context.previousOptions.sonarrUrl,
          defaults: context.previousOptions.defaults,
          titleLanguage: context.previousOptions.titleLanguage,
          ui: mergeUiOptions(context.previousOptions.ui),
          debugLogging: context.previousOptions.debugLogging ?? false,
          isConfigured: Boolean(
            context.previousOptions.sonarrUrl && context.previousOptions.sonarrApiKey,
          ),
        } satisfies PublicOptions);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.options() });
      queryClient.invalidateQueries({ queryKey: queryKeys.publicOptions() });
    },
  });
};

export const useUpdateDefaultSettings = () => {
  const queryClient = useQueryClient();
  return useMutation<void, ExtensionError, SonarrFormState>({
    mutationFn: async (defaults: SonarrFormState) => {
      try {
        await getAni2arrApi().updateDefaults(defaults);
      } catch (error) {
        throw normalizeError(error);
      }
    },
    onSuccess: (_data, defaults) => {
      queryClient.setQueryData(queryKeys.publicOptions(), (prev?: PublicOptions) =>
        prev
          ? {
              ...prev,
              defaults,
            }
          : prev,
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.options() });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.publicOptions() });
    },
  });
};
