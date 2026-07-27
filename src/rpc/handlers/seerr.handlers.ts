/** RPC handlers for Seerr request creation, details, and target mapping reads. */
// src/rpc/handlers/seerr.handlers.ts

import { resolveTitlePreference } from "@/anilist/title";
import type { AniListId, AniListMetadata } from "@/anilist/types";
import {
	anilistMetadataStore,
	resolveSeerrAutomaticTarget,
	seerrClient,
} from "@/background/api-services";
import { requireSeerrConnection } from "@/background/provider-config";
import {
	clearManualSeerrTarget,
	getEffectiveSeerrTarget,
	listAllEffectiveSeerrTargets,
	listEffectiveSeerrTargets,
	setManualSeerrTarget,
} from "@/mapping/seerr-target.store";
import { buildSeerrRequestPayload } from "@/providers/seerr/request";
import { bumpMappingsRevision } from "@/rpc/revision-signals";
import { resolveAniListIdFromInput, sourceFromInput } from "@/rpc/source-input";
import type {
	GetSeerrLinkedAniListEntriesInput,
	GetSeerrMediaDetailsInput,
	GetSeerrMediaStatusInput,
	GetSeerrTargetInput,
	GetSeerrTargetsInput,
	MappingDetailsLinkedAniListEntry,
	RequestInSeerrInput,
	SeerrRequestTarget,
	SetManualSeerrTargetInput,
	SourceRpcInput,
} from "@/rpc/types";

async function resolveSeerrTargetIdentity(input: SourceRpcInput) {
	const anilistId = await resolveAniListIdFromInput(input);
	return {
		identity: sourceFromInput(input),
		...(anilistId === null ? {} : { anilistId }),
	};
}

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
		const identity = await resolveSeerrTargetIdentity(input);
		if (
			input.title != null ||
			input.metadata != null ||
			input.forceRetry === true
		) {
			return resolveSeerrAutomaticTarget({
				source: identity.identity,
				...(identity.anilistId === undefined
					? {}
					: { anilistId: identity.anilistId }),
				...(input.title == null ? {} : { title: input.title }),
				...(input.metadata == null ? {} : { metadata: input.metadata }),
				...(input.forceRetry === undefined
					? {}
					: { forceRetry: input.forceRetry }),
			});
		}
		return getEffectiveSeerrTarget(identity);
	},

	async getSeerrTargets(input: GetSeerrTargetsInput) {
		return listEffectiveSeerrTargets(input);
	},

	async setManualSeerrTarget(input: SetManualSeerrTargetInput) {
		await setManualSeerrTarget({
			...(await resolveSeerrTargetIdentity(input)),
			...(input.mediaType === "movie"
				? { mediaType: "movie", tmdbId: input.tmdbId }
				: {
						mediaType: "tv",
						tmdbId: input.tmdbId,
						...(input.tvdbId === undefined ? {} : { tvdbId: input.tvdbId }),
						...(input.seasons === undefined ? {} : { seasons: input.seasons }),
					}),
		});
		await bumpMappingsRevision();
		return { ok: true as const };
	},

	async clearManualSeerrTarget(input: GetSeerrTargetInput) {
		await clearManualSeerrTarget(await resolveSeerrTargetIdentity(input));
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
		const targets = await listAllEffectiveSeerrTargets();
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
