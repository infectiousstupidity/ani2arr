/** Builds effective mapping identity summaries for requested AniList media. */
// src/mapping/queries/mapping-identities.ts

import type { AniListId } from "@/anilist";
import type { AutoMappingRecord } from "@/mapping/auto-mapping/types";
import type { MappingService } from "@/mapping/mapping.service";
import type { EffectiveMapping } from "@/mapping/effective-mapping";
import type { ProviderExternalId } from "@/mapping/types";
import type { AnibridgeMappingPair } from "@/mapping/upstream-mapping";
import { PROVIDERS, type Provider } from "@/providers";

export type EffectiveMappingPresence = Pick<
	EffectiveMapping,
	| "anilistId"
	| "provider"
	| "providerId"
	| "providerMappingState"
	| "mappingEntryKind"
	| "mappingSource"
	| "mappingReason"
>;

export interface GetMappingIdentitiesDeps {
	mappingService: Pick<MappingService, "getEffectiveMapping">;
	manualMappingService: {
		listIgnores(): Array<{ anilistId: AniListId; provider: Provider }>;
		list(): Array<{
			anilistId: AniListId;
			provider: Provider;
			providerId: ProviderExternalId;
		}>;
	};
	anibridgeMappingStore: {
		listAllProviderPairs(): AnibridgeMappingPair[];
	};
	autoMappingStore: {
		list(
			provider?: Provider,
		): Promise<
			Array<AutoMappingRecord & { anilistId: AniListId; provider: Provider }>
		>;
	};
}

const createKey = (provider: Provider, anilistId: AniListId): string =>
	`${provider}:${anilistId}`;

const toEffectiveMappingPresence = (
	mapping: EffectiveMapping,
): EffectiveMappingPresence => ({
	anilistId: mapping.anilistId,
	provider: mapping.provider,
	providerId: mapping.providerId,
	providerMappingState: mapping.providerMappingState,
	mappingEntryKind: mapping.mappingEntryKind,
	...(mapping.mappingSource ? { mappingSource: mapping.mappingSource } : {}),
	...(mapping.mappingReason ? { mappingReason: mapping.mappingReason } : {}),
});

export async function getMappingIdentities(
	ids: readonly AniListId[],
	deps: GetMappingIdentitiesDeps,
): Promise<EffectiveMappingPresence[]> {
	const requestedIds = new Set(ids);
	if (requestedIds.size === 0) {
		return [];
	}

	const keys = new Set<string>();

	for (const ignore of deps.manualMappingService.listIgnores()) {
		if (requestedIds.has(ignore.anilistId)) {
			keys.add(createKey(ignore.provider, ignore.anilistId));
		}
	}

	for (const manual of deps.manualMappingService.list()) {
		if (requestedIds.has(manual.anilistId)) {
			keys.add(createKey(manual.provider, manual.anilistId));
		}
	}

	for (const pair of deps.anibridgeMappingStore.listAllProviderPairs()) {
		if (requestedIds.has(pair.anilistId)) {
			keys.add(createKey(pair.provider, pair.anilistId));
		}
	}

	const autoMappings = await deps.autoMappingStore.list();
	for (const mapping of autoMappings) {
		if (requestedIds.has(mapping.anilistId)) {
			keys.add(createKey(mapping.provider, mapping.anilistId));
		}
	}

	const mappings = await Promise.all(
		[...requestedIds].flatMap((anilistId) =>
			PROVIDERS.flatMap((provider) =>
				keys.has(createKey(provider, anilistId))
					? [deps.mappingService.getEffectiveMapping(provider, anilistId)]
					: [],
			),
		),
	);

	return mappings.map((mapping) => toEffectiveMappingPresence(mapping));
}
