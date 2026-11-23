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
import {
	requireAniListId,
	requireMediaType,
	requireSeasons,
	requireSeerrSeasons,
	requireSourceIdentity,
	requireTmdbId,
	requireTvdbId,
} from "./mapping-validation";
import { createError } from "@/shared/errors/error-utils";
import { ErrorCode } from "@/shared/errors/error.types";
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
		const source = requireSourceIdentity(input.source);
		const mediaType = requireMediaType(input.mediaType);
		const linkedAniListId = await getUniqueAniListIdForSource(source);
		if (
			input.title != null ||
			input.metadata != null ||
			input.forceRetry === true
		) {
			return resolveSeerrAutomaticTarget({
				source,
				mediaType,
				anilistId: linkedAniListId,
				...(input.title == null ? {} : { title: input.title }),
				...(input.metadata == null ? {} : { metadata: input.metadata }),
				...(input.forceRetry === undefined
					? {}
					: { forceRetry: input.forceRetry }),
			});
		}
		return mappingService.getSeerrTarget(source, mediaType, linkedAniListId);
	},

	async getSeerrTargets(input: GetSeerrTargetsInput) {
		if (!Array.isArray(input)) {
			throw createError(
				ErrorCode.VALIDATION_ERROR,
				"Invalid Seerr target list.",
				"Invalid Seerr target list.",
			);
		}
		return mappingService.listSeerrTargets(
			input.map((item) => ({
				anilistId: requireAniListId(item?.anilistId),
				mediaType: requireMediaType(item?.mediaType),
			})),
		);
	},

	async setManualSeerrTarget(input: SetManualSeerrTargetInput) {
		const source = requireSourceIdentity(input.source);
		const mediaType = requireMediaType(input.mediaType);
		const tmdbId = requireTmdbId(input.tmdbId);
		const tvInput = input as { seasons?: unknown };
		const target =
			mediaType === "movie"
				? { mediaType: "movie" as const, tmdbId }
				: {
						mediaType: "tv" as const,
						tmdbId,
						...(tvInput.seasons === undefined
							? {}
							: { seasons: requireSeasons(tvInput.seasons) }),
					};
		const linkedAniListId = await getUniqueAniListIdForSource(source);
		await setManualSeerrTarget(source, target, linkedAniListId ?? undefined);
		await bumpMappingsRevision();
		return { ok: true as const };
	},

	async clearManualSeerrTarget(input: ClearManualSeerrTargetInput) {
		const source = requireSourceIdentity(input.source);
		const mediaType = requireMediaType(input.mediaType);
		const linkedAniListId = await getUniqueAniListIdForSource(source);
		await clearManualSeerrTarget(
			source,
			mediaType,
			linkedAniListId ?? undefined,
		);
		await bumpMappingsRevision();
		return { ok: true as const };
	},

	async requestInSeerr(input: RequestInSeerrInput) {
		const mediaType = requireMediaType(input.mediaType);
		const tmdbId = requireTmdbId(input.tmdbId);
		const tvInput = input as { tvdbId?: unknown; seasons?: unknown };
		const validated =
			mediaType === "movie"
				? { mediaType, tmdbId }
				: {
						mediaType,
						tmdbId,
						...(tvInput.tvdbId === undefined
							? {}
							: { tvdbId: requireTvdbId(tvInput.tvdbId) }),
						seasons: requireSeerrSeasons(tvInput.seasons),
					};
		const connection = await requireSeerrConnection();
		return seerrClient.requestMedia(
			buildSeerrRequestPayload(validated),
			connection,
		);
	},

	async getSeerrMediaStatus(input: GetSeerrMediaStatusInput) {
		const mediaType = requireMediaType(input.mediaType);
		const tmdbId = requireTmdbId(input.tmdbId);
		const tvInput = input as { seasons?: unknown };
		const validated = {
			mediaType,
			tmdbId,
			...(mediaType === "tv" && tvInput.seasons !== undefined
				? { seasons: requireSeerrSeasons(tvInput.seasons) }
				: {}),
		};
		const connection = await requireSeerrConnection();
		return seerrClient.getMediaStatus(validated, connection);
	},

	async searchSeerrMedia(input: { query: string }) {
		const connection = await requireSeerrConnection();
		return seerrClient.searchMedia(input.query, connection);
	},

	async getSeerrMediaDetails(input: GetSeerrMediaDetailsInput) {
		const validated = {
			mediaType: requireMediaType(input.mediaType),
			tmdbId: requireTmdbId(input.tmdbId),
		};
		const connection = await requireSeerrConnection();
		return seerrClient.getMediaDetails(validated, connection);
	},

	async getSeerrPublicSettings() {
		const connection = await requireSeerrConnection();
		return seerrClient.getPublicSettings(connection);
	},

	async getSeerrLinkedAniListEntries(input: GetSeerrLinkedAniListEntriesInput) {
		const mediaType = requireMediaType(input.mediaType);
		const tmdbId = requireTmdbId(input.tmdbId);
		const targets = await mappingService.listAllSeerrTargets(mediaType);
		const ids = targets
			.filter((target) => seerrTargetsMatch({ mediaType, tmdbId }, target))
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
