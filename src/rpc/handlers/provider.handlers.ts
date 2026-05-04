/** RPC handlers for provider metadata, search, and validation flows. */
// src/rpc/handlers/provider.handlers.ts

import * as v from "valibot";
import type { Ani2arrApi } from "@/rpc";
import {
	parseTmdbIdOrNull,
	parseTvdbIdOrNull,
	type ProviderCredentials,
	type SonarrLookupSeries,
	type SonarrSeriesSnapshot,
	type TmdbId,
	type TvdbId,
} from "@/providers";
import type { SonarrLookupSeries as NewSonarrLookupSeries } from "@/providers/sonarr/types";
import { normalizeProviderConnectionInput } from "@/options";
import {
	GetProviderMetadataInputSchema,
	RadarrLookupInputSchema,
	SonarrLookupInputSchema,
	TestProviderConnectionInputSchema,
	ValidateTmdbInputSchema,
	ValidateTvdbInputSchema,
} from "@/rpc/schemas";
import type { ApiHandlerDeps } from "./handler-deps";

const normalizeInputCredentials = (
	provider: "sonarr" | "radarr",
	credentials: ProviderCredentials,
): ProviderCredentials => {
	const normalized = normalizeProviderConnectionInput(credentials, provider);
	if (!normalized) {
		throw new Error("Provider credentials are required.");
	}

	return {
		url: normalized.url,
		apiKey: normalized.apiKey,
	};
};

export function createProviderHandlers(
	deps: ApiHandlerDeps,
): Pick<
	Ani2arrApi,
	| "testProviderConnection"
	| "getSonarrMetadata"
	| "getRadarrMetadata"
	| "searchSonarr"
	| "searchRadarr"
	| "validateTvdbId"
	| "validateTmdbId"
> {
	const {
		SonarrClient,
		sonarrLookupClient,
		RadarrClient,
		sonarrLibrary,
		radarrLibrary,
		manualMappingService,
		anibridgeMappingStore,
		manualMappingsReady,
		providerConfig,
	} = deps;

	const getLinkedSonarrAniListIds = (tvdbId: TvdbId): number[] => {
		const ids = new Set<number>(
			manualMappingService.getLinkedAniListIds("sonarr", tvdbId),
		);
		for (const id of anibridgeMappingStore.getAniListIdsForTvdb(tvdbId)) {
			ids.add(id);
		}
		return [...ids];
	};

	const getLinkedRadarrAniListIds = (tmdbId: TmdbId): number[] => {
		const ids = new Set<number>(
			manualMappingService.getLinkedAniListIds("radarr", tmdbId),
		);
		for (const id of anibridgeMappingStore.getAniListIdsForTmdb(tmdbId)) {
			ids.add(id);
		}
		return [...ids];
	};

	const testProviderConnectionInternal: Ani2arrApi["testProviderConnection"] =
		async (input) => {
			return input.provider === "sonarr"
				? SonarrClient.testConnection(input.credentials)
				: RadarrClient.testConnection(input.credentials);
		};

	const handlers = {
		testProviderConnection(input) {
			const parsedInput = v.parse(TestProviderConnectionInputSchema, input);
			return testProviderConnectionInternal({
				provider: parsedInput.provider,
				credentials: normalizeInputCredentials(
					parsedInput.provider,
					parsedInput.credentials,
				),
			});
		},

		async getSonarrMetadata(input) {
			const parsedInput = v.parse(GetProviderMetadataInputSchema, input);
			const maybeCredentials = parsedInput?.credentials;
			const credentials: ProviderCredentials =
				maybeCredentials?.url && maybeCredentials.apiKey
					? normalizeInputCredentials("sonarr", maybeCredentials)
					: await providerConfig.requireCredentials("sonarr");

			const [qualityProfiles, rootFolders, tags] = await Promise.all([
				SonarrClient.getQualityProfiles(credentials),
				SonarrClient.getRootFolders(credentials),
				SonarrClient.getTags(credentials),
			]);

			return { qualityProfiles, rootFolders, tags };
		},

		async getRadarrMetadata(input) {
			const parsedInput = v.parse(GetProviderMetadataInputSchema, input);
			const maybeCredentials = parsedInput?.credentials;
			const credentials: ProviderCredentials =
				maybeCredentials?.url && maybeCredentials.apiKey
					? normalizeInputCredentials("radarr", maybeCredentials)
					: await providerConfig.requireCredentials("radarr");

			const [qualityProfiles, rootFolders, tags] = await Promise.all([
				RadarrClient.getQualityProfiles(credentials),
				RadarrClient.getRootFolders(credentials),
				RadarrClient.getTags(credentials),
			]);

			return { qualityProfiles, rootFolders, tags };
		},

		async searchSonarr(input) {
			const parsedInput = v.parse(SonarrLookupInputSchema, input);
			const credentials = await providerConfig.requireCredentials("sonarr");
			await manualMappingsReady;

			const [results, library] = await Promise.all([
				sonarrLookupClient
					.lookupSeries(parsedInput.term, credentials)
					.then((hits) =>
						hits.map((hit) => toLegacySonarrLookupSeries(hit)),
					),
				sonarrLibrary.getLeanSeriesList(),
			]);

			const libraryTvdbIds = library.map((s) => s.tvdbId);
			const statsMap: Record<
				number,
				NonNullable<SonarrSeriesSnapshot["statistics"]>
			> = {};
			for (const s of library) {
				if (s.statistics) {
					statsMap[s.tvdbId] = s.statistics;
				}
			}

			const linkedAniListIdsByTvdbId: Record<number, number[]> = {};
			const uniqueTvdbIds = new Set<TvdbId>();
			for (const series of results) {
				const tvdbId = parseTvdbIdOrNull(series?.tvdbId);
				if (tvdbId !== null) {
					uniqueTvdbIds.add(tvdbId);
				}
			}
			for (const tvdbId of uniqueTvdbIds) {
				const linked = getLinkedSonarrAniListIds(tvdbId);
				if (linked.length > 0) {
					linkedAniListIdsByTvdbId[tvdbId] = linked;
				}
			}

			return {
				results,
				libraryTvdbIds,
				...(Object.keys(statsMap).length > 0 ? { statsMap } : {}),
				...(Object.keys(linkedAniListIdsByTvdbId).length > 0
					? { linkedAniListIdsByTvdbId }
					: {}),
			};
		},

		async searchRadarr(input) {
			const parsedInput = v.parse(RadarrLookupInputSchema, input);
			const credentials = await providerConfig.requireCredentials("radarr");
			await manualMappingsReady;

			const [results, library] = await Promise.all([
				RadarrClient.lookupMovieByTerm(parsedInput.term, credentials),
				radarrLibrary.getLeanMovieList(),
			]);

			const libraryTmdbIds = library.map((movie) => movie.tmdbId);
			const linkedAniListIdsByTmdbId: Record<number, number[]> = {};
			const uniqueTmdbIds = new Set<TmdbId>();

			for (const movie of results) {
				const tmdbId = parseTmdbIdOrNull(movie?.tmdbId);
				if (tmdbId !== null) {
					uniqueTmdbIds.add(tmdbId);
				}
			}

			for (const tmdbId of uniqueTmdbIds) {
				const linked = getLinkedRadarrAniListIds(tmdbId);
				if (linked.length > 0) {
					linkedAniListIdsByTmdbId[tmdbId] = linked;
				}
			}

			return {
				results,
				libraryTmdbIds,
				...(Object.keys(linkedAniListIdsByTmdbId).length > 0
					? { linkedAniListIdsByTmdbId }
					: {}),
			};
		},

		async validateTvdbId(input) {
			const parsedInput = v.parse(ValidateTvdbInputSchema, input);
			const credentials = await providerConfig.requireCredentials("sonarr");
			const found = await sonarrLookupClient.getSeriesByTvdbId(
				parsedInput.tvdbId,
				credentials,
			);
			let inCatalog = false;
			try {
				const hits = await sonarrLookupClient.lookupSeries(
					`tvdb:${parsedInput.tvdbId}`,
					credentials,
				);
				inCatalog = hits.some((h) => h?.tvdbId === parsedInput.tvdbId);
			} catch {
				// ignore
			}
			return { isInLibrary: !!found, inCatalog };
		},

		async validateTmdbId(input) {
			const parsedInput = v.parse(ValidateTmdbInputSchema, input);
			const credentials = await providerConfig.requireCredentials("radarr");
			const found = await RadarrClient.getMovieByTmdbId(
				parsedInput.tmdbId,
				credentials,
			);
			let inCatalog = false;
			try {
				const lookup = await RadarrClient.lookupMovieByTmdbId(
					parsedInput.tmdbId,
					credentials,
				);
				inCatalog = lookup?.tmdbId === parsedInput.tmdbId;
			} catch {
				// ignore
			}
			return { isInLibrary: !!found, inCatalog };
		},
	} satisfies Pick<
		Ani2arrApi,
		| "testProviderConnection"
		| "getSonarrMetadata"
		| "getRadarrMetadata"
		| "searchSonarr"
		| "searchRadarr"
		| "validateTvdbId"
		| "validateTmdbId"
	>;

	return handlers;
}

