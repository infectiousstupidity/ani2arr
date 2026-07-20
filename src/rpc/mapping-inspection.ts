/** Builds RPC mapping detail payloads from mapping results and AniList metadata. */
// src/rpc/mapping-inspection.ts

import type { AniListId, AniListMetadata } from "@/anilist/types";
import { resolveTitlePreference } from "@/anilist/title";
import type { MappingService } from "@/mapping/mapping.service";
import type { Provider } from "@/providers/types";
import { anilistIdFromSource, sourceFromInput } from "@/rpc/source-input";
import type {
	GetMappingInspectionOutput,
	MappingDetailsLinkedAniListEntry,
	SourceRpcInput,
} from "@/rpc/types";

export type GetMappingInspectionInput = SourceRpcInput & {
	provider: Provider;
};

export interface GetMappingInspectionDeps {
	mappingService: Pick<MappingService, "getMapping" | "getLinkedAniListIds">;
	anilistMetadataStore: {
		getMetadata(
			ids: number[],
		): Promise<{ metadata: AniListMetadata[]; missingIds?: number[] }>;
	};
}

function buildLinkedAniListEntries(
	currentAniListId: AniListId | null,
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
			...(linkedAniListId === currentAniListId ? { relation: "current" } : {}),
		};
	});
}

export async function getMappingInspection(
	input: GetMappingInspectionInput,
	deps: GetMappingInspectionDeps,
): Promise<GetMappingInspectionOutput> {
	const source = sourceFromInput(input);
	const currentAniListId = input.anilistId ?? anilistIdFromSource(source);
	const mapping = await deps.mappingService.getMapping(input.provider, source);

	const linkedAniListIds =
		mapping.kind === "mapped"
			? await deps.mappingService.getLinkedAniListIds(
					input.provider,
					mapping.providerId,
				)
			: [];

	const linkedIdsWithCurrent =
		mapping.kind === "mapped"
			? [
					...new Set(
						currentAniListId === null
							? linkedAniListIds
							: [currentAniListId, ...linkedAniListIds],
					),
				].toSorted(
					(left, right) => left - right,
				)
			: [];

	const linkedMetadata =
		linkedIdsWithCurrent.length === 0
			? { metadata: [] as AniListMetadata[] }
			: await deps.anilistMetadataStore.getMetadata(linkedIdsWithCurrent);

	const metadataById = new Map(
		linkedMetadata.metadata.map((entry) => [entry.id, entry] as const),
	);

	return {
		source,
		mapping,
		linkedAniListEntries: buildLinkedAniListEntries(
			currentAniListId,
			linkedIdsWithCurrent,
			metadataById,
		),
	};
}
