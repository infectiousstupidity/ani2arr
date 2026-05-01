/** Auto-mapping resolver result and persistence types. */
// src/mapping/auto-mapping/types.ts

import type { AniListMediaHint } from "@/anilist/schemas/media.schema";
import type { ProviderId } from "@/providers";
import type { RequestPriority } from "@/shared/utils/request-priority";
import type {
	AcceptedMappingEvidence,
	AcceptedMappingReason,
} from "@/mapping/types";

/**
 * Source of an automated resolver result.
 */
export type AutoMappingSource = "auto";

export type AutoMappingEvidence = AcceptedMappingEvidence & {
	source: AutoMappingSource;
};

/**
 * Final semantic result of trying to auto-map one `provider + anilistId`.
 *
 * Important:
 * - `unresolved` = no acceptable answer
 * - `ambiguous` = too many plausible answers
 */
export type AutoMappingStatus = "mapped" | "unresolved" | "ambiguous";

/** Successful auto-mapping result returned by the resolver. */
export interface AcceptedAutoMappingResult {
	providerId: ProviderId;
	reason: AcceptedMappingReason;
	successfulSynonym?: string;
}

/**
 * Persisted or cached semantic auto-mapping outcome for one `provider + anilistId`.
 *
 * Important distinction:
 * - `acceptedEvidence` is only used for successful mapped outcomes
 */
export type AutoMappingRecord =
	| {
			state: "mapped";
			providerId: ProviderId;
			acceptedEvidence: AutoMappingEvidence;
			updatedAt: number;
	  }
	| {
			state: Exclude<AutoMappingStatus, "mapped">;
			updatedAt: number;
	  };

/**
 * Options that influence provider-id resolution for one AniList entry.
 *
 * These control network usage, hinting, and lookup freshness, but do not change the
 * semantic meaning of resolver outcomes.
 */
export interface AutoMappingOptions {
	network?: "never";
	hints?: {
		primaryTitle?: string;
		domMedia?: AniListMediaHint | null;
	};
	priority?: RequestPriority;
	/** Force provider lookups to bypass fresh caches, used by anime-detail force-verify flows. */
	forceLookupNetwork?: boolean;
}
