/** Composes shared manual, upstream, and automatic fact layers. */

import type { AniListId } from "@/anilist/types";
import type { TmdbId, TvdbId } from "@/providers/schemas";
import type { Provider } from "@/providers/types";
import {
	hasAutomaticAttempt,
	listAniListAutomaticLayers,
	type AutomaticRecord,
} from "./auto.store";
import {
	createExternalIdLayer,
	projectRadarrTarget,
	projectSonarrTarget,
	type AutomaticLayerRecord,
	type ExternalIdLayer,
	type ExternalIdLayers,
	type ManualLayerRecord,
} from "./external-id-facts";
import {
	listAniListManualLayers,
	type ManualFacts,
	type ManualMapping,
	type ManualRecord,
} from "./manual.store";
import {
	listAniListUpstreamLayers,
	type UpstreamMappingFact,
} from "./upstream.store";
import type { ArrUpstreamTarget, AutoResult, MappingResult } from "./types";

export type MappingFactLayers = {
	manual: ManualLayerRecord | null;
	upstream: ExternalIdLayer | null;
	automatic: AutomaticLayerRecord | null;
};

export type EffectiveMappingRecord = {
	anilistId: AniListId;
	provider: Provider;
	result: MappingResult;
};

type UpstreamTargetSelector = (
	records: readonly UpstreamFactInput[],
) =>
	| Promise<ReadonlyMap<AniListId, readonly ArrUpstreamTarget[]>>
	| ReadonlyMap<AniListId, readonly ArrUpstreamTarget[]>;

type CollectEffectiveMappingRecordsOptions = {
	upstreamFacts?: readonly UpstreamFactInput[];
	selectUpstreamTargets?: UpstreamTargetSelector;
};

type UpstreamFactInput = Pick<
	UpstreamMappingFact,
	"anilistId" | "targets"
> &
	Partial<Pick<UpstreamMappingFact, "record">>;

export function chooseMappingResultFromLayers(
	provider: Provider,
	layers: MappingFactLayers,
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

export async function collectEffectiveMappingRecords(
	provider: Provider,
	options: CollectEffectiveMappingRecordsOptions = {},
): Promise<EffectiveMappingRecord[]> {
	const [manualRecords, upstreamRecords, automaticRecords] = await Promise.all([
		listAniListManualLayers(),
		options.upstreamFacts ?? listAniListUpstreamLayers(),
		listAniListAutomaticLayers(),
	]);
	const manual = recordsByAniListId(manualRecords);
	const automatic = recordsByAniListId(automaticRecords);
	const upstream = await upstreamLayersByAniListId(
		provider,
		upstreamRecords,
		options.selectUpstreamTargets,
	);
	const ids = new Set([...manual.keys(), ...upstream.keys(), ...automatic.keys()]);
	return [...ids]
		.toSorted((left, right) => left - right)
		.flatMap((anilistId) => {
		const layers = {
			manual: manual.get(anilistId) ?? null,
			upstream: upstream.get(anilistId) ?? null,
			automatic: automatic.get(anilistId) ?? null,
		};
		return hasProviderState(provider, layers)
			? [
					{
						anilistId,
						provider,
						result: chooseMappingResultFromLayers(provider, layers),
					},
				]
			: [];
		});
}

function hasProviderState(
	provider: Provider,
	layers: MappingFactLayers,
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

function recordsByAniListId<TRecord>(
	records: ReadonlyArray<
		(ManualRecord | AutomaticRecord) & { record: TRecord }
	>,
): Map<AniListId, TRecord> {
	return new Map(records.map((record) => [record.anilistId, record.record]));
}

async function upstreamLayersByAniListId(
	provider: Provider,
	records: readonly UpstreamFactInput[],
	selector: UpstreamTargetSelector | undefined,
): Promise<Map<AniListId, ExternalIdLayer>> {
	if (!selector) {
		return new Map(
			records.flatMap((record) =>
				record.record
					? [[record.anilistId, record.record] as const]
					: [],
			),
		);
	}
	const selected = await selector(records);
	return new Map(
		[...selected].flatMap(([anilistId, targets]) => {
			const layer = createArrLayer(provider, targets);
			return hasLayerData(layer) ? [[anilistId, layer] as const] : [];
		}),
	);
}

function chooseSonarrResult(
	externalLayers: ExternalIdLayers,
	layers: MappingFactLayers,
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
	layers: MappingFactLayers,
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
	layers: MappingFactLayers;
	rejectedProviderIds?: number[];
	season?: number;
}): MappingResult {
	const {
		provider,
		source,
		providerId,
		layers,
		rejectedProviderIds,
		season,
	} = input;
	if (source === "automatic" && rejectedProviderIds?.includes(providerId)) {
		return unmapped(true, rejectedProviderIds);
	}
	if (source === "manual" && manualMatchesUpstream(provider, providerId, season, layers)) {
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
		...(source === "automatic" && layers.automatic?.slotMeta?.[slot]?.matchedTitle
			? { matchedTitle: layers.automatic.slotMeta[slot].matchedTitle }
			: {}),
	};
}

function manualMatchesUpstream(
	provider: Provider,
	providerId: number,
	season: number | undefined,
	layers: MappingFactLayers,
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
	const layers = legacyLayers(input.provider, input.manual, input.upstream, input.auto);
	return chooseMappingResultFromLayers(input.provider, layers);
}

function legacyLayers(
	provider: Provider,
	manual: ManualFacts | null,
	upstream: readonly ArrUpstreamTarget[],
	auto: AutoResult | null,
): MappingFactLayers {
	const manualLayer: ManualLayerRecord | null = manual
		? {
				...(("mapping" in manual)
					? createArrLayer(provider, [manual.mapping])
					: { facts: {} }),
				...(("ignored" in manual || manual.rejectedProviderIds?.length)
					? {
							decisions: {
								[provider]: {
									...("ignored" in manual ? { ignored: true as const } : {}),
									...(manual.rejectedProviderIds?.length
										? (provider === "sonarr"
											? { rejectedTvdbShow: manual.rejectedProviderIds as TvdbId[] }
											: { rejectedTmdbMovie: manual.rejectedProviderIds as TmdbId[] })
										: {}),
								},
							},
						}
					: {}),
			}
		: null;
	let automatic: AutomaticLayerRecord | null = null;
	if (auto) {
		automatic = {
			...(auto.kind === "mapped"
				? createArrLayer(provider, [auto])
				: (auto.kind === "ambiguous"
					? createArrLayer(provider, auto.targets)
					: { facts: {} })),
			...(auto.kind === "mapped"
				? {
						slotMeta: {
							[provider === "sonarr" ? "tvdbShow" : "tmdbMovie"]: {
								expiresAt: Number.MAX_SAFE_INTEGER,
								...(auto.matchedTitle ? { matchedTitle: auto.matchedTitle } : {}),
							},
						},
					}
				: {}),
			...(auto.kind === "unmapped"
				? {
						attempts: {
							[provider === "sonarr" ? "sonarrTvdb" : "radarrTmdbMovie"]:
								{ expiresAt: Number.MAX_SAFE_INTEGER },
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
					...(target.season === undefined
						? {}
						: { seasons: [target.season] }),
				})),
			})
		: createExternalIdLayer({
				tmdbMovie: matching.map((target) => target.providerId as TmdbId),
			});
}

function hasLayerData(layer: ExternalIdLayer): boolean {
	return (
		Object.keys(layer.facts).length > 0 ||
		Object.keys(layer.conflicts ?? {}).length > 0
	);
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
