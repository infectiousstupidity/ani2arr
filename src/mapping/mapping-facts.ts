/** Composes shared manual, upstream, and automatic fact layers. */

import type { AniListId } from "@/anilist/types";
import type { TmdbId, TvdbId } from "@/providers/schemas";
import type { Provider } from "@/providers/types";
import { hasAutomaticAttempt } from "./auto.store";
import {
	createExternalIdLayer,
	projectRadarrTarget,
	projectSonarrTarget,
	type AutomaticLayerRecord,
	type ExternalIdLayer,
	type ExternalIdLayers,
	type ManualLayerRecord,
} from "./external-id-facts";
import type { ManualFacts, ManualMapping } from "./manual.store";
import type { ArrUpstreamTarget, AutoResult, MappingResult } from "./types";

export type MappingSelectionRecords = {
	manual: ManualLayerRecord | null;
	upstream: ExternalIdLayer | null;
	automatic: AutomaticLayerRecord | null;
};

export type EffectiveMappingRecord = {
	anilistId: AniListId;
	provider: Provider;
	result: MappingResult;
};

export function selectMappingResult(
	provider: Provider,
	layers: MappingSelectionRecords,
): MappingResult {
	const decision = layers.manual?.decisions?.[provider];
	if (decision?.ignored) return { kind: "ignored" };

	const externalLayers: ExternalIdLayers = {
		...(layers.manual ? { manual: layers.manual } : {}),
		...(layers.upstream ? { upstream: layers.upstream } : {}),
		...(layers.automatic ? { automatic: layers.automatic } : {}),
	};
	return provider === "sonarr"
		? chooseSonarrResult(externalLayers, layers, decision?.rejectedTvdbShow)
		: chooseRadarrResult(externalLayers, layers, decision?.rejectedTmdbMovie);
}

export function hasMappingState(
	provider: Provider,
	layers: MappingSelectionRecords,
): boolean {
	if (layers.manual?.decisions?.[provider]) return true;
	const slot = provider === "sonarr" ? "tvdbShow" : "tmdbMovie";
	if (
		layers.manual?.facts[slot] !== undefined ||
		layers.manual?.conflicts?.[slot] !== undefined ||
		layers.automatic?.facts[slot] !== undefined ||
		layers.automatic?.conflicts?.[slot] !== undefined
	) {
		return true;
	}
	if (
		hasAutomaticAttempt(
			layers.automatic,
			provider === "sonarr" ? "sonarrTvdb" : "radarrTmdbMovie",
		)
	) {
		return true;
	}
	if (!layers.upstream) return false;
	return provider === "sonarr"
		? projectSonarrTarget({ upstream: layers.upstream }).kind !== "missing"
		: projectRadarrTarget({ upstream: layers.upstream }).kind !== "missing";
}

function chooseSonarrResult(
	externalLayers: ExternalIdLayers,
	layers: MappingSelectionRecords,
	rejectedProviderIds: number[] | undefined,
): MappingResult {
	const projection = projectSonarrTarget(externalLayers);
	if (projection.kind === "conflict") {
		return {
			kind: "ambiguous",
			targets: projection.candidates.map(({ id, seasons }) => ({
				provider: "sonarr",
				providerId: id,
				...(seasons?.length === 1 ? { season: seasons[0] } : {}),
			})),
		};
	}
	if (projection.kind === "missing") {
		return unmapped(
			hasAutomaticAttempt(layers.automatic, "sonarrTvdb"),
			rejectedProviderIds,
		);
	}
	return mappedResult({
		provider: "sonarr",
		source: projection.source,
		providerId: projection.target.tvdbId,
		layers,
		...(rejectedProviderIds ? { rejectedProviderIds } : {}),
		...(projection.target.season === undefined
			? {}
			: { season: projection.target.season }),
	});
}

function chooseRadarrResult(
	externalLayers: ExternalIdLayers,
	layers: MappingSelectionRecords,
	rejectedProviderIds: number[] | undefined,
): MappingResult {
	const projection = projectRadarrTarget(externalLayers);
	if (projection.kind === "conflict") {
		return {
			kind: "ambiguous",
			targets: projection.candidates.map((providerId) => ({
				provider: "radarr",
				providerId,
			})),
		};
	}
	if (projection.kind === "missing") {
		return unmapped(
			hasAutomaticAttempt(layers.automatic, "radarrTmdbMovie"),
			rejectedProviderIds,
		);
	}
	return mappedResult({
		provider: "radarr",
		source: projection.source,
		providerId: projection.target.tmdbId,
		layers,
		...(rejectedProviderIds ? { rejectedProviderIds } : {}),
	});
}

