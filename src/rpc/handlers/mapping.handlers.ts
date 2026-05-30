/** RPC handlers for manual mapping decisions and mapping listings. */
// src/rpc/handlers/mapping.handlers.ts

import * as v from "valibot";
import {
	anibridgeMappingStore,
	anilistMetadataStore,
	autoMappingStore,
	bumpLibraryRevision,
	bumpMappingsRevision,
	getMappingListRevision,
	manualMappingService,
	manualMappingsReady,
	mappingService,
	radarrLibrary,
	scheduleLibraryRefresh,
	sonarrLibrary,
} from "@/background/api-services";
import { getProviderConfig } from "@/background/provider-config";
import {
	getMappingInspection,
	type GetMappingInspectionDeps,
} from "@/mapping/queries/mapping-details";
import { getMappingIdentities } from "@/mapping/queries/mapping-identities";
import { createError, ErrorCode } from "@/shared/errors";
import {
	listMappings,
	type ListMappingsDeps,
	type MappingListProjectionCache,
} from "@/mapping/queries/list-mappings";
import {
	ClearMappingIgnoreInputSchema,
	ClearManualMappingInputSchema,
	ClearMappingRejectedCandidateInputSchema,
	GetMappingInspectionInputSchema,
	GetMappingIdentitiesInputSchema,
	GetMappingsInputSchema,
	SetMappingIgnoreInputSchema,
	SetManualMappingInputSchema,
	SetMappingRejectedCandidateInputSchema,
} from "@/rpc/schemas";

const getProjectionRevisionKey = (): string => {
	const revision = getMappingListRevision();
	return [
		`mappings:${revision.mappings}`,
		`anibridge:${revision.anibridge}`,
		`sonarr:${revision.sonarrLibrary}`,
		`radarr:${revision.radarrLibrary}`,
	].join("|");
};

const mappingListProjectionCache: MappingListProjectionCache = new Map();
let activeProjectionRevisionKey = "";

const resetProjectionCacheWhenStale = (): string => {
	const revisionKey = getProjectionRevisionKey();
	if (revisionKey !== activeProjectionRevisionKey) {
		mappingListProjectionCache.clear();
		activeProjectionRevisionKey = revisionKey;
	}
	return revisionKey;
};

