/** Persisted mapping records and one-time candidate normalization. */

import * as v from "valibot";
import { TmdbIdSchema, TvdbIdSchema, type TmdbId, type TvdbId } from "@/providers/schemas";
import { normalizeSeasonNumbers } from "./season-numbers";

export type MappingFacts = {
	tmdbMovie?: TmdbId;
	tmdbShow?: TmdbId;
	tvdbShow?: TvdbId;
};

type MappingConflicts = {
	tmdbMovie?: TmdbId[];
	tmdbShow?: Array<{ id: TmdbId; seasons?: number[] }>;
	tvdbShow?: Array<{ id: TvdbId; seasons?: number[] }>;
};

type MappingScopes = {
	tmdbShow?: { id: TmdbId; seasons: number[] };
	tvdbShow?: { id: TvdbId; seasons: number[] };
};

export type MappingRecord = {
	facts: MappingFacts;
	conflicts?: MappingConflicts;
	scopes?: MappingScopes;
};

export type MappingStore<TRecord> = {
	version: 1;
	records: Record<string, TRecord>;
};

export type ManualProviderDecision = {
	ignored?: true;
	rejectedTvdbShow?: TvdbId[];
	rejectedTmdbMovie?: TmdbId[];
};

export type ManualMappingRecord = MappingRecord & {
	decisions?: {
		sonarr?: ManualProviderDecision;
		radarr?: ManualProviderDecision;
	};
};

export type AutomaticSlotMeta = {
	expiresAt: number;
	matchedTitle?: string;
};

type AutomaticAttemptMeta = { expiresAt: number };

export type AutomaticAttemptLane =
	"sonarrTvdb" | "radarrTmdbMovie" | "seerrTmdbMovie" | "seerrTmdbShow";

export type AutomaticMappingRecord = MappingRecord & {
	slotMeta?: Partial<Record<keyof MappingFacts, AutomaticSlotMeta>>;
	attempts?: Partial<Record<AutomaticAttemptLane, AutomaticAttemptMeta>>;
};

export type UpstreamMappingRecord = MappingRecord & {
	linkedAniListId?: import("@/anilist/types").AniListId;
};

const seasonsSchema = v.array(v.pipe(v.number(), v.safeInteger(), v.minValue(0)));
const tmdbShowSchema = v.object({ id: TmdbIdSchema, seasons: v.optional(seasonsSchema) });
const tvdbShowSchema = v.object({ id: TvdbIdSchema, seasons: v.optional(seasonsSchema) });
const mappingRecordEntries = {
	facts: v.object({
		tmdbMovie: v.optional(TmdbIdSchema),
		tmdbShow: v.optional(TmdbIdSchema),
		tvdbShow: v.optional(TvdbIdSchema),
	}),
	conflicts: v.optional(v.object({
		tmdbMovie: v.optional(v.array(TmdbIdSchema)),
		tmdbShow: v.optional(v.array(tmdbShowSchema)),
		tvdbShow: v.optional(v.array(tvdbShowSchema)),
	})),
	scopes: v.optional(v.object({
		tmdbShow: v.optional(v.object({ id: TmdbIdSchema, seasons: seasonsSchema })),
		tvdbShow: v.optional(v.object({ id: TvdbIdSchema, seasons: seasonsSchema })),
	})),
};
const expirySchema = v.object({ expiresAt: v.pipe(v.number(), v.finite()) });
const slotMetaSchema = v.object({
	expiresAt: v.pipe(v.number(), v.finite()),
	matchedTitle: v.optional(v.string()),
});
const automaticRecordSchema = v.object({
	...mappingRecordEntries,
	slotMeta: v.optional(v.object({
		tmdbMovie: v.optional(slotMetaSchema),
		tmdbShow: v.optional(slotMetaSchema),
		tvdbShow: v.optional(slotMetaSchema),
	})),
	attempts: v.optional(v.object({
		sonarrTvdb: v.optional(expirySchema),
		radarrTmdbMovie: v.optional(expirySchema),
		seerrTmdbMovie: v.optional(expirySchema),
		seerrTmdbShow: v.optional(expirySchema),
	})),
});
const upstreamRecordSchema = v.object({
	...mappingRecordEntries,
	linkedAniListId: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
});

