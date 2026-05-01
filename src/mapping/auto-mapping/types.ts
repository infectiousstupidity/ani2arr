/** Auto-mapping resolver result and persistence types. */
// src/mapping/auto-mapping/types.ts

import type { AniListMediaHint } from "@/anilist/schemas/media.schema";
import type { ProviderId } from "@/providers";
import type { RequestPriority } from "@/shared/utils/request-priority";
import type {
	AcceptedMappingEvidence,
	AcceptedMappingReason,
	AcceptedMappingSource,
	RecentMappingEvaluationTrace,
} from "@/mapping/types";

/**
 * Source of an automated resolver result.
 *
 * This is a narrower version of `AcceptedMappingSource` that intentionally excludes
 * `manual`, because manual mappings are user-owned, not resolver-produced
 * candidates or resolver-accepted results.
 */
export type AutoMappingSource = Exclude<AcceptedMappingSource, "manual">;

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
	recentEvaluation?: RecentMappingEvaluationTrace;
}

/**
 * Persisted or cached semantic auto-mapping outcome for one `provider + anilistId`.
 *
 * Important distinction:
 * - `acceptedEvidence` is only used for successful mapped outcomes
 * - `recentEvaluation` is the rebuildable explanation cache for the latest attempt
 */
export type AutoMappingRecord =
	| {
			state: "mapped";
			providerId: ProviderId;
			acceptedEvidence: AcceptedMappingEvidence;
			recentEvaluation?: RecentMappingEvaluationTrace;
			updatedAt: number;
	  }
	| {
			state: Exclude<AutoMappingStatus, "mapped">;
			recentEvaluation?: RecentMappingEvaluationTrace;
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
