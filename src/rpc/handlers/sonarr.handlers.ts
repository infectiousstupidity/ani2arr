/** RPC handlers for Sonarr form options, search, and validation flows. */
// src/rpc/handlers/sonarr.handlers.ts

import * as v from "valibot";
import type { Ani2arrApi } from "@/rpc";
import {
	parseTvdbIdOrNull,
	type ProviderCredentials,
	type ProviderRootFolder,
	type SonarrLookupSeries,
	type SonarrSeriesSnapshot,
	type TvdbId,
} from "@/providers";
import type { SonarrLookupSeries as NewSonarrLookupSeries } from "@/providers/sonarr/types";
import {
	GetProviderFormOptionsInputSchema,
	SonarrLookupInputSchema,
	ValidateTvdbInputSchema,
} from "@/rpc/schemas";
import type { ApiHandlerDeps } from "./handler-deps";
import { normalizeInputCredentials } from "./provider.handlers";

export function createSonarrHandlers(
	deps: ApiHandlerDeps,
): Pick<
	Ani2arrApi,
	"getSonarrFormOptions" | "searchSonarr" | "validateTvdbId"
> {
	const {
		sonarrClient,
		sonarrLookupClient,
		sonarrLibrary,
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

	return {
		async getSonarrFormOptions(input) {
			const parsedInput = v.parse(GetProviderFormOptionsInputSchema, input);
			const maybeCredentials = parsedInput?.credentials;
			const credentials: ProviderCredentials =
				maybeCredentials?.url && maybeCredentials.apiKey
					? normalizeInputCredentials("sonarr", maybeCredentials)
					: await providerConfig.requireCredentials("sonarr");

			const [qualityProfiles, rootFolders, tags] = await Promise.all([
				sonarrClient.getQualityProfiles(credentials),
				sonarrClient.getRootFolders(credentials),
				sonarrClient.getTags(credentials),
			]);

			return {
				qualityProfiles,
				rootFolders: rootFolders.map((rootFolder) =>
					toProviderRootFolder(rootFolder),
				),
				tags,
			};
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
	} satisfies Pick<
		Ani2arrApi,
		"getSonarrFormOptions" | "searchSonarr" | "validateTvdbId"
	>;
}

function toProviderRootFolder(rootFolder: {
	id: number;
	path: string;
	freeSpace?: number | null | undefined;
}): ProviderRootFolder {
	return rootFolder.freeSpace === undefined
		? { id: rootFolder.id, path: rootFolder.path }
		: {
				id: rootFolder.id,
				path: rootFolder.path,
				freeSpace: rootFolder.freeSpace,
			};
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
		folder: series.folder,
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
