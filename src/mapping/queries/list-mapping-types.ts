/** Types for the mapping list read model. */
// src/mapping/queries/list-mapping-types.ts

import type { AniListId } from "@/anilist";
import type {
	AcceptedMappingReason,
	AcceptedMappingSource,
	EffectiveMappingKind,
	EffectiveMappingState,
	MappingSuppressionKind,
	MappingUnknownReason,
	ProviderExternalId,
} from "@/mapping/types";
import type { Provider } from "@/providers";
import type { MappingListRowStatus } from "./mapping-row-status";

export type { MappingListRowStatus } from "./mapping-row-status";

export interface MappingListRow {
	anilistId: AniListId;
	provider: Provider;
	providerId: ProviderExternalId | null;
	providerMappingState: EffectiveMappingState;
	mappingEntryKind: EffectiveMappingKind;
	mappingSource?: AcceptedMappingSource;
	mappingReason?: AcceptedMappingReason;
	suppressedProviderId?: ProviderExternalId | null;
	suppressionKind?: MappingSuppressionKind;
	mappingUnknownReason?: MappingUnknownReason;
	hadResolveAttempt?: boolean;
	isInLibrary: boolean | null;
	mappingRowStatus: MappingListRowStatus;
	updatedAt: number;
	providerMeta?: {
		title?: string;
		type?: "series" | "movie";
		statusLabel?: string;
	};
}

export interface MappingListGroup {
	key: string;
	provider: Provider;
	providerId: ProviderExternalId | null;
	rows: MappingListRow[];
	linkedAniListIds: readonly AniListId[];
	linkedCount: number;
	isInLibrary: boolean | null;
	updatedAt: number;
	providerMeta?: MappingListRow["providerMeta"];
}

export interface ListMappingsInput {
	entryKinds?: EffectiveMappingKind[];
	providers?: Provider[];
	statuses?: MappingListRowStatus[];
	limit?: number;
	query?: string;
}
