/** Background-owned singleton services used by the Ani2arr RPC implementation. */
// src/background/api-services.ts

import {
	anilistMediaCache,
	AniListMediaService,
} from "@/anilist/media.service";
import { AniListMetadataStore } from "@/anilist/metadata.store";
import type { AniListId } from "@/anilist/types";
import {
	clearAutoResults,
	getSeerrAutoResult,
	setSeerrAutoResult,
} from "@/mapping/auto.store";
import { clearManualFacts } from "@/mapping/manual.store";
import { MappingService } from "@/mapping/mapping.service";
import type { SourceIdentity } from "@/mapping/source-identity";
import { createAutomaticResolver } from "@/mapping/resolve/resolve";
import { createSeerrAutoResolver } from "@/mapping/resolve/seerr-auto-resolver";
import { clearUpstreamMappings } from "@/mapping/upstream.store";
import { MyAnimeListMediaService } from "@/myanimelist/media.service";
import { metadataHintFromMyAnimeListMetadata } from "@/myanimelist/types";
import type { Provider } from "@/providers/types";
import { RadarrClient } from "@/providers/radarr/client";
import { RadarrLibrary } from "@/providers/radarr/library";
import { SeerrClient } from "@/providers/seerr/client";
import { getSeerrXsrfToken } from "@/providers/seerr/csrf-token";
import {
	getProviderHostPermissionPattern,
	hasProviderHostPermission,
	removeProviderHostPermission,
} from "@/providers/settings/host-permissions";
import { SonarrClient } from "@/providers/sonarr/client";
import { SonarrLibrary } from "@/providers/sonarr/library";
import {
	getExtensionOptionsSnapshot,
	resetAllSettingsSnapshot,
} from "@/settings/store";
import { removeSeerrCsrfCookiePermission } from "@/settings/provider-permissions";
import {
	getProviderCredentials,
	hasConfiguredProviderCredentials,
} from "@/settings/provider-config";
import type { ExtensionOptions } from "@/settings/types";
import { clearAllTtlCaches } from "@/shared/cache/ttl-cache";
import { logError, normalizeError } from "@/shared/errors/error-utils";
import {
	bumpMappingsRevision,
	bumpProviderLibraryRevision,
	resetAllRevisions,
} from "@/rpc/revision-signals";
import { fetchProviderCandidates } from "./provider-candidate-search";
import {
	requireProviderCredentials,
	requireSeerrConnection,
} from "./provider-config";

const DEBOUNCED_LIBRARY_REFRESH_MS = 15 * 1000;

function createDebouncer(ms: number) {
	let timeoutId: ReturnType<typeof setTimeout> | null = null;
	return (fn: () => Promise<unknown>) => {
		if (timeoutId !== null) clearTimeout(timeoutId);
		timeoutId = setTimeout(() => {
			timeoutId = null;
			fn().catch((error) =>
				logError(normalizeError(error), "Ani2arrApi:debounce"),
			);
		}, ms);
	};
}

const createHasUrlPermission =
	(scope: string) =>
	async (url: string): Promise<boolean> => {
		const result = await hasProviderHostPermission(url);
		if (!result.ok) {
			logError(
				normalizeError(result.error),
				`Ani2arrApi:${scope}:hasUrlPermission`,
			);
			return false;
		}
		return result.value;
	};

export const sonarrClient = new SonarrClient({
	hasUrlPermission: createHasUrlPermission("sonarr"),
});
export const radarrClient = new RadarrClient({
	hasUrlPermission: createHasUrlPermission("radarr"),
});
export const seerrClient = new SeerrClient({
	hasUrlPermission: createHasUrlPermission("seerr"),
	getCsrfToken: getSeerrXsrfToken,
});

export const sonarrLibrary = new SonarrLibrary(
	sonarrClient,
	undefined,
	async () => {
		await bumpProviderLibraryRevision("sonarr");
	},
);
export const radarrLibrary = new RadarrLibrary(
	radarrClient,
	undefined,
	async () => {
		await bumpProviderLibraryRevision("radarr");
	},
);

export const anilistMediaService = new AniListMediaService({
	media: anilistMediaCache,
});
export const anilistMetadataStore = new AniListMetadataStore();
export const myAnimeListMediaService = new MyAnimeListMediaService();

const searchProviderCandidates = (provider: Provider, title: string) =>
	fetchProviderCandidates(provider, title, {
		getCredentials: requireProviderCredentials,
		sonarr: sonarrClient,
		radarr: radarrClient,
	});

const resolveAutomaticMapping = createAutomaticResolver({
	anilistMedia: anilistMediaService,
	loadMyAnimeListMetadata: async (malId) =>
		metadataHintFromMyAnimeListMetadata(
			await myAnimeListMediaService.getMetadata(malId),
		),
	searchProviderCandidates,
});

// Batch bursts of new mappings. Broadcasting plain misses can make active queries
// retry and store the same miss again. The bump names the changed AniList IDs so
// tabs refetch only those cards; an unknown ID widens it to everything.
const debounceAutomaticMappingsRevision = createDebouncer(1000);
let automaticRevisionScope: Set<AniListId> | "all" | null = null;

