/** Mapping service input and output types for AniList-driven resolution flows. */
// src/mapping/types.ts

import {
	parseTmdbIdOrNull,
	parseTvdbIdOrNull,
	type TmdbId,
	type TvdbId,
} from "@/providers/schemas";
import type { Provider } from "@/providers/types";

export type ProviderExternalId = TvdbId | TmdbId;

export type ProviderMappingTarget =
	| { provider: "sonarr"; providerId: TvdbId }
	| { provider: "radarr"; providerId: TmdbId };

export function parseProviderExternalId(
	provider: "sonarr",
	value: unknown,
): TvdbId | null;
export function parseProviderExternalId(
	provider: "radarr",
	value: unknown,
): TmdbId | null;
export function parseProviderExternalId(
	provider: Provider,
	value: unknown,
): ProviderExternalId | null;
export function parseProviderExternalId(
	provider: Provider,
	value: unknown,
): ProviderExternalId | null {
	return provider === "sonarr"
		? parseTvdbIdOrNull(value)
		: parseTmdbIdOrNull(value);
}

export function createProviderMappingTarget(
	provider: Provider,
	value: unknown,
): ProviderMappingTarget | null {
	if (provider === "sonarr") {
		const providerId = parseTvdbIdOrNull(value);
		return providerId === null ? null : { provider, providerId };
	}

	const providerId = parseTmdbIdOrNull(value);
	return providerId === null ? null : { provider, providerId };
}

/** Derived entry kinds used by review/filter/table surfaces. */
export const MAPPING_ENTRY_KIND_VALUES = [
	"manual",
	"upstream",
	"auto",
	"ignored",
	"rejected",
	"unmapped",
	"unknown",
] as const;

export type EffectiveMappingKind = (typeof MAPPING_ENTRY_KIND_VALUES)[number];

/** Canonical mapping-resolution truth for one provider + AniList entry. */
export type EffectiveMappingState = "mapped" | "unmapped" | "unknown";

/** Semantic reason why mapping state is unknown. */
export type MappingUnknownReason =
	| "provider-not-configured"
	| "network-disabled"
	| "lookup-failed"
	| "ambiguous";

/**
 * Source of an accepted mapping.
 *
 * This describes how the currently effective mapping became accepted.
 *
 * - `manual`: user-created exact manual mapping
 * - `upstream`: exact upstream mapping
 * - `auto`: resolver-accepted mapping from automated lookup or fallback matching
 */
export type AcceptedMappingSource = "manual" | "upstream" | "auto";

/**
 * Reason an accepted mapping was accepted.
 *
 * This is intentionally separate from source.
 * Source answers "where did it come from?"
 * Reason answers "why was it accepted?"
 *
 * Examples:
 * - `source: 'upstream'` + `reason: 'exact-upstream'`
 * - `source: 'manual'` + `reason: 'manual-override'`
 * - `source: 'auto'` + `reason: 'fuzzy-match'`
 */
export type AcceptedMappingReason =
	| "exact-upstream"
	| "manual-override"
	| "exact-title-match"
	| "fuzzy-match";

/** Small accepted-evidence payload for explaining why one mapping is effective. */
export interface AcceptedMappingEvidence {
	source: AcceptedMappingSource;
	reason: AcceptedMappingReason;
	successfulTitle?: string;
}

/**
 * User-owned suppression kind for the effective row state.
 */
export type MappingSuppressionKind = "ignored-entry" | "rejected-candidate";