function toLegacySonarrLookupSeries(
	series: NewSonarrLookupSeries,
): SonarrLookupSeries {
	const images = series.images?.map((image) => ({
		...(image.coverType === undefined ? {} : { coverType: image.coverType }),
		...(image.url === undefined ? {} : { url: image.url }),
		...(image.remoteUrl === undefined ? {} : { remoteUrl: image.remoteUrl }),
	}));
	const statistics = series.statistics
		? {
				...(series.statistics.seasonCount === undefined
					? {}
					: { seasonCount: series.statistics.seasonCount }),
				...(series.statistics.episodeCount === undefined
					? {}
					: { episodeCount: series.statistics.episodeCount }),
				...(series.statistics.episodeFileCount === undefined
					? {}
					: { episodeFileCount: series.statistics.episodeFileCount }),
				...(series.statistics.totalEpisodeCount === undefined
					? {}
					: { totalEpisodeCount: series.statistics.totalEpisodeCount }),
			}
		: undefined;

	return {
		...(series.id === undefined ? {} : { id: series.id }),
		title: series.title,
		tvdbId: series.tvdbId,
		...(series.titleSlug === undefined ? {} : { titleSlug: series.titleSlug }),
		...(series.year === undefined ? {} : { year: series.year }),
		...(series.genres === undefined ? {} : { genres: series.genres }),
		...(series.network === undefined ? {} : { network: series.network }),
		...(series.seriesType === undefined
			? {}
			: { seriesType: series.seriesType }),
		...(series.status === undefined ? {} : { status: series.status }),
		...(images === undefined ? {} : { images }),
		...(series.remotePoster === undefined
			? {}
			: { remotePoster: series.remotePoster }),
		...(statistics === undefined ? {} : { statistics }),
	};
}
