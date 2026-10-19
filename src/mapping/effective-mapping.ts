/** Provider-specific selection over normalized mapping records. */

import type { AniListId } from "@/anilist/types";
import type { TmdbId, TvdbId } from "@/providers/schemas";
import type { Provider } from "@/providers/types";
import type {
	AutomaticAttemptLane,
	AutomaticMappingRecord,
	ManualMappingRecord,
	MappingRecord,
	UpstreamMappingRecord,
} from "./mapping-record";
import { normalizeSeasonNumbers } from "./season-numbers";
import type { MappingResult, SeerrTargetWithEvidence } from "./types";

export type MappingSelectionRecords = {
	manual: ManualMappingRecord | null;
	direct: UpstreamMappingRecord | MappingRecord | null;
	canonical: UpstreamMappingRecord | MappingRecord | null;
	automatic: AutomaticMappingRecord | null;
};

export type EffectiveMappingRecord = {
	anilistId: AniListId;
	provider: Provider;
	result: MappingResult;
};

type Origin = "manual" | "upstream" | "automatic";
type OrderedRecord = { origin: Origin; record: MappingRecord };
type Selection<TFact, TConflict> =
	| { kind: "missing" }
	| {
			kind: "conflict";
			candidates: NonNullable<TConflict>;
			record: MappingRecord;
	  }
	| { kind: "selected"; value: TFact; origin: Origin; record: MappingRecord };

export type SeerrMappingOutcome =
	| { kind: "missing" }
	| { kind: "conflict" }
	| { kind: "mapped"; source: Origin; target: SeerrTargetWithEvidence };

// Selector branching mirrors the explicit provider precedence/result states.

export function selectArrMapping(
	provider: Provider,
	records: MappingSelectionRecords,
): MappingResult {
	const decision = records.manual?.decisions?.[provider];
	if (decision?.ignored) return { kind: "ignored" };
	if (provider === "radarr") {
		const selected = selectValue(records, "tmdbMovie");
		if (selected.kind === "conflict") {
			return {
				kind: "ambiguous",
				targets: selected.candidates.map((providerId) => ({
					provider: "radarr",
					providerId,
				})),
			};
		}
		const rejected = decision?.rejectedTmdbMovie;
		if (selected.kind === "missing") {
			return unmapped(
				hasAttempt(records.automatic, "radarrTmdbMovie"),
				rejected,
			);
		}
		if (selected.origin === "automatic" && rejected?.includes(selected.value)) {
			return unmapped(true, rejected);
		}
		return mapped(records, selected, "radarr", selected.value);
	}

	const selected = selectValue(records, "tvdbShow");
	const rejected = decision?.rejectedTvdbShow;
	if (selected.kind === "conflict") {
		return {
			kind: "ambiguous",
			targets: selected.candidates.map(({ id, seasons }) => ({
				provider: "sonarr",
				providerId: id,
				...(seasons?.length === 1 ? { season: seasons[0] } : {}),
			})),
		};
	}
	if (selected.kind === "missing") {
		return unmapped(hasAttempt(records.automatic, "sonarrTvdb"), rejected);
	}
	if (selected.origin === "automatic" && rejected?.includes(selected.value)) {
		return unmapped(true, rejected);
	}
	const seasons = findTvdbSeasons(records, selected.value);
	return mapped(records, selected, "sonarr", {
		providerId: selected.value,
		...(seasons.length === 1 ? { season: seasons[0] } : {}),
	});
}

// Selector branching mirrors the explicit movie/TV evidence states.

export function selectSeerrMapping(
	mediaType: "movie" | "tv",
	records: MappingSelectionRecords,
): SeerrMappingOutcome {
	if (mediaType === "movie") {
		const movie = selectValue(records, "tmdbMovie");
		if (movie.kind === "conflict") return { kind: "conflict" };
		return movie.kind === "missing"
			? { kind: "missing" }
			: {
					kind: "mapped",
					source: movie.origin,
					target: { mediaType: "movie", tmdbId: movie.value },
				};
	}

	const tmdb = selectValue(records, "tmdbShow");
	if (tmdb.kind === "conflict") return { kind: "conflict" };
	if (tmdb.kind === "missing") return { kind: "missing" };
	const seasons = findTmdbSeasons(records, tmdb.value);
	return {
		kind: "mapped",
		source: tmdb.origin,
		target: {
			mediaType: "tv",
			tmdbId: tmdb.value,
			...(seasons.length === 0 ? {} : { seasons }),
		},
	};
}

