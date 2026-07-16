/** RPC handlers for Seerr request creation, details, and target mapping reads. */
// src/rpc/handlers/seerr.handlers.ts

import { anilistMetadataStore, seerrClient } from "@/background/api-services";
import { requireSeerrConnection } from "@/background/provider-config";
import type { AniListId, AniListMetadata } from "@/anilist/types";
import { resolveTitlePreference } from "@/anilist/title";
import {
	clearManualSeerrTarget,
	listAllManualSeerrTargets,
	getManualSeerrTarget,
	listManualSeerrTargets,
	setManualSeerrTarget,
	type ManualSeerrTarget,
} from "@/mapping/seerr-target.store";
import {
	listAllSeerrUpstreamTargets,
	listSeerrUpstreamTargets,
	type SeerrUpstreamRecord,
} from "@/mapping/upstream.store";
import { buildSeerrRequestPayload } from "@/providers/seerr/request";
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

async function getAniListSeerrTarget(
	anilistId: GetSeerrTargetInput,
): Promise<SeerrRequestTarget | null> {
	const manual = await getManualSeerrTarget(anilistId);
	if (manual) return { ...manual, source: "manual" };

	const upstream = await listSeerrUpstreamTargets([anilistId]);
	const target = upstream[0]?.target;
	return target ? { anilistId, source: "anibridge", ...target } : null;
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

function mergeSeerrTargets(
	manualTargets: readonly ManualSeerrTarget[],
	upstreamTargets: readonly SeerrUpstreamRecord[],
): SeerrRequestTarget[] {
	const manualById = new Set(manualTargets.map((target) => target.anilistId));
	const targets: SeerrRequestTarget[] = [
		...manualTargets.map((target) => ({ ...target, source: "manual" as const })),
		...upstreamTargets
			.filter((record) => !manualById.has(record.anilistId))
			.map((record) => ({
				anilistId: record.anilistId,
				source: "anibridge" as const,
				...record.target,
			})),
	];

	return targets.toSorted((left, right) => left.anilistId - right.anilistId);
}

async function getEffectiveSeerrTargets(): Promise<SeerrRequestTarget[]> {
	const [manualTargets, upstreamTargets] = await Promise.all([
		listAllManualSeerrTargets(),
		listAllSeerrUpstreamTargets(),
	]);
	return mergeSeerrTargets(manualTargets, upstreamTargets);
}

export const seerrHandlers = {
	async getSeerrTarget(input: GetSeerrTargetInput) {
		return getAniListSeerrTarget(input);
	},

	async getSeerrTargets(input: GetSeerrTargetsInput) {
		const [manualTargets, upstreamTargets] = await Promise.all([
			listManualSeerrTargets(input),
			listSeerrUpstreamTargets(input),
		]);
		return mergeSeerrTargets(manualTargets, upstreamTargets);
	},

	async setManualSeerrTarget(input: SetManualSeerrTargetInput) {
		await setManualSeerrTarget(input);
		return { ok: true as const };
	},

	async clearManualSeerrTarget(input: GetSeerrTargetInput) {
		await clearManualSeerrTarget(input);
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
		const targets = await getEffectiveSeerrTargets();
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
