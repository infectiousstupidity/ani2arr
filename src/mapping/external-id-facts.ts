/** Selects shared external-ID facts and projects Arr targets. */

import type { TmdbId, TvdbId } from "@/providers/schemas";
import { normalizeSeasonNumbers } from "./season-numbers";

export type ExternalIdFacts = {
	tmdbMovie?: TmdbId;
	tmdbShow?: TmdbId;
	tvdbShow?: TvdbId;
};

export type ExternalIdConflicts = {
	tmdbMovie?: TmdbId[];
	tmdbShow?: Array<{ id: TmdbId; seasons?: number[] }>;
	tvdbShow?: Array<{ id: TvdbId; seasons?: number[] }>;
};

export type ExternalIdScopes = {
	tmdbShow?: { id: TmdbId; seasons: number[] };
	tvdbShow?: { id: TvdbId; seasons: number[] };
};

export type TvShowPairEvidence = {
	tmdbShow: TmdbId;
	tvdbShow: TvdbId;
	tmdbSeasons?: number[];
	tvdbSeasons?: number[];
};

export type ExternalIdLayer = {
	facts: ExternalIdFacts;
	conflicts?: ExternalIdConflicts;
	scopes?: ExternalIdScopes;
	tvShowPairs?: TvShowPairEvidence[];
};

export type LayerStore<TRecord> = {
	version: 1;
	records: Record<string, TRecord>;
};

export type ManualProviderDecision = {
	ignored?: true;
	rejectedTvdbShow?: TvdbId[];
	rejectedTmdbMovie?: TmdbId[];
};

export type ManualLayerRecord = ExternalIdLayer & {
	decisions?: {
		sonarr?: ManualProviderDecision;
		radarr?: ManualProviderDecision;
	};
};

export type AutomaticSlotMeta = {
	expiresAt: number;
	matchedTitle?: string;
};

export type AutomaticAttemptMeta = {
	expiresAt: number;
};

export type AutomaticAttemptLane =
	| "sonarrTvdb"
	| "radarrTmdbMovie"
	| "seerrTmdbMovie"
	| "seerrTmdbShow";

export type AutomaticLayerRecord = ExternalIdLayer & {
	slotMeta?: Partial<Record<keyof ExternalIdFacts, AutomaticSlotMeta>>;
	attempts?: Partial<Record<AutomaticAttemptLane, AutomaticAttemptMeta>>;
};

export type ExternalIdSource = "manual" | "upstream" | "automatic";

export type ExternalIdLayers = Partial<
	Record<ExternalIdSource, ExternalIdLayer | null>
>;

type ShowCandidate<TId extends number> = {
	id: TId;
	seasons?: readonly number[];
};

export type ExternalIdCandidates = {
	tmdbMovie?: readonly TmdbId[];
	tmdbShow?: readonly ShowCandidate<TmdbId>[];
	tvdbShow?: readonly ShowCandidate<TvdbId>[];
	tvShowPairs?: readonly TvShowPairEvidence[];
};

export type EffectiveExternalIdFacts = {
	facts: ExternalIdFacts;
	sources: Partial<Record<keyof ExternalIdFacts, ExternalIdSource>>;
	conflicts?: ExternalIdConflicts;
};

export type ExternalIdProjection<TTarget, TConflict> =
	| { kind: "missing" }
	| { kind: "conflict"; candidates: TConflict }
	| { kind: "target"; source: ExternalIdSource; target: TTarget };

export type SonarrFactTarget = {
	tvdbId: TvdbId;
	season?: number;
};

export type RadarrFactTarget = {
	tmdbId: TmdbId;
};

export type TvShowEvidence = {
	tvdbShow?: TvdbId;
	tmdbSeasons?: number[];
	tvdbSeasons?: number[];
	seasons?: number[];
};

const SOURCE_PRECEDENCE: readonly ExternalIdSource[] = [
	"manual",
	"upstream",
	"automatic",
];

