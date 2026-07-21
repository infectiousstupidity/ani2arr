/** Collects active mapping facts from manual, upstream, and auto records. */
// src/mapping/mapping-facts.ts

import type { AniListId } from "@/anilist/types";
import type { Provider } from "@/providers/types";
import { listAniListAutoResults } from "./auto.store";
import {
	listAniListManualFacts,
	type ManualFacts,
	type ManualMapping,
} from "./manual.store";
import {
	listAniListUpstreamMappings,
	type UpstreamMappingFact,
} from "./upstream.store";
import type { AutoResult, MappingResult, UpstreamTarget } from "./types";

type MappingCandidates = {
	provider: Provider;
	manual: ManualFacts | null;
	upstream: UpstreamTarget[];
	auto: AutoResult | null;
};

export type EffectiveMappingRecord = {
	anilistId: AniListId;
	provider: Provider;
	result: MappingResult;
};

type UpstreamTargetSelector = (
	records: readonly UpstreamMappingFact[],
) =>
	| Promise<ReadonlyMap<AniListId, readonly UpstreamTarget[]>>
	| ReadonlyMap<AniListId, readonly UpstreamTarget[]>;

type CollectEffectiveMappingRecordsOptions = {
	upstreamFacts?: readonly UpstreamMappingFact[];
	selectUpstreamTargets?: UpstreamTargetSelector;
};

export async function collectEffectiveMappingRecords(
	provider: Provider,
	options: CollectEffectiveMappingRecordsOptions = {},
): Promise<EffectiveMappingRecord[]> {
	const [manualRecords, upstreamRecords, autoRecords] = await Promise.all([
		listAniListManualFacts(provider),
		options.upstreamFacts ?? listAniListUpstreamMappings(),
		listAniListAutoResults(provider),
	]);

	const manualByAniListId = new Map(
		manualRecords.map((record) => [record.anilistId, record.facts]),
	);
	const autoByAniListId = new Map(
		autoRecords.map((record) => [record.anilistId, record.result]),
	);
	const upstreamByAniListId = await getUpstreamTargetsByAniListId(
		provider,
		upstreamRecords,
		options,
	);
	const anilistIds = new Set([
		...manualByAniListId.keys(),
		...upstreamByAniListId.keys(),
		...autoByAniListId.keys(),
	]);

	return [...anilistIds].map((anilistId): EffectiveMappingRecord => ({
		anilistId,
		provider,
		result: chooseMappingResult({
			provider,
			manual: manualByAniListId.get(anilistId) ?? null,
			upstream: [...(upstreamByAniListId.get(anilistId) ?? [])],
			auto: autoByAniListId.get(anilistId) ?? null,
		}),
	}));
}

async function getUpstreamTargetsByAniListId(
	provider: Provider,
	records: readonly UpstreamMappingFact[],
	options: CollectEffectiveMappingRecordsOptions,
): Promise<ReadonlyMap<AniListId, readonly UpstreamTarget[]>> {
	if (options.selectUpstreamTargets) {
		return options.selectUpstreamTargets(records);
	}

	const upstreamByAniListId = new Map<AniListId, UpstreamTarget[]>();

	for (const record of records) {
		const targets = record.targets.filter((target) => target.provider === provider);

		if (targets.length > 0) {
			upstreamByAniListId.set(record.anilistId, targets);
		}
	}

	return upstreamByAniListId;
}

export function chooseMappingResult(input: MappingCandidates): MappingResult {
	const { provider, manual, upstream, auto } = input;

	if (manual && "ignored" in manual) {
		return { kind: "ignored" };
	}

	const upstreamTarget = getSingleUpstreamTarget(upstream);
	const rejectedProviderIds = manual?.rejectedProviderIds;

	if (manual && "mapping" in manual) {
		if (
			upstreamTarget &&
			matchesUpstream(provider, manual.mapping, upstreamTarget)
		) {
			return mappedFromUpstream(upstreamTarget);
		}

		return {
			kind: "mapped",
			source: "manual",
			providerId: manual.mapping.providerId,
			...(manual.mapping.season === undefined
				? {}
				: { season: manual.mapping.season }),
		};
	}

	if (upstreamTarget) {
		return mappedFromUpstream(upstreamTarget);
	}

	if (upstream.length > 1) {
		return ambiguous(upstream);
	}

	const autoMapping = chooseAutoMapping(auto, rejectedProviderIds);
	if (autoMapping) return autoMapping;

	if (auto?.kind === "ambiguous") {
		return ambiguous(auto.targets);
	}

	return unmapped(auto !== null, rejectedProviderIds);
}

function getSingleUpstreamTarget(
	upstream: UpstreamTarget[],
): UpstreamTarget | undefined {
	return upstream.length === 1 ? upstream[0] : undefined;
}

function mappedFromUpstream(target: UpstreamTarget): MappingResult {
	return {
		kind: "mapped",
		source: "upstream",
		providerId: target.providerId,
		...(target.provider === "sonarr" && target.season !== undefined
			? { season: target.season }
			: {}),
	};
}

function chooseAutoMapping(
	auto: AutoResult | null,
	rejectedProviderIds: number[] | undefined,
): MappingResult | null {
	if (auto?.kind !== "mapped") return null;

	const autoIsRejected = rejectedProviderIds?.includes(auto.providerId) === true;
	return autoIsRejected ? unmapped(true, rejectedProviderIds) : mappedFromAuto(auto);
}

function mappedFromAuto(result: Extract<AutoResult, { kind: "mapped" }>): MappingResult {
	return {
		kind: "mapped",
		source: "auto",
		providerId: result.providerId,
		...(result.season === undefined ? {} : { season: result.season }),
		...(result.matchedTitle === undefined
			? {}
			: { matchedTitle: result.matchedTitle }),
	};
}

function ambiguous(targets: UpstreamTarget[]): MappingResult {
	return {
		kind: "ambiguous",
		targets,
	};
}

export function matchesUpstream(
	provider: Provider,
	manual: ManualMapping,
	upstream: UpstreamTarget,
): boolean {
	if (
		upstream.provider !== provider ||
		upstream.providerId !== manual.providerId
	) {
		return false;
	}

	return (
		provider === "radarr" ||
		(upstream.provider === "sonarr" && upstream.season === manual.season)
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
