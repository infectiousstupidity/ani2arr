/** Builds minimal mapping-owned inspection payloads for media modal actions. */
// src/mapping/queries/mapping-details.ts

import type { AniListId } from "@/anilist";
import type { AniListMetadata } from "@/anilist/schemas/metadata.schema";
import type { AniListMediaFormat } from "@/anilist/schemas/media.schema";
import { resolveTitlePreference } from "@/anilist/title-preference";
import type { AutoMappingRecord } from "@/mapping/auto-mapping/types";
import type { MappingService } from "@/mapping/mapping.service";
import type { EffectiveMappingKind, ProviderExternalId } from "@/mapping/types";
import { type Provider, type TmdbId, type TvdbId } from "@/providers";

export interface GetMappingInspectionInput {
	provider: Provider;
	anilistId: AniListId;
}

export interface GetMappingInspectionDeps {
	mappingService: Pick<MappingService, "getEffectiveMapping">;
	manualMappingService: {
		getLinkedAniListIds(
			provider: Provider,
			providerId: ProviderExternalId,
		): AniListId[];
	};
	anibridgeMappingStore: {
		getAniListIdsForTvdb(tvdbId: TvdbId): AniListId[];
		getAniListIdsForTmdb(tmdbId: TmdbId): AniListId[];
	};
	autoMappingStore: {
		list(
			provider?: Provider,
		): Promise<
			Array<AutoMappingRecord & { anilistId: AniListId; provider: Provider }>
		>;
	};
	anilistMetadataStore: {
		getMetadata(
			ids: number[],
			options?: {
				refreshStale?: boolean;
				maxBatch?: number;
				fetchMissing?: boolean;
			},
		): Promise<{ metadata: AniListMetadata[]; missingIds?: number[] }>;
	};
}

interface MappingDetailsLinkedAniListEntry {
	anilistId: AniListId;
	title?: string;
	format?: AniListMediaFormat | null;
	year?: number | null;
	coverImage?: string | null;
	relation?: "current";
}

interface MappingDetailsEffectiveMapping {
	providerId: ProviderExternalId | null;
	mappingEntryKind: EffectiveMappingKind;
	suppressedProviderId?: ProviderExternalId | null;
}

export interface MappingDetailsPayload {
	effectiveMapping: MappingDetailsEffectiveMapping;
	linkedAniListEntries: readonly MappingDetailsLinkedAniListEntry[];
}

async function getLinkedAniListIds(
	provider: Provider,
	providerId: ProviderExternalId,
	deps: GetMappingInspectionDeps,
): Promise<AniListId[]> {
	const manualIds = deps.manualMappingService.getLinkedAniListIds(
		provider,
		providerId,
	);
	const upstreamIds =
		provider === "sonarr"
			? deps.anibridgeMappingStore.getAniListIdsForTvdb(providerId as TvdbId)
			: deps.anibridgeMappingStore.getAniListIdsForTmdb(providerId as TmdbId);

	const autoMappings = await deps.autoMappingStore.list(provider);
	const autoIds = autoMappings
		.filter(
			(record) => record.state === "mapped" && record.providerId === providerId,
		)
		.map((record) => record.anilistId);

	return [...new Set([...manualIds, ...upstreamIds, ...autoIds])];
}

function buildLinkedAniListEntries(
	anilistId: AniListId,
	linkedAniListIds: readonly AniListId[],
	metadataById: Map<AniListId, AniListMetadata>,
): MappingDetailsLinkedAniListEntry[] {
	return linkedAniListIds.map((linkedAniListId) => {
		const metadata = metadataById.get(linkedAniListId);
		const title = metadata
			? resolveTitlePreference({ titles: metadata.titles }).primary
			: undefined;

		return {
			anilistId: linkedAniListId,
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
			...(linkedAniListId === anilistId ? { relation: "current" } : {}),
		};
	});
}

export async function getMappingInspection(
	input: GetMappingInspectionInput,
	deps: GetMappingInspectionDeps,
): Promise<MappingDetailsPayload> {
	const effectiveMapping = await deps.mappingService.getEffectiveMapping(
		input.provider,
		input.anilistId,
	);

	const linkedAniListIds =
		effectiveMapping.providerId === null
			? []
			: await getLinkedAniListIds(
					input.provider,
					effectiveMapping.providerId,
					deps,
				);

	const linkedIdsWithCurrent =
		effectiveMapping.providerId === null
			? []
			: [...new Set([input.anilistId, ...linkedAniListIds])].toSorted(
					(left, right) => left - right,
				);

	const linkedMetadata =
		linkedIdsWithCurrent.length === 0
			? { metadata: [] as AniListMetadata[] }
			: await deps.anilistMetadataStore.getMetadata(linkedIdsWithCurrent, {
					refreshStale: false,
					fetchMissing: false,
				});

	const metadataById = new Map(
		linkedMetadata.metadata.map((entry) => [entry.id, entry] as const),
	);

	return {
		effectiveMapping: {
			providerId: effectiveMapping.providerId,
			mappingEntryKind: effectiveMapping.mappingEntryKind,
			...(effectiveMapping.suppressedProviderId === undefined
				? {}
				: { suppressedProviderId: effectiveMapping.suppressedProviderId }),
		},
		linkedAniListEntries: buildLinkedAniListEntries(
			input.anilistId,
			linkedIdsWithCurrent,
			metadataById,
		),
	};
}