export function createExternalIdLayer(
	candidates: ExternalIdCandidates,
): ExternalIdLayer {
	const movie = selectMovieCandidates(candidates.tmdbMovie ?? []);
	const tmdbShow = selectShowCandidates(candidates.tmdbShow ?? []);
	const tvdbShow = selectShowCandidates(candidates.tvdbShow ?? []);
	const facts: ExternalIdFacts = {
		...(movie.fact === undefined ? {} : { tmdbMovie: movie.fact }),
		...(tmdbShow.fact === undefined ? {} : { tmdbShow: tmdbShow.fact }),
		...(tvdbShow.fact === undefined ? {} : { tvdbShow: tvdbShow.fact }),
	};
	const conflicts: ExternalIdConflicts = {
		...(movie.conflict === undefined
			? {}
			: { tmdbMovie: movie.conflict }),
		...(tmdbShow.conflict === undefined
			? {}
			: { tmdbShow: tmdbShow.conflict }),
		...(tvdbShow.conflict === undefined
			? {}
			: { tvdbShow: tvdbShow.conflict }),
	};
	const scopes: ExternalIdScopes = {
		...(tmdbShow.scope === undefined
			? {}
			: { tmdbShow: tmdbShow.scope }),
		...(tvdbShow.scope === undefined
			? {}
			: { tvdbShow: tvdbShow.scope }),
	};
	const tvShowPairs = normalizeTvShowPairs(candidates.tvShowPairs ?? []);

	return {
		facts,
		...(Object.keys(conflicts).length === 0 ? {} : { conflicts }),
		...(Object.keys(scopes).length === 0 ? {} : { scopes }),
		...(tvShowPairs.length === 0 ? {} : { tvShowPairs }),
	};
}

export function normalizeExternalIdLayer(
	layer: ExternalIdLayer,
): ExternalIdLayer {
	return createExternalIdLayer({
		tmdbMovie: [
			...(layer.facts.tmdbMovie === undefined
				? []
				: [layer.facts.tmdbMovie]),
			...(layer.conflicts?.tmdbMovie ?? []),
		],
		tmdbShow: showCandidatesFromLayer(
			layer.facts.tmdbShow,
			layer.scopes?.tmdbShow,
			layer.conflicts?.tmdbShow,
		),
		tvdbShow: showCandidatesFromLayer(
			layer.facts.tvdbShow,
			layer.scopes?.tvdbShow,
			layer.conflicts?.tvdbShow,
		),
		...(layer.tvShowPairs === undefined
			? {}
			: { tvShowPairs: layer.tvShowPairs }),
	});
}

export function selectExternalIdFacts(
	layers: ExternalIdLayers,
): EffectiveExternalIdFacts {
	const normalizedLayers = orderedLayers(layers);
	const facts: ExternalIdFacts = {};
	const sources: EffectiveExternalIdFacts["sources"] = {};
	const conflicts: ExternalIdConflicts = {};
	const tmdbMovie = selectSlot(
		normalizedLayers,
		(layer) => layer.facts.tmdbMovie,
		(layer) => layer.conflicts?.tmdbMovie,
	);
	if (tmdbMovie?.kind === "fact") {
		facts.tmdbMovie = tmdbMovie.value;
		sources.tmdbMovie = tmdbMovie.source;
	} else if (tmdbMovie?.kind === "conflict") {
		conflicts.tmdbMovie = tmdbMovie.value;
	}

	const tmdbShow = selectSlot(
		normalizedLayers,
		(layer) => layer.facts.tmdbShow,
		(layer) => layer.conflicts?.tmdbShow,
	);
	if (tmdbShow?.kind === "fact") {
		facts.tmdbShow = tmdbShow.value;
		sources.tmdbShow = tmdbShow.source;
	} else if (tmdbShow?.kind === "conflict") {
		conflicts.tmdbShow = tmdbShow.value;
	}

	const tvdbShow = selectSlot(
		normalizedLayers,
		(layer) => layer.facts.tvdbShow,
		(layer) => layer.conflicts?.tvdbShow,
	);
	if (tvdbShow?.kind === "fact") {
		facts.tvdbShow = tvdbShow.value;
		sources.tvdbShow = tvdbShow.source;
	} else if (tvdbShow?.kind === "conflict") {
		conflicts.tvdbShow = tvdbShow.value;
	}

	return {
		facts,
		sources,
		...(Object.keys(conflicts).length === 0 ? {} : { conflicts }),
	};
}