function mappedResult(input: {
	provider: Provider;
	source: "manual" | "upstream" | "automatic";
	providerId: number;
	layers: MappingSelectionRecords;
	rejectedProviderIds?: number[];
	season?: number;
}): MappingResult {
	const { provider, source, providerId, layers, rejectedProviderIds, season } =
		input;
	if (source === "automatic" && rejectedProviderIds?.includes(providerId)) {
		return unmapped(true, rejectedProviderIds);
	}
	if (
		source === "manual" &&
		manualMatchesUpstream(provider, providerId, season, layers)
	) {
		return {
			kind: "mapped",
			source: "upstream",
			providerId,
			...(season === undefined ? {} : { season }),
		};
	}
	const slot = provider === "sonarr" ? "tvdbShow" : "tmdbMovie";
	return {
		kind: "mapped",
		source: source === "automatic" ? "auto" : source,
		providerId,
		...(season === undefined ? {} : { season }),
		...(source === "automatic" &&
		layers.automatic?.slotMeta?.[slot]?.matchedTitle
			? { matchedTitle: layers.automatic.slotMeta[slot].matchedTitle }
			: {}),
	};
}

function manualMatchesUpstream(
	provider: Provider,
	providerId: number,
	season: number | undefined,
	layers: MappingSelectionRecords,
): boolean {
	if (!layers.upstream) return false;
	if (provider === "sonarr") {
		const projection = projectSonarrTarget({ upstream: layers.upstream });
		return (
			projection.kind === "target" &&
			projection.target.tvdbId === providerId &&
			projection.target.season === season
		);
	}
	const projection = projectRadarrTarget({ upstream: layers.upstream });
	return (
		projection.kind === "target" && projection.target.tmdbId === providerId
	);
}

/** Compatibility pure helper retained for focused projection tests. */
export function chooseMappingResult(input: {
	provider: Provider;
	manual: ManualFacts | null;
	upstream: ArrUpstreamTarget[];
	auto: AutoResult | null;
}): MappingResult {
	const layers = legacyLayers(
		input.provider,
		input.manual,
		input.upstream,
		input.auto,
	);
	return selectMappingResult(input.provider, layers);
}

function legacyLayers(
	provider: Provider,
	manual: ManualFacts | null,
	upstream: readonly ArrUpstreamTarget[],
	auto: AutoResult | null,
): MappingSelectionRecords {
	let manualLayer: ManualLayerRecord | null = null;
	if (manual) {
		const layer =
			"mapping" in manual
				? createArrLayer(provider, [manual.mapping])
				: { facts: {} };
		if ("ignored" in manual || manual.rejectedProviderIds?.length) {
			const decision = "ignored" in manual ? { ignored: true as const } : {};
			if (manual.rejectedProviderIds?.length) {
				if (provider === "sonarr") {
					Object.assign(decision, {
						rejectedTvdbShow: manual.rejectedProviderIds as TvdbId[],
					});
				} else {
					Object.assign(decision, {
						rejectedTmdbMovie: manual.rejectedProviderIds as TmdbId[],
					});
				}
			}
			manualLayer = { ...layer, decisions: { [provider]: decision } };
		} else {
			manualLayer = layer;
		}
	}
	let automatic: AutomaticLayerRecord | null = null;
	if (auto) {
		let layer: ExternalIdLayer = { facts: {} };
		if (auto.kind === "mapped") {
			layer = createArrLayer(provider, [auto]);
		} else if (auto.kind === "ambiguous") {
			layer = createArrLayer(provider, auto.targets);
		}
		automatic = {
			...layer,
			...(auto.kind === "mapped"
				? {
						slotMeta: {
							[provider === "sonarr" ? "tvdbShow" : "tmdbMovie"]: {
								expiresAt: Number.MAX_SAFE_INTEGER,
								...(auto.matchedTitle
									? { matchedTitle: auto.matchedTitle }
									: {}),
							},
						},
					}
				: {}),
			...(auto.kind === "unmapped"
				? {
						attempts: {
							[provider === "sonarr" ? "sonarrTvdb" : "radarrTmdbMovie"]: {
								expiresAt: Number.MAX_SAFE_INTEGER,
							},
						},
					}
				: {}),
		};
	}
	return {
		manual: manualLayer,
		upstream: upstream.length > 0 ? createArrLayer(provider, upstream) : null,
		automatic,
	};
}

function createArrLayer(
	provider: Provider,
	targets: ReadonlyArray<{
		providerId: number;
		season?: number;
		provider?: Provider;
	}>,
): ExternalIdLayer {
	const matching = targets.filter(
		(target) => target.provider === undefined || target.provider === provider,
	);
	return provider === "sonarr"
		? createExternalIdLayer({
				tvdbShow: matching.map((target) => ({
					id: target.providerId as TvdbId,
					...(target.season === undefined ? {} : { seasons: [target.season] }),
				})),
			})
		: createExternalIdLayer({
				tmdbMovie: matching.map((target) => target.providerId as TmdbId),
			});
}

export function matchesUpstream(
	provider: Provider,
	manual: ManualMapping,
	upstream: ArrUpstreamTarget,
): boolean {
	return (
		upstream.provider === provider &&
		upstream.providerId === manual.providerId &&
		(provider === "radarr" ||
			(upstream.provider === "sonarr" && upstream.season === manual.season))
	);
}

function unmapped(
	hadResolveAttempt: boolean,
	rejectedProviderIds: number[] | undefined,
): MappingResult {
	return {
		kind: "unmapped",
		hadResolveAttempt,
		...(rejectedProviderIds?.length ? { rejectedProviderIds } : {}),
	};
}
