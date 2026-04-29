/** RPC handlers for manual mappings, exports, and mapping listings. */
// src/rpc/handlers/mapping.handlers.ts

import * as v from "valibot";
import { AniListIdSchema, type AniListId } from "@/anilist/anilist-id";
import { getMappingInspection } from "@/mapping/inspection/get-mapping-inspection";
import { getMappingIdentities } from "@/mapping/mapping-identities";
import type { Ani2arrApi } from "@/rpc";
import { getExtensionOptionsSnapshot, hasConfiguredProviderCredentials } from "@/options";
import type { TmdbId, TvdbId } from "@/providers";
import { createError, ErrorCode } from "@/shared/errors";
import { listMappings } from "@/mapping/review/list-mappings";
import {
	ClearMappingIgnoreInputSchema,
	ClearManualMappingInputSchema,
	ClearMappingRejectedCandidateInputSchema,
	GetMappingInspectionInputSchema,
	GetMappingIdentitiesInputSchema,
	GetMappingsInputSchema,
	GetStaticMappedInputSchema,
	SetMappingIgnoreInputSchema,
	SetManualMappingInputSchema,
	SetMappingRejectedCandidateInputSchema,
} from "@/rpc/schemas";
import type { ApiHandlerDeps } from "./handler-deps";

export function createMappingHandlers(
	deps: ApiHandlerDeps,
): Pick<
	Ani2arrApi,
	| "getStaticMapped"
	| "getMappingIdentities"
	| "initMappings"
	| "setManualMapping"
	| "clearManualMapping"
	| "setMappingIgnore"
	| "clearMappingIgnore"
	| "setMappingRejectedCandidate"
	| "clearMappingRejectedCandidate"
	| "getManualMappings"
	| "clearAllManualMappings"
	| "getMappings"
	| "getMappingInspection"
