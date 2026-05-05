/** Shared dependency contract used by focused RPC handler modules. */
// src/rpc/handlers/handler-deps.ts

import type { AniListMediaService, AniListMetadataStore } from "@/anilist";
import type { RadarrLibrary } from "@/providers/library/radarr-library";
import type { SonarrLibrary } from "@/providers/library/sonarr-library";
import type { RadarrClient } from "@/providers/clients/radarr.client";
import type { SonarrClient } from "@/providers/clients/sonarr.client";
import type { SonarrClient as CurrentSonarrClient } from "@/providers/sonarr/client";
import type { MappingService } from "@/mapping/mapping.service";
import type { ManualMappingService } from "@/mapping/manual-mapping";
import type { AutoMappingStore } from "@/mapping/auto-mapping/auto-mapping.store";
import type { AnibridgeMappingStore } from "@/mapping/upstream-mapping";
import type { ExtensionOptions } from "@/options";
import type { Provider } from "@/providers";
import type { ProviderConfigReader } from "@/background/api/provider-config-reader";

export type ApiHandlerDeps = {
	/** LEGACY: Used by Sonarr connection testing until it moves to the new Sonarr client. */
	SonarrClient: SonarrClient;
	sonarrClient: CurrentSonarrClient;
	sonarrLookupClient: Pick<
		CurrentSonarrClient,
		"lookupSeries" | "getSeriesByTvdbId"
	>;
	RadarrClient: RadarrClient;
	anilistMediaService: AniListMediaService;
	mappingService: MappingService;
	manualMappingService: ManualMappingService;
	autoMappingStore: AutoMappingStore;
	anibridgeMappingStore: AnibridgeMappingStore;
	sonarrLibrary: SonarrLibrary;
	radarrLibrary: RadarrLibrary;
	anilistMetadataStore: AniListMetadataStore;
	manualMappingsReady: Promise<void>;
	providerConfig: ProviderConfigReader;
	scheduleLibraryRefresh: (
		provider: Provider,
		optionsHint?: ExtensionOptions,
	) => void;
	bumpLibraryRevision: (provider: Provider) => Promise<void>;
	bumpMappingsRevision: () => Promise<void>;
	handleProviderConnectionChanged: (
		optionsHint?: ExtensionOptions,
		input?: {
			changedProviders?: Provider[];
			disconnectedProviders?: Provider[];
		},
	) => Promise<void>;
	clearPersistentCaches: () => Promise<void>;
	resetExtensionState: () => Promise<void>;
};
