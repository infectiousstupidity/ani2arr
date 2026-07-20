/** Collects active mapping facts from manual, upstream, and auto records. */
// src/mapping/mapping-facts.ts

import type { AniListId } from "@/anilist/types";
import type { Provider } from "@/providers/types";
import { listSourceAutoResults } from "./auto.store";
import {
	listSourceManualFacts,
	type ManualFacts,
	type ManualMapping,
} from "./manual.store";
import {
	sourceIdentityKey,
	type SourceIdentity,
} from "./source-identity";
import {
	listSourceUpstreamMappings,
	type UpstreamSourceFact,
} from "./upstream.store";
import type { AutoResult, MappingResult, UpstreamTarget } from "./types";

type MappingCandidates = {
	provider: Provider;
	manual: ManualFacts | null;
	upstream: UpstreamTarget[];
	auto: AutoResult | null;
};

export type EffectiveMappingRecord = {
	source: SourceIdentity;
	anilistId: AniListId | null;
	provider: Provider;
	result: MappingResult;
};

type UpstreamTargetSelector = (
	records: readonly UpstreamSourceFact[],
) =>
	| Promise<ReadonlyMap<string, readonly UpstreamTarget[]>>
	| ReadonlyMap<string, readonly UpstreamTarget[]>;

type CollectEffectiveMappingRecordsOptions = {
	upstreamFacts?: readonly UpstreamSourceFact[];
	selectUpstreamTargets?: UpstreamTargetSelector;
};

export async function collectEffectiveMappingRecords(
	provider: Provider,
	options: CollectEffectiveMappingRecordsOptions = {},
): Promise<EffectiveMappingRecord[]> {
	const [manualRecords, upstreamRecords, autoRecords] = await Promise.all([
		listSourceManualFacts(provider),
		options.upstreamFacts ?? listSourceUpstreamMappings(),
		listSourceAutoResults(provider),
	]);

	const manualBySourceKey = new Map(
		manualRecords.map((record) => [
			sourceIdentityKey(record.source),
			record.facts,
		]),
	);
	const autoBySourceKey = new Map(
		autoRecords.map((record) => [
			sourceIdentityKey(record.source),
			record.result,
		]),
	);
	const sourcesByKey = new Map(
		[
			...manualRecords.map((record) => record.source),
			...upstreamRecords.flatMap((record) =>
				record.targets.length === 0 ? [] : [record.source],
			),
			...autoRecords.map((record) => record.source),
		].map((source) => [sourceIdentityKey(source), source]),
	);
	const anilistIdsBySourceKey = new Map(
		upstreamRecords.map((record) => [
			sourceIdentityKey(record.source),
			record.anilistId,
		]),
	);
	const upstreamBySourceKey = await getUpstreamTargetsBySourceKey(
		provider,
		upstreamRecords,
		options,
	);
	const sourceKeys = new Set([
		...manualBySourceKey.keys(),
		...upstreamBySourceKey.keys(),
		...autoBySourceKey.keys(),
	]);

	return [...sourceKeys].flatMap((sourceKey): EffectiveMappingRecord[] => {
		const source = sourcesByKey.get(sourceKey);
		if (!source) return [];

		const upstreamTargets = [...(upstreamBySourceKey.get(sourceKey) ?? [])];

		return [
			{
				source,
				anilistId:
					source.source === "anilist"
						? source.id
						: (anilistIdsBySourceKey.get(sourceKey) ?? null),
				provider,
				result: chooseMappingResult({
					provider,
					manual: manualBySourceKey.get(sourceKey) ?? null,
					upstream: upstreamTargets,
					auto: autoBySourceKey.get(sourceKey) ?? null,
				}),
			},
		];
	});
}

async function getUpstreamTargetsBySourceKey(
	provider: Provider,
	records: readonly UpstreamSourceFact[],
	options: CollectEffectiveMappingRecordsOptions,
): Promise<ReadonlyMap<string, readonly UpstreamTarget[]>> {
	if (options.selectUpstreamTargets) {
		return options.selectUpstreamTargets(records);
	}

	const upstreamBySourceKey = new Map<string, UpstreamTarget[]>();

	for (const record of records) {
		const targets = record.targets.filter((target) => target.provider === provider);

		if (targets.length > 0) {
			upstreamBySourceKey.set(sourceIdentityKey(record.source), targets);
		}
	}

	return upstreamBySourceKey;
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
