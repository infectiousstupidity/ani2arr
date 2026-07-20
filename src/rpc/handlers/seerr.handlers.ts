/** RPC handlers for Seerr request creation, details, and target mapping reads. */
// src/rpc/handlers/seerr.handlers.ts

import { anilistMetadataStore, seerrClient } from "@/background/api-services";
import { requireSeerrConnection } from "@/background/provider-config";
import type { AniListId, AniListMetadata } from "@/anilist/types";
import { resolveTitlePreference } from "@/anilist/title";
import {
	clearManualSeerrTarget,
	getEffectiveSeerrTarget,
	listAllEffectiveSeerrTargets,
	listEffectiveSeerrTargets,
	setManualSeerrTarget,
} from "@/mapping/seerr-target.store";
import { buildSeerrRequestPayload } from "@/providers/seerr/request";
import { bumpMappingsRevision } from "@/rpc/revision-signals";
import type {
	GetSeerrLinkedAniListEntriesInput,
	GetSeerrMediaDetailsInput,
	GetSeerrTargetInput,
	GetSeerrMediaStatusInput,
	GetSeerrTargetsInput,
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
		return getEffectiveSeerrTarget(input);
	},

	async getSeerrTargets(input: GetSeerrTargetsInput) {
		return listEffectiveSeerrTargets(input);
	},

	async setManualSeerrTarget(input: SetManualSeerrTargetInput) {
		await setManualSeerrTarget(input);
		await bumpMappingsRevision();
		return { ok: true as const };
	},

	async clearManualSeerrTarget(input: GetSeerrTargetInput) {
		await clearManualSeerrTarget(input);
		await bumpMappingsRevision();
		return { ok: true as const };
	},

	async requestInSeerr(input: RequestInSeerrInput) {
		const connection = await requireSeerrConnection();
		return seerrClient.requestMedia(buildSeerrRequestPayload(input), connection);
	},

	async getSeerrMediaStatus(input: GetSeerrMediaStatusInput) {
		const connection = await requireSeerrConnection();
		return {
			status: await seerrClient.getMediaStatus(input, connection),
		};
	},

	async searchSeerrMedia(input: { query: string }) {
		const connection = await requireSeerrConnection();
		return seerrClient.searchMedia(input.query, connection);
	},

	async getSeerrMediaDetails(input: GetSeerrMediaDetailsInput) {
		const connection = await requireSeerrConnection();
		return seerrClient.getMediaDetails(input, connection);
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