export const mappingHandlers = {
	async getMappingIdentities(ids: unknown) {
		const parsedIds = v.parse(GetMappingIdentitiesInputSchema, ids);
		await manualMappingsReady;
		await mappingService.initAnibridgeMappings();
		return getMappingIdentities(parsedIds, {
			manualMappingService,
			autoMappingStore,
			anibridgeMappingStore,
		});
	},

	initMappings() {
		return mappingService.initAnibridgeMappings();
	},

	async setManualMapping(input: unknown) {
		const parsedInput = v.parse(SetManualMappingInputSchema, input);
		await manualMappingsReady;

		const linkedIds = new Set<number>(
			manualMappingService.getLinkedAniListIds(
				parsedInput.provider,
				parsedInput.providerId,
			),
		);

		const anibridgeLinkedIds =
			parsedInput.provider === "sonarr"
				? anibridgeMappingStore.getAniListIdsForTvdb(parsedInput.providerId)
				: anibridgeMappingStore.getAniListIdsForTmdb(parsedInput.providerId);

		for (const id of anibridgeLinkedIds) linkedIds.add(id);

		const conflictingAniListIds = [...linkedIds].filter(
			(id) => id !== parsedInput.anilistId,
		);

		if (conflictingAniListIds.length > 0 && !parsedInput.force) {
			const providerIdLabel =
				parsedInput.provider === "sonarr" ? "TVDB" : "TMDB";
			throw createError(
				ErrorCode.VALIDATION_ERROR,
				`${providerIdLabel} ID ${parsedInput.providerId} is already linked to other AniList entries.`,
				`This ${providerIdLabel} ID is already linked to other AniList entries. Confirm if you want to share it.`,
				{ conflictingAniListIds },
			);
		}

		await manualMappingService.set(
			parsedInput.provider,
			parsedInput.anilistId,
			parsedInput.providerId,
		);
		await mappingService.evictResolved(
			parsedInput.anilistId,
			parsedInput.provider,
		);

		if (
			parsedInput.provider === "sonarr" &&
			(await getProviderConfig("sonarr"))
		) {
			scheduleLibraryRefresh("sonarr");
		}

		await bumpLibraryRevision(parsedInput.provider);
		await bumpMappingsRevision();
		return { ok: true as const };
	},

	async clearManualMapping(input: unknown) {
		const parsedInput = v.parse(ClearManualMappingInputSchema, input);
		await manualMappingsReady;

		await manualMappingService.clear(
			parsedInput.provider,
			parsedInput.anilistId,
		);
		await mappingService.evictResolved(
			parsedInput.anilistId,
			parsedInput.provider,
		);

		if (
			parsedInput.provider === "sonarr" &&
			(await getProviderConfig("sonarr"))
		) {
			scheduleLibraryRefresh("sonarr");
		}

		await bumpLibraryRevision(parsedInput.provider);
		await bumpMappingsRevision();
		return { ok: true as const };
	},

	async setMappingIgnore(input: unknown) {
		const parsedInput = v.parse(SetMappingIgnoreInputSchema, input);
		await manualMappingsReady;
		await manualMappingService.setIgnore(
			parsedInput.provider,
			parsedInput.anilistId,
		);
		await mappingService.evictResolved(
			parsedInput.anilistId,
			parsedInput.provider,
		);
		await bumpLibraryRevision(parsedInput.provider);
		await bumpMappingsRevision();
		return { ok: true as const };
	},

	async clearMappingIgnore(input: unknown) {
		const parsedInput = v.parse(ClearMappingIgnoreInputSchema, input);
		await manualMappingsReady;
		await manualMappingService.clearIgnore(
			parsedInput.provider,
			parsedInput.anilistId,
		);
		await mappingService.evictResolved(
			parsedInput.anilistId,
			parsedInput.provider,
		);
		await bumpLibraryRevision(parsedInput.provider);
		await bumpMappingsRevision();
		return { ok: true as const };
	},

	async setMappingRejectedCandidate(input: unknown) {
		const parsedInput = v.parse(SetMappingRejectedCandidateInputSchema, input);
		await manualMappingsReady;
		await manualMappingService.setRejectedCandidate(
			parsedInput.provider,
			parsedInput.anilistId,
			parsedInput.providerId,
		);
		await mappingService.evictResolved(
			parsedInput.anilistId,
			parsedInput.provider,
		);
		await bumpLibraryRevision(parsedInput.provider);
		await bumpMappingsRevision();
		return { ok: true as const };
	},

	async clearMappingRejectedCandidate(input: unknown) {
		const parsedInput = v.parse(
			ClearMappingRejectedCandidateInputSchema,
			input,
		);
		await manualMappingsReady;
		await manualMappingService.clearRejectedCandidate(
			parsedInput.provider,
			parsedInput.anilistId,
			parsedInput.providerId,
		);
		await mappingService.evictResolved(
			parsedInput.anilistId,
			parsedInput.provider,
		);
		await bumpLibraryRevision(parsedInput.provider);
		await bumpMappingsRevision();
		return { ok: true as const };
	},

	async getMappings(input?: unknown) {
		const parsedInput = v.parse(GetMappingsInputSchema, input);
		await manualMappingsReady;
		await mappingService.initAnibridgeMappings();

		const sonarrCredentials = await getProviderConfig("sonarr");
		const radarrCredentials = await getProviderConfig("radarr");

		return listMappings(parsedInput, {
			manualMappingService,
			autoMappingStore,
			anibridgeMappingStore:
				anibridgeMappingStore as unknown as ListMappingsDeps["anibridgeMappingStore"],
			sonarrLibrary: {
				getLeanSeriesList: async () => {
					if (!sonarrCredentials) {
						await sonarrLibrary.clearSeriesSnapshotCache();
						return [];
					}
					return sonarrLibrary.getSeriesSnapshots(sonarrCredentials);
				},
			},
			radarrLibrary: {
				getLeanMovieList: async () => {
					if (!radarrCredentials) {
						await radarrLibrary.clearMovieSnapshotCache();
						return [];
					}
					return radarrLibrary.getMovieSnapshots(radarrCredentials);
				},
			},
			projectionCache: mappingListProjectionCache,
			projectionCacheKey: resetProjectionCacheWhenStale(),
		});
	},

	async getMappingInspection(input: unknown) {
		const parsedInput = v.parse(GetMappingInspectionInputSchema, input);
		await manualMappingsReady;
		await mappingService.initAnibridgeMappings();
		return getMappingInspection(parsedInput, {
			manualMappingService,
			autoMappingStore,
			anibridgeMappingStore:
				anibridgeMappingStore as unknown as GetMappingInspectionDeps["anibridgeMappingStore"],
			anilistMetadataStore,
		});
	},
};
