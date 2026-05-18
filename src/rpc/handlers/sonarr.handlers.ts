/** RPC handlers for Sonarr form resources, search, and validation flows. */
// src/rpc/handlers/sonarr.handlers.ts

import * as v from "valibot";
import type { Ani2arrApi } from "@/rpc";
import {
	parseTvdbIdOrNull,
	type ProviderCredentials,
	type ProviderRootFolder,
	type TvdbId,
} from "@/providers";
import type { SonarrSeriesSnapshot } from "@/providers/sonarr/types";
import {
	GetProviderFormResourcesInputSchema,
	SonarrLookupInputSchema,
	ValidateTvdbInputSchema,
} from "@/rpc/schemas";
import type { ApiHandlerDeps } from "./handler-deps";
import { normalizeInputCredentials } from "./provider.handlers";

export function createSonarrHandlers(
	deps: ApiHandlerDeps,
): Pick<
	Ani2arrApi,
	"getSonarrFormResources" | "searchSonarr" | "validateTvdbId"
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
		async getSonarrFormResources(input) {
			const parsedInput = v.parse(GetProviderFormResourcesInputSchema, input);
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
				sonarrLookupClient.lookupSeries(parsedInput.term, credentials),
				sonarrLibrary.getSeriesSnapshots(credentials),
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
			const found = await sonarrLookupClient.findSeriesByTvdbId(
				parsedInput.tvdbId,
				credentials,
			);
			let inCatalog = false;
			try {
				const lookup = await sonarrLookupClient.lookupSeriesByTvdbId(
					parsedInput.tvdbId,
					credentials,
				);
				inCatalog = lookup !== null;
			} catch {
				// ignore
			}
			return { isInLibrary: !!found, inCatalog };
		},
	} satisfies Pick<
		Ani2arrApi,
		"getSonarrFormResources" | "searchSonarr" | "validateTvdbId"
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
