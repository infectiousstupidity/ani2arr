/** Shared dependency contract used by focused RPC handler modules. */
// src/rpc/handlers/handler-deps.ts

import type { AniListMediaService, AniListMetadataStore } from '@/core/anilist';
import type { RadarrLibrary, SonarrLibrary } from '@/core/library';
import type { RadarrClient } from '@/integrations/providers/radarr.client';
import type { SonarrClient } from '@/integrations/providers/sonarr.client';
import type { getMappingsHandler } from '@/rpc/handlers/get-mappings.handlers';
import type { MappingService } from '@/services/mapping';
import type { MappingOverridesService } from '@/services/mapping/overrides';
import type { UpstreamMappingStore } from '@/services/mapping/upstream';
import type { ExtensionOptions } from '@/options';
import type { ProviderCredentials } from '@/integrations/providers';

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
  getMappings: typeof getMappingsHandler;
};