export function projectSonarrTarget(
	layers: ExternalIdLayers,
): ExternalIdProjection<
	SonarrFactTarget,
	NonNullable<ExternalIdConflicts["tvdbShow"]>
> {
	const selected = selectExternalIdFacts(layers);
	const conflict = selected.conflicts?.tvdbShow;
	if (conflict) return { kind: "conflict", candidates: conflict };

	const tvdbId = selected.facts.tvdbShow;
	const source = selected.sources.tvdbShow;
	if (tvdbId === undefined || source === undefined) return { kind: "missing" };

	const seasons = selectShowScope(layers, "tvdbShow", tvdbId);
	return {
		kind: "target",
		source,
		target: {
			tvdbId,
			...(seasons?.length === 1 ? { season: seasons[0] } : {}),
		},
	};
}

export function projectRadarrTarget(
	layers: ExternalIdLayers,
): ExternalIdProjection<RadarrFactTarget, TmdbId[]> {
	const selected = selectExternalIdFacts(layers);
	const conflict = selected.conflicts?.tmdbMovie;
	if (conflict) return { kind: "conflict", candidates: conflict };

	const tmdbId = selected.facts.tmdbMovie;
	const source = selected.sources.tmdbMovie;
	return tmdbId === undefined || source === undefined
		? { kind: "missing" }
		: { kind: "target", source, target: { tmdbId } };
}

export function selectTvShowEvidence(
	layers: ExternalIdLayers,
): TvShowEvidence {
	const selected = selectExternalIdFacts(layers);
	const tmdbShow = selected.facts.tmdbShow;
	if (tmdbShow === undefined) return {};

	const normalizedLayers = orderedLayers(layers);
	const pair = selectCompatiblePair(
		normalizedLayers,
		tmdbShow,
		selected.facts.tvdbShow,
	);
	const tvdbShow = pair?.tvdbShow;
	const scope = selectTvShowScope(normalizedLayers, tmdbShow, pair);

	return {
		...(tvdbShow === undefined ? {} : { tvdbShow }),
		...scope,
	};
}

function selectTvShowScope(
	layers: ReturnType<typeof orderedLayers>,
	tmdbShow: TmdbId,
	pair: TvShowPairEvidence | undefined,
): Omit<TvShowEvidence, "tvdbShow"> {
	const tvdbShow = pair?.tvdbShow;
	for (const { layer } of layers) {
		const tvdbScope = layer.scopes?.tvdbShow;
		const layerPair = pair
			? layer.tvShowPairs?.find(
					(candidate) =>
						candidate.tmdbShow === pair.tmdbShow &&
						candidate.tvdbShow === pair.tvdbShow,
				)
			: undefined;
		const tmdbSeasons = normalizeSeasonNumbers([
			...(layer.scopes?.tmdbShow?.id === tmdbShow
				? layer.scopes.tmdbShow.seasons
				: []),
			...(layerPair?.tmdbSeasons ?? []),
		]);
		const tvdbSeasons = normalizeSeasonNumbers([
			...(layerPair && tvdbScope !== undefined && tvdbScope.id === tvdbShow
				? tvdbScope.seasons
				: []),
			...(layerPair?.tvdbSeasons ?? []),
		]);
		const seasons = normalizeSeasonNumbers([...tmdbSeasons, ...tvdbSeasons]);

		if (seasons.length > 0) {
			return {
				...(tmdbSeasons.length === 0 ? {} : { tmdbSeasons }),
				...(tvdbSeasons.length === 0 ? {} : { tvdbSeasons }),
				seasons,
			};
		}
	}

	return {};
}

function selectMovieCandidates(ids: readonly TmdbId[]): {
	fact?: TmdbId;
	conflict?: TmdbId[];
} {
	const normalized = [...new Set(ids)].toSorted((left, right) => left - right);
	const selected = normalized[0];
	if (selected !== undefined && normalized.length === 1) {
		return { fact: selected };
	}
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
	const unscopedIds = new Set<TId>();
	for (const candidate of candidates) {
		if (candidate.seasons === undefined || candidate.seasons.length === 0) {
			unscopedIds.add(candidate.id);
		}
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
			...(seasons.length === 0 || unscopedIds.has(id) ? {} : { seasons }),
		}));
	if (grouped.length !== 1) {
		return grouped.length > 1 ? { conflict: grouped } : {};
	}

	const selected = grouped[0];
	if (!selected) return {};
	return {
		fact: selected.id,
		...(selected.seasons === undefined
			? {}
			: { scope: { id: selected.id, seasons: selected.seasons } }),
	};
}

