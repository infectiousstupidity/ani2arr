/** RPC handlers for Radarr form options, search, and validation flows. */
// src/rpc/handlers/radarr.handlers.ts

import * as v from "valibot";
import type { Ani2arrApi } from "@/rpc";
import {
	parseTmdbIdOrNull,
	type ProviderCredentials,
	type ProviderFormOptions,
	type TmdbId,
} from "@/providers";
import {
	GetProviderFormOptionsInputSchema,
	RadarrLookupInputSchema,
	ValidateTmdbInputSchema,
} from "@/rpc/schemas";
import type { ApiHandlerDeps } from "./handler-deps";
import { normalizeInputCredentials } from "./provider.handlers";

export function createRadarrHandlers(
	deps: ApiHandlerDeps,
): Pick<
	Ani2arrApi,
	"getRadarrFormOptions" | "searchRadarr" | "validateTmdbId"
> {
	const {
		radarrClient,
		radarrLibrary,
		manualMappingService,
		anibridgeMappingStore,
		manualMappingsReady,
		providerConfig,
	} = deps;

	const getLinkedRadarrAniListIds = (tmdbId: TmdbId): number[] => {
		const ids = new Set<number>(
			manualMappingService.getLinkedAniListIds("radarr", tmdbId),
		);
		for (const id of anibridgeMappingStore.getAniListIdsForTmdb(tmdbId)) {
			ids.add(id);
		}
		return [...ids];
	};

	return {
		async getRadarrFormOptions(input) {
			const parsedInput = v.parse(GetProviderFormOptionsInputSchema, input);
			const maybeCredentials = parsedInput?.credentials;
			const credentials: ProviderCredentials =
				maybeCredentials?.url && maybeCredentials.apiKey
					? normalizeInputCredentials("radarr", maybeCredentials)
					: await providerConfig.requireCredentials("radarr");

			const [qualityProfiles, rootFolders, tags] = await Promise.all([
				radarrClient.getQualityProfiles(credentials),
				radarrClient.getRootFolders(credentials),
				radarrClient.getTags(credentials),
			]);

			const formOptions: ProviderFormOptions = {
				qualityProfiles,
				rootFolders: rootFolders.map((folder) => ({
					id: folder.id,
					path: folder.path,
					...(folder.freeSpace === undefined
						? {}
						: { freeSpace: folder.freeSpace }),
				})),
				tags,
			};

			return formOptions;
		},

		async searchRadarr(input) {
			const parsedInput = v.parse(RadarrLookupInputSchema, input);
			const credentials = await providerConfig.requireCredentials("radarr");
			await manualMappingsReady;

			const [results, library] = await Promise.all([
				radarrClient.lookupMovies(parsedInput.term, credentials),
				radarrLibrary.getMovieSnapshots(credentials),
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

		async validateTmdbId(input) {
			const parsedInput = v.parse(ValidateTmdbInputSchema, input);
			const credentials = await providerConfig.requireCredentials("radarr");
			const found = await radarrClient.findMovieByTmdbId(
				parsedInput.tmdbId,
				credentials,
			);
			let inCatalog = false;
			try {
				const lookup = await radarrClient.lookupMovieByTmdbId(
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
		"getRadarrFormOptions" | "searchRadarr" | "validateTmdbId"
	>;
}
