/** RPC handlers for Seerr request creation, details, and target mapping reads. */
// src/rpc/handlers/seerr.handlers.ts

import { resolveTitlePreference } from "@/anilist/title";
import type { AniListId, AniListMetadata } from "@/anilist/types";
import {
	anilistMetadataStore,
	mappingService,
	resolveSeerrAutomaticTarget,
	seerrClient,
} from "@/background/api-services";
import { requireSeerrConnection } from "@/background/provider-config";
import {
	clearManualSeerrTarget,
	setManualSeerrTarget,
} from "@/mapping/manual.store";
import { getUniqueAniListIdForSource } from "@/mapping/upstream.store";
import { buildSeerrRequestPayload } from "@/providers/seerr/request";
import { bumpMappingsRevision } from "@/rpc/revision-signals";
import type {
	GetSeerrLinkedAniListEntriesInput,
	GetSeerrMediaDetailsInput,
	GetSeerrMediaStatusInput,
	GetSeerrTargetInput,
	GetSeerrTargetsInput,
	ClearManualSeerrTargetInput,
	MappingDetailsLinkedAniListEntry,
	RequestInSeerrInput,
	SeerrRequestTarget,
	SetManualSeerrTargetInput,
} from "@/rpc/types";

function seerrTargetsMatch(
	input: GetSeerrLinkedAniListEntriesInput,
	target: SeerrRequestTarget,
): boolean {
	return target.mediaType === input.mediaType && target.tmdbId === input.tmdbId;
}

function buildSeerrLinkedEntry(
	anilistId: AniListId,
	metadata: AniListMetadata | undefined,
): MappingDetailsLinkedAniListEntry {
	const title = metadata
		? resolveTitlePreference({ titles: metadata.titles }).primary
		: undefined;

	return {
		anilistId,
		...(title ? { title } : {}),
		...(metadata?.format === undefined ? {} : { format: metadata.format }),
		...(metadata?.seasonYear === undefined
			? {}
			: { year: metadata.seasonYear }),
		...(metadata?.coverImage === undefined
			? {}
			: {
					coverImage:
						metadata.coverImage?.medium ?? metadata.coverImage?.large ?? null,
				}),
	};
}

export const seerrHandlers = {
	async getSeerrTarget(input: GetSeerrTargetInput) {
		const linkedAniListId = await getUniqueAniListIdForSource(input.source);
		if (
			input.title != null ||
			input.metadata != null ||
			input.forceRetry === true
		) {
			return resolveSeerrAutomaticTarget({
				source: input.source,
				mediaType: input.mediaType,
				anilistId: linkedAniListId,
				...(input.title == null ? {} : { title: input.title }),
				...(input.metadata == null ? {} : { metadata: input.metadata }),
				...(input.forceRetry === undefined
					? {}
					: { forceRetry: input.forceRetry }),
			});
		}
		return mappingService.getSeerrTarget(
			input.source,
			input.mediaType,
			linkedAniListId,
		);
	},

	async getSeerrTargets(input: GetSeerrTargetsInput) {
		return mappingService.listSeerrTargets(input);
	},

	async setManualSeerrTarget(input: SetManualSeerrTargetInput) {
		const linkedAniListId = await getUniqueAniListIdForSource(input.source);
		await setManualSeerrTarget(
			input.source,
			input.mediaType === "movie"
				? { mediaType: "movie", tmdbId: input.tmdbId }
				: {
						mediaType: "tv",
						tmdbId: input.tmdbId,
						...(input.tvdbId === undefined ? {} : { tvdbId: input.tvdbId }),
						...(input.seasons === undefined ? {} : { seasons: input.seasons }),
					},
			linkedAniListId ?? undefined,
		);
		await bumpMappingsRevision();
		return { ok: true as const };
	},

	async clearManualSeerrTarget(input: ClearManualSeerrTargetInput) {
		const linkedAniListId = await getUniqueAniListIdForSource(input.source);
		await clearManualSeerrTarget(
			input.source,
			input.mediaType,
			linkedAniListId ?? undefined,
		);
		await bumpMappingsRevision();
		return { ok: true as const };
	},

	async requestInSeerr(input: RequestInSeerrInput) {
		const connection = await requireSeerrConnection();
		return seerrClient.requestMedia(
			buildSeerrRequestPayload(input),
			connection,
		);
	},

	async getSeerrMediaStatus(input: GetSeerrMediaStatusInput) {
		const connection = await requireSeerrConnection();
		return seerrClient.getMediaStatus(input, connection);
	},

	async searchSeerrMedia(input: { query: string }) {
		const connection = await requireSeerrConnection();
		return seerrClient.searchMedia(input.query, connection);
	},

	async getSeerrMediaDetails(input: GetSeerrMediaDetailsInput) {
		const connection = await requireSeerrConnection();
		return seerrClient.getMediaDetails(input, connection);
	},

	async getSeerrPublicSettings() {
		const connection = await requireSeerrConnection();
		return seerrClient.getPublicSettings(connection);
	},

	async getSeerrLinkedAniListEntries(input: GetSeerrLinkedAniListEntriesInput) {
		const targets = await mappingService.listAllSeerrTargets(input.mediaType);
		const ids = targets
			.filter((target) => seerrTargetsMatch(input, target))
			.map((target) => target.anilistId);

		if (ids.length === 0) return [];

		const metadata = await anilistMetadataStore.getMetadata(ids);
		const metadataById = new Map(
			metadata.metadata.map((entry) => [entry.id, entry] as const),
		);

		return ids.map((anilistId) =>
			buildSeerrLinkedEntry(anilistId, metadataById.get(anilistId)),
		);
	},
};