function showCandidatesFromLayer<TId extends number>(
	fact: TId | undefined,
	scope: { id: TId; seasons: number[] } | undefined,
	conflicts: readonly ShowCandidate<TId>[] | undefined,
): ShowCandidate<TId>[] {
	return [
		...(fact === undefined
			? []
			: [
					{
						id: fact,
						...(scope?.id === fact ? { seasons: scope.seasons } : {}),
					},
				]),
		...(conflicts ?? []),
	];
}

function normalizeTvShowPairs(
	pairs: readonly TvShowPairEvidence[],
): TvShowPairEvidence[] {
	const pairsByIds = new Map<string, TvShowPairEvidence>();

	for (const pair of pairs) {
		const key = `${pair.tmdbShow}:${pair.tvdbShow}`;
		const previous = pairsByIds.get(key);
		const tmdbSeasons = normalizeSeasonNumbers([
			...(previous?.tmdbSeasons ?? []),
			...(pair.tmdbSeasons ?? []),
		]);
		const tvdbSeasons = normalizeSeasonNumbers([
			...(previous?.tvdbSeasons ?? []),
			...(pair.tvdbSeasons ?? []),
		]);
		pairsByIds.set(key, {
			tmdbShow: pair.tmdbShow,
			tvdbShow: pair.tvdbShow,
			...(tmdbSeasons.length === 0 ? {} : { tmdbSeasons }),
			...(tvdbSeasons.length === 0 ? {} : { tvdbSeasons }),
		});
	}

	return [...pairsByIds.values()].toSorted(
		(left, right) =>
			left.tmdbShow - right.tmdbShow || left.tvdbShow - right.tvdbShow,
	);
}

function orderedLayers(layers: ExternalIdLayers): Array<{
	source: ExternalIdSource;
	layer: ExternalIdLayer;
}> {
	return SOURCE_PRECEDENCE.flatMap((source) => {
		const layer = layers[source];
		return layer ? [{ source, layer: normalizeExternalIdLayer(layer) }] : [];
	});
}

function selectSlot<TFact, TConflict>(
	layers: ReturnType<typeof orderedLayers>,
	getFact: (layer: ExternalIdLayer) => TFact | undefined,
	getConflict: (layer: ExternalIdLayer) => TConflict | undefined,
):
	| { kind: "fact"; value: TFact; source: ExternalIdSource }
	| { kind: "conflict"; value: TConflict }
	| undefined {
	for (const { source, layer } of layers) {
		const conflict = getConflict(layer);
		if (conflict !== undefined) {
			return { kind: "conflict", value: conflict };
		}

		const fact = getFact(layer);
		if (fact !== undefined) {
			return { kind: "fact", value: fact, source };
		}
	}
	return undefined;
}

function selectShowScope<TId extends TmdbId | TvdbId>(
	layers: ExternalIdLayers,
	slot: keyof ExternalIdScopes,
	id: TId,
): number[] | undefined {
	for (const { layer } of orderedLayers(layers)) {
		const scope = layer.scopes?.[slot];
		if (scope?.id === id) return scope.seasons;
	}
	return undefined;
}

function selectCompatiblePair(
	layers: ReturnType<typeof orderedLayers>,
	tmdbShow: TmdbId,
	effectiveTvdbShow: TvdbId | undefined,
): TvShowPairEvidence | undefined {
	for (const { layer } of layers) {
		const compatible = (layer.tvShowPairs ?? []).filter(
			(pair) =>
				pair.tmdbShow === tmdbShow &&
				(effectiveTvdbShow === undefined ||
					pair.tvdbShow === effectiveTvdbShow),
		);
		if (compatible.length === 0) {
			if (layer.conflicts?.tvdbShow) return undefined;
			continue;
		}

		const tvdbIds = new Set(compatible.map((pair) => pair.tvdbShow));
		return tvdbIds.size === 1 ? compatible[0] : undefined;
	}
	return undefined;
}
