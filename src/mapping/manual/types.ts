/** Manual mapping-owned persisted entry types. */
// src/mapping/manual/types.ts

import type { AniListId } from "@/anilist";
import type { Provider, ProviderId } from "@/providers";

export interface PersistedProviderMappingRecord {
	anilistId: AniListId;
	provider: Provider;
	providerId: ProviderId;
	updatedAt: number;
}

export interface PersistedMappingIgnoreRecord {
	anilistId: AniListId;
	provider: Provider;
	updatedAt: number;
}

export type ManualMappingKey = `${Provider}:${number}`;

// One user-authored mapping decision for one provider + AniList entry.
export interface StoredManualMapping {
	v: 2;
	providerId?: number;
	mappedAt?: number;
	ignoredAt?: number;
	rejectedProviderIds?: Record<string, number>;
	updatedAt: number;
}

export type StoredManualMappings = Record<
	ManualMappingKey,
	StoredManualMapping
>;
