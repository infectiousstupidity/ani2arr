/** Public RPC handlers surface that assembles focused handler modules into the full API contract. */
// src/rpc/handlers/index.ts

import type { Ani2arrApi } from "@/rpc";
import type { GetProviderFormResourcesInput } from "@/rpc/types";
import { anilistHandlers } from "./anilist.handlers";
import { maintenanceHandlers } from "./maintenance.handlers";
import { mappingHandlers } from "./mapping.handlers";
import { myAnimeListHandlers } from "./myanimelist.handlers";
import { optionsHandlers } from "./options.handlers";
import { providerHandlers } from "./provider.handlers";
import { radarrHandlers } from "./radarr.handlers";
import { seerrHandlers } from "./seerr.handlers";
import { sonarrHandlers } from "./sonarr.handlers";

function afterInitialization(...initializations: Promise<unknown>[]) {
	return <Args extends unknown[], Result>(
			handler: (...args: Args) => Promise<Result>,
			shouldWait?: (...args: Args) => boolean,
		) =>
		async (...args: Args): Promise<Result> => {
			if (!shouldWait || shouldWait(...args)) {
				await Promise.all(initializations);
			}
			return handler(...args);
		};
}

const usesSavedCredentials = (input?: GetProviderFormResourcesInput) =>
	!input?.credentials?.url || !input.credentials.apiKey;

export function createApiHandlers(
	settingsInitialization: Promise<void>,
	mappingInitialization: Promise<unknown>,
): Ani2arrApi {
	const afterSettings = afterInitialization(settingsInitialization);
	const afterMappings = afterInitialization(mappingInitialization);
	const afterStorage = afterInitialization(
		settingsInitialization,
		mappingInitialization,
	);

	return {
		...anilistHandlers,
		...myAnimeListHandlers,
		testSonarrConnection: providerHandlers.testSonarrConnection,
		testRadarrConnection: providerHandlers.testRadarrConnection,
		checkSeerrSession: providerHandlers.checkSeerrSession,
		testSeerrApiKeyConnection: providerHandlers.testSeerrApiKeyConnection,

		updatePublicOptions: afterSettings(optionsHandlers.updatePublicOptions),
		saveProviderConnection: afterStorage(
			optionsHandlers.saveProviderConnection,
		),
		saveSeerrConnection: afterStorage(optionsHandlers.saveSeerrConnection),
		openProviderPage: afterSettings(providerHandlers.openProviderPage),
		openSeerrPage: afterSettings(providerHandlers.openSeerrPage),
		checkConfiguredSeerrConnection: afterSettings(
			providerHandlers.checkConfiguredSeerrConnection,
		),
		checkConfiguredSeerrCsrfSupport: afterSettings(
			providerHandlers.checkConfiguredSeerrCsrfSupport,
		),

		getSeriesStatus: afterStorage(sonarrHandlers.getSeriesStatus),
		addToSonarr: afterSettings(sonarrHandlers.addToSonarr),
		updateSonarrSeries: afterSettings(sonarrHandlers.updateSonarrSeries),
		getSonarrFormResources: afterSettings(
			sonarrHandlers.getSonarrFormResources,
			usesSavedCredentials,
		),
		searchSonarr: afterStorage(sonarrHandlers.searchSonarr),
		validateTvdbId: afterSettings(sonarrHandlers.validateTvdbId),

		getMovieStatus: afterStorage(radarrHandlers.getMovieStatus),
		addToRadarr: afterSettings(radarrHandlers.addToRadarr),
		updateRadarrMovie: afterSettings(radarrHandlers.updateRadarrMovie),
		getRadarrFormResources: afterSettings(
			radarrHandlers.getRadarrFormResources,
			usesSavedCredentials,
		),
		searchRadarr: afterStorage(radarrHandlers.searchRadarr),
		validateTmdbId: afterSettings(radarrHandlers.validateTmdbId),

		getSeerrTarget: afterMappings(
			afterSettings(
				seerrHandlers.getSeerrTarget,
				(input) => input.title != null || input.metadata != null,
			),
		),
		setManualSeerrTarget: afterMappings(seerrHandlers.setManualSeerrTarget),
		clearManualSeerrTarget: afterMappings(seerrHandlers.clearManualSeerrTarget),
		requestInSeerr: afterSettings(seerrHandlers.requestInSeerr),
		getSeerrMediaStatus: afterSettings(seerrHandlers.getSeerrMediaStatus),
		searchSeerrMedia: afterSettings(seerrHandlers.searchSeerrMedia),
		getSeerrMediaDetails: afterSettings(seerrHandlers.getSeerrMediaDetails),
		getSeerrPublicSettings: afterSettings(seerrHandlers.getSeerrPublicSettings),
		getSeerrLinkedAniListEntries: afterMappings(
			seerrHandlers.getSeerrLinkedAniListEntries,
		),

		getMappingIdentities: afterMappings(mappingHandlers.getMappingIdentities),
		setManualMapping: afterMappings(mappingHandlers.setManualMapping),
		clearManualMapping: afterMappings(mappingHandlers.clearManualMapping),
		setMappingIgnore: afterMappings(mappingHandlers.setMappingIgnore),
		clearMappingIgnore: afterMappings(mappingHandlers.clearMappingIgnore),
		setMappingRejectedCandidate: afterMappings(
			mappingHandlers.setMappingRejectedCandidate,
		),
		clearMappingRejectedCandidate: afterMappings(
			mappingHandlers.clearMappingRejectedCandidate,
		),
		getMappings: afterStorage(mappingHandlers.getMappings),
		getMappingInspection: afterMappings(mappingHandlers.getMappingInspection),
		resolveAniListIdsForSources: afterMappings(
			mappingHandlers.resolveAniListIdsForSources,
		),

		clearPersistentCaches: afterMappings(
			maintenanceHandlers.clearPersistentCaches,
		),
		resetExtensionState: afterStorage(maintenanceHandlers.resetExtensionState),
	};
}