export function isAutomaticMappingRecord(value: unknown): value is AutomaticMappingRecord {
	return v.is(automaticRecordSchema, value);
}

export function isUpstreamMappingRecord(value: unknown): value is UpstreamMappingRecord {
	return v.is(upstreamRecordSchema, value);
}

type ShowCandidate<TId extends number> = {
	id: TId;
	seasons?: readonly number[];
};

export type MappingCandidates = {
	tmdbMovie?: readonly TmdbId[];
	tmdbShow?: readonly ShowCandidate<TmdbId>[];
	tvdbShow?: readonly ShowCandidate<TvdbId>[];
};

export function createMappingRecord(
	candidates: MappingCandidates,
): MappingRecord {
	const movie = selectMovieCandidates(candidates.tmdbMovie ?? []);
	const tmdbShow = selectShowCandidates(candidates.tmdbShow ?? []);
	const tvdbShow = selectShowCandidates(candidates.tvdbShow ?? []);
	const facts: MappingFacts = {
		...(movie.fact === undefined ? {} : { tmdbMovie: movie.fact }),
		...(tmdbShow.fact === undefined ? {} : { tmdbShow: tmdbShow.fact }),
		...(tvdbShow.fact === undefined ? {} : { tvdbShow: tvdbShow.fact }),
	};
	const conflicts: MappingConflicts = {
		...(movie.conflict === undefined ? {} : { tmdbMovie: movie.conflict }),
		...(tmdbShow.conflict === undefined ? {} : { tmdbShow: tmdbShow.conflict }),
		...(tvdbShow.conflict === undefined ? {} : { tvdbShow: tvdbShow.conflict }),
	};
	const scopes: MappingScopes = {
		...(tmdbShow.scope === undefined ? {} : { tmdbShow: tmdbShow.scope }),
		...(tvdbShow.scope === undefined ? {} : { tvdbShow: tvdbShow.scope }),
	};
	return {
		facts,
		...(Object.keys(conflicts).length === 0 ? {} : { conflicts }),
		...(Object.keys(scopes).length === 0 ? {} : { scopes }),
	};
}

function selectMovieCandidates(ids: readonly TmdbId[]): {
	fact?: TmdbId;
	conflict?: TmdbId[];
} {
	const normalized = [...new Set(ids)].toSorted((left, right) => left - right);
	const selected = normalized[0];
	if (selected !== undefined && normalized.length === 1)
		return { fact: selected };
	return normalized.length > 1 ? { conflict: normalized } : {};
}

function selectShowCandidates<TId extends number>(
	candidates: readonly ShowCandidate<TId>[],
): {
	fact?: TId;
	conflict?: Array<{ id: TId; seasons?: number[] }>;
	scope?: { id: TId; seasons: number[] };
} {
	const seasonsById = new Map<TId, number[]>();
	for (const candidate of candidates) {
		seasonsById.set(
			candidate.id,
			normalizeSeasonNumbers([
				...(seasonsById.get(candidate.id) ?? []),
				...(candidate.seasons ?? []),
			]),
		);
	}
	const grouped = [...seasonsById]
		.toSorted(([left], [right]) => left - right)
		.map(([id, seasons]) => ({
			id,
			...(seasons.length === 0 ? {} : { seasons }),
		}));
	if (grouped.length !== 1)
		return grouped.length > 1 ? { conflict: grouped } : {};
	const selected = grouped[0]!;
	return {
		fact: selected.id,
		...(selected.seasons === undefined
			? {}
			: { scope: { id: selected.id, seasons: selected.seasons } }),
	};
}