function queueAutomaticMappingsRevision(
	identity: SourceIdentity,
	anilistId: AniListId | null | undefined,
): void {
	const changedId = identity.source === "anilist" ? identity.id : anilistId;
	if (changedId == null) automaticRevisionScope = "all";
	else if (automaticRevisionScope !== "all") {
		automaticRevisionScope ??= new Set();
		automaticRevisionScope.add(changedId);
	}
	debounceAutomaticMappingsRevision(async () => {
		const scope = automaticRevisionScope;
		automaticRevisionScope = null;
		await bumpMappingsRevision(
			scope === "all" || scope === null ? undefined : [...scope],
		);
	});
}

export const mappingService = new MappingService(
	async (input): Promise<boolean> => {
		if (!(await resolveAutomaticMapping(input))) return false;
		const mapping = await mappingService.getMapping(
			input.provider,
			input.identity,
			input.anilistId,
		);
		if (mapping.kind === "mapped") {
			queueAutomaticMappingsRevision(input.identity, input.anilistId);
		}
		return true;
	},
);

export const resolveSeerrAutomaticTarget = createSeerrAutoResolver({
	getEffectiveTarget: ({ identity, mediaType, anilistId }) =>
		mappingService.getSeerrMappingOutcome(identity, mediaType, anilistId),
	getAutoResult: getSeerrAutoResult,
	setAutoResult: async (...args) => {
		const [, identity, mediaType, result, anilistId] = args;
		const previous =
			result.kind === "unmapped"
				? await getSeerrAutoResult(identity, mediaType, anilistId)
				: null;
		const stored = await setSeerrAutoResult(...args);
		if (stored && (result.kind === "mapped" || previous?.kind === "mapped")) {
			queueAutomaticMappingsRevision(identity, anilistId);
		}
		return stored;
	},
	loadAniListMedia: (anilistId) =>
		anilistMediaService.fetchMediaWithRelations(anilistId),
	loadMyAnimeListMetadata: async (malId) =>
		metadataHintFromMyAnimeListMetadata(
			await myAnimeListMediaService.getMetadata(malId),
		),
	searchMedia: async (query) =>
		seerrClient.searchMedia(query, await requireSeerrConnection()),
	getTvDetails: async (tmdbId) =>
		seerrClient.getMediaDetails(
			{ mediaType: "tv", tmdbId },
			await requireSeerrConnection(),
		),
});

export const refreshProviderLibrary = async (
	provider: Provider,
	options: ExtensionOptions,
): Promise<void> => {
	const credentials = getProviderCredentials(options, provider);

	if (provider === "sonarr") {
		if (!credentials) {
			await sonarrLibrary.clearSeriesSnapshotCache();
			return;
		}
		await sonarrLibrary.refreshSeriesSnapshots(credentials);
		return;
	}

	if (!credentials) {
		await radarrLibrary.clearMovieSnapshotCache();
		return;
	}
	await radarrLibrary.refreshMovieSnapshots(credentials);
};

const sonarrDebouncer = createDebouncer(DEBOUNCED_LIBRARY_REFRESH_MS);
const radarrDebouncer = createDebouncer(DEBOUNCED_LIBRARY_REFRESH_MS);

export const scheduleLibraryRefresh = (provider: Provider): void => {
	const debouncer = provider === "sonarr" ? sonarrDebouncer : radarrDebouncer;
	debouncer(async () => {
		const options = await getExtensionOptionsSnapshot();
		if (!hasConfiguredProviderCredentials(options, provider)) return;
		await refreshProviderLibrary(provider, options);
	});
};

export const clearPersistentCaches = async (): Promise<void> => {
	seerrClient.clearMediaCache();
	await Promise.all([
		anilistMetadataStore.clearLocalCache(),
		clearUpstreamMappings(),
		sonarrLibrary.clearSeriesSnapshotCache(),
		radarrLibrary.clearMovieSnapshotCache(),
	]);
	await clearAllTtlCaches();
	await resetAllRevisions();
};

const removeConfiguredProviderHostPermissions = async (
	options: ExtensionOptions,
): Promise<void> => {
	const urls = [
		options.providers.sonarr.url,
		options.providers.radarr.url,
		options.seerr.url,
	].filter((url): url is string => !!url);

	const uniqueUrls = new Set(urls);

	await Promise.all(
		[...uniqueUrls].map(async (url) => {
			const pattern = getProviderHostPermissionPattern(url);
			if (!pattern.ok)
				return logError(
					normalizeError(pattern.error),
					`Ani2arrApi:removePermission`,
				);

			const removal = await removeProviderHostPermission(url);
			if (!removal.ok)
				return logError(
					normalizeError(removal.error),
					`Ani2arrApi:removePermission`,
				);

			if (!removal.value.removed) {
				logError(
					normalizeError(
						new Error(
							`Permission removal rejected for ${removal.value.pattern}.`,
						),
					),
					`Ani2arrApi:removePermission`,
				);
			}
		}),
	);
};

export const resetExtensionState = async (): Promise<void> => {
	const previousOptions = await getExtensionOptionsSnapshot();

	await clearManualFacts();
	await clearAutoResults();
	await clearPersistentCaches();
	await resetAllSettingsSnapshot();
	await removeConfiguredProviderHostPermissions(previousOptions);
	await removeSeerrCsrfCookiePermission();
};
