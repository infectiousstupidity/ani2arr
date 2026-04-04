/** Shared dependency contract used by focused RPC handler modules. */
// src/rpc/handlers/handler-deps.ts

import type { AniListMediaService, AniListMetadataStore } from '@/anilist';
import type { RadarrLibrary } from '@/providers/library/radarr-library';
import type { SonarrLibrary } from '@/providers/library/sonarr-library';
import type { RadarrClient } from '@/providers/clients/radarr.client';
import type { SonarrClient } from '@/providers/clients/sonarr.client';
import type { MappingService } from '@/mapping/mapping.service';
import type { MappingOverridesService } from '@/mapping/overrides';
import type { UpstreamMappingStore } from '@/mapping/upstream';
import type { ExtensionOptions } from '@/options';
import type { ProviderCredentials } from '@/providers';

export type ApiHandlerDeps = {
  SonarrClient: SonarrClient;
  RadarrClient: RadarrClient;
  anilistMediaService: AniListMediaService;
  mappingService: MappingService;
  overridesService: MappingOverridesService;
  upstreamMappingStore: UpstreamMappingStore;
  sonarrLibrary: SonarrLibrary;
  radarrLibrary: RadarrLibrary;
  anilistMetadataStore: AniListMetadataStore;
  overridesReady: Promise<void>;
  ensureSonarrConfigured: () => Promise<{ credentials: ProviderCredentials; options: ExtensionOptions }>;
  ensureRadarrConfigured: () => Promise<{ credentials: ProviderCredentials; options: ExtensionOptions }>;
  scheduleLibraryRefresh: (provider: 'sonarr' | 'radarr', optionsHint?: ExtensionOptions) => void;
  bumpLibraryRevision: (provider: 'sonarr' | 'radarr') => Promise<void>;
  bumpMappingsRevision: () => Promise<void>;
  handleOptionsUpdated: (optionsHint?: ExtensionOptions) => Promise<void>;
  clearPersistentCaches: () => Promise<void>;
  resetExtensionState: () => Promise<void>;
};