export function findTvdbSeasons(
	records: MappingSelectionRecords,
	selectedTvdbId: TvdbId,
): number[] {
	for (const { record } of orderedRecords(records)) {
		const seasons = normalizeSeasonNumbers([
			...(record.scopes?.tvdbShow?.id === selectedTvdbId
				? record.scopes.tvdbShow.seasons
				: []),
			...(record.conflicts?.tvdbShow?.find(({ id }) => id === selectedTvdbId)
				?.seasons ?? []),
		]);
		if (seasons.length > 0) return seasons;
	}
	return [];
}

export function findTmdbSeasons(
	records: MappingSelectionRecords,
	selectedTmdbId: TmdbId,
): number[] {
	for (const { record } of orderedRecords(records)) {
		const seasons = normalizeSeasonNumbers([
			...(record.scopes?.tmdbShow?.id === selectedTmdbId
				? record.scopes.tmdbShow.seasons
				: []),
			...(record.conflicts?.tmdbShow?.find(({ id }) => id === selectedTmdbId)
				?.seasons ?? []),
		]);
		if (seasons.length > 0) return seasons;
	}
	return [];
}

function orderedRecords(records: MappingSelectionRecords): OrderedRecord[] {
	return [
		...(records.manual
			? [{ origin: "manual" as const, record: records.manual }]
			: []),
		...(records.direct
			? [{ origin: "upstream" as const, record: records.direct }]
			: []),
		...(records.canonical
			? [{ origin: "upstream" as const, record: records.canonical }]
			: []),
		...(records.automatic
			? [{ origin: "automatic" as const, record: records.automatic }]
			: []),
	];
}

function selectValue<K extends keyof MappingRecord["facts"]>(
	records: MappingSelectionRecords,
	slot: K,
): Selection<
	NonNullable<MappingRecord["facts"][K]>,
	NonNullable<MappingRecord["conflicts"]>[K]
> {
	for (const { origin, record } of orderedRecords(records)) {
		const conflict = record.conflicts?.[slot];
		if (conflict !== undefined) {
			return {
				kind: "conflict",
				candidates: conflict as NonNullable<
					NonNullable<MappingRecord["conflicts"]>[K]
				>,
				record,
			};
		}
		const value = record.facts[slot];
		if (value !== undefined) {
			return {
				kind: "selected",
				value: value as NonNullable<MappingRecord["facts"][K]>,
				origin,
				record,
			};
		}
	}
	return { kind: "missing" };
}

function mapped(
	records: MappingSelectionRecords,
	selected: { origin: Origin; record: MappingRecord },
	provider: Provider,
	input: { providerId: number; season?: number } | number,
): MappingResult {
	const { providerId, season } =
		typeof input === "number"
			? { providerId: input, season: undefined }
			: input;
	const slot = provider === "sonarr" ? "tvdbShow" : "tmdbMovie";
	return {
		kind: "mapped",
		source: selected.origin === "automatic" ? "auto" : selected.origin,
		providerId,
		...(season === undefined ? {} : { season }),
		...(selected.origin === "automatic" &&
		records.automatic?.slotMeta?.[slot]?.matchedTitle
			? { matchedTitle: records.automatic.slotMeta[slot].matchedTitle }
			: {}),
	};
}

function hasAttempt(
	record: AutomaticMappingRecord | null,
	lane: AutomaticAttemptLane,
): boolean {
	return (record?.attempts?.[lane]?.expiresAt ?? 0) > Date.now();
}

function unmapped(
	hadResolveAttempt: boolean,
	rejectedProviderIds?: number[],
): MappingResult {
	return {
		kind: "unmapped",
		hadResolveAttempt,
		...(rejectedProviderIds?.length ? { rejectedProviderIds } : {}),
	};
}