> {
	const {
		mappingService,
		manualMappingService,
		autoMappingStore,
		anibridgeMappingStore,
		sonarrLibrary,
		radarrLibrary,
		manualMappingsReady,
		scheduleLibraryRefresh,
		bumpLibraryRevision,
		bumpMappingsRevision,
	} = deps;

	const anibridgeMappingStoreWithAniListIds = {
		getSonarrCandidates: (anilistId: AniListId) =>
			anibridgeMappingStore.getSonarrCandidates(anilistId),
		getRadarrCandidates: (anilistId: AniListId) =>
			anibridgeMappingStore.getRadarrCandidates(anilistId),
		getAniListIdsForTvdb: (tvdbId: TvdbId): AniListId[] =>
			anibridgeMappingStore
				.getAniListIdsForTvdb(tvdbId)
				.map((anilistId) => v.parse(AniListIdSchema, anilistId)),
		getAniListIdsForTmdb: (tmdbId: TmdbId): AniListId[] =>
			anibridgeMappingStore
				.getAniListIdsForTmdb(tmdbId)
				.map((anilistId) => v.parse(AniListIdSchema, anilistId)),
		listAllProviderPairs: () =>
			anibridgeMappingStore.listAllProviderPairs().map((pair) => ({
				...pair,
				anilistId: v.parse(AniListIdSchema, pair.anilistId),
			})),
	};

	const handlers = {
		async getMappingIdentities(ids) {
			const parsedIds = v.parse(GetMappingIdentitiesInputSchema, ids);
			await manualMappingsReady;
			await mappingService.initAnibridgeMappings();
			return getMappingIdentities(parsedIds, {
				manualMappingService,
				autoMappingStore,
				anibridgeMappingStore,
			});
		},

		/** @deprecated Use getMappingIdentities for provider-aware known mapping lookup. */
		async getStaticMapped(ids) {
			const parsedIds = v.parse(GetStaticMappedInputSchema, ids);
			await manualMappingsReady;
			await mappingService.initAnibridgeMappings();
			const identities = await getMappingIdentities(parsedIds, {
				manualMappingService,
				autoMappingStore,
				anibridgeMappingStore,
			});
			return [
				...new Set(
					identities
						.filter(identity =>
							identity.providerMappingState === "mapped" &&
							identity.providerId !== null)
						.map(identity => identity.anilistId),
				),
			];
		},

		initMappings() {
			return mappingService.initAnibridgeMappings();
		},

		async setManualMapping(input) {
			const parsedInput = v.parse(SetManualMappingInputSchema, input);
			await manualMappingsReady;

			const linkedIds =
				parsedInput.provider === "sonarr"
					? new Set<number>(
							manualMappingService.getLinkedAniListIds(
								parsedInput.provider,
								parsedInput.providerId,
							),
						)
					: new Set<number>(
							manualMappingService.getLinkedAniListIds(
								parsedInput.provider,
								parsedInput.providerId,
							),
						);
			const anibridgeLinkedIds =
				parsedInput.provider === "sonarr"
					? anibridgeMappingStore.getAniListIdsForTvdb(parsedInput.providerId)
					: anibridgeMappingStore.getAniListIdsForTmdb(parsedInput.providerId);
			for (const id of anibridgeLinkedIds) {
				linkedIds.add(id);
			}
			const conflictingAniListIds = [...linkedIds].filter(
				(id) => id !== parsedInput.anilistId,
			);
			if (conflictingAniListIds.length > 0 && parsedInput.force !== true) {
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

			if (parsedInput.provider === "sonarr") {
				const options = await getExtensionOptionsSnapshot();
				if (hasConfiguredProviderCredentials(options, "sonarr")) {
					scheduleLibraryRefresh("sonarr", options);
				}
			}

			await bumpLibraryRevision(parsedInput.provider);
			await bumpMappingsRevision();
			return { ok: true as const };
		},

		async clearManualMapping(input) {
			const parsedInput = v.parse(ClearManualMappingInputSchema, input);
			await manualMappingsReady;
			await manualMappingService.clear(parsedInput.provider, parsedInput.anilistId);
			await mappingService.evictResolved(
				parsedInput.anilistId,
				parsedInput.provider,
			);

			if (parsedInput.provider === "sonarr") {
				const options = await getExtensionOptionsSnapshot();
				if (hasConfiguredProviderCredentials(options, "sonarr")) {
					scheduleLibraryRefresh("sonarr", options);
				}
			}

			await bumpLibraryRevision(parsedInput.provider);
			await bumpMappingsRevision();
			return { ok: true as const };
		},

		async setMappingIgnore(input) {
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

		async clearMappingIgnore(input) {
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

		async setMappingRejectedCandidate(input) {
			const parsedInput = v.parse(
				SetMappingRejectedCandidateInputSchema,
				input,
			);
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

		async clearMappingRejectedCandidate(input) {
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

		async getManualMappings() {
			await manualMappingsReady;
			return manualMappingService.list();
		},

		async clearAllManualMappings() {
			await manualMappingsReady;
			const snapshot = manualMappingService.exportState();
			const existing = manualMappingService.list();
			const existingIgnores = manualMappingService.listIgnores();

			try {
				await manualMappingService.clearAll();
				await Promise.all(
					existing.map((entry) =>
						mappingService.evictResolved(entry.anilistId, entry.provider),
					),
				);
				await Promise.all(
					existingIgnores.map((entry) =>
						mappingService.evictResolved(entry.anilistId, entry.provider),
					),
				);

				const options = await getExtensionOptionsSnapshot();
				if (hasConfiguredProviderCredentials(options, "sonarr")) {
					scheduleLibraryRefresh("sonarr", options);
				}

				await bumpLibraryRevision("sonarr");
				await bumpLibraryRevision("radarr");
				await bumpMappingsRevision();

				return { ok: true as const };
			} catch (error) {
				try {
					await manualMappingService.importState(snapshot);
				} catch (restoreError) {
					throw createError(
						ErrorCode.STORAGE_ERROR,
						"Failed to clear stored mappings, and rollback failed.",
						"Failed to clear stored mappings, and the previous mapping state could not be restored.",
						{ cause: restoreError },
					);
				}

				throw error;
			}
		},

		async getMappings(input) {
			const parsedInput = v.parse(GetMappingsInputSchema, input);
			await manualMappingsReady;
			await mappingService.initAnibridgeMappings();
			return listMappings(parsedInput, {
				manualMappingService,
				autoMappingStore,
				anibridgeMappingStore: anibridgeMappingStoreWithAniListIds,
				sonarrLibrary,
				radarrLibrary,
			});
		},

		async getMappingInspection(input) {
			const parsedInput = v.parse(GetMappingInspectionInputSchema, input);
			await manualMappingsReady;
			await mappingService.initAnibridgeMappings();
			return getMappingInspection(parsedInput, {
				manualMappingService,
				autoMappingStore,
				anibridgeMappingStore: anibridgeMappingStoreWithAniListIds,
				anilistMetadataStore: deps.anilistMetadataStore,
				sonarrLibrary,
				radarrLibrary,
			});
		},
	} satisfies Pick<
		Ani2arrApi,
		| "getStaticMapped"
		| "getMappingIdentities"
		| "initMappings"
		| "setManualMapping"
		| "clearManualMapping"
		| "setMappingIgnore"
		| "clearMappingIgnore"
		| "setMappingRejectedCandidate"
		| "clearMappingRejectedCandidate"
		| "getManualMappings"
		| "clearAllManualMappings"
		| "getMappings"
		| "getMappingInspection"
	>;

	return handlers;
}
