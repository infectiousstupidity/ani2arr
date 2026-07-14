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
	getUniqueAniListIdForSource,
	listSourceUpstreamMappings,
} from "./upstream.store";
import type { AutoResult, MappingResult, UpstreamTarget } from "./types";

type MappingCandidates = {
	provider: Provider;
	manual: ManualFacts | null;
	upstream: UpstreamTarget[];
	auto: AutoResult | null;
};

export type ActiveMappingRecord = {
	source: SourceIdentity;
	anilistId: AniListId | null;
	result: MappingResult;
	upstreamTargets: UpstreamTarget[];
};

export type ActiveMappingUpstreamRecord = {
	source: SourceIdentity;
	anilistId: AniListId | null;
	targets: readonly UpstreamTarget[];
};

type UpstreamTargetSelector = (
	records: readonly ActiveMappingUpstreamRecord[],
) =>
	| Promise<ReadonlyMap<string, readonly UpstreamTarget[]>>
	| ReadonlyMap<string, readonly UpstreamTarget[]>;

type CollectActiveMappingFactsOptions = {
	selectUpstreamTargets?: UpstreamTargetSelector;
};

export async function collectActiveMappingFacts(
	provider: Provider,
	options: CollectActiveMappingFactsOptions = {},
): Promise<ActiveMappingRecord[]> {
	const [manualRecords, upstreamRecords, autoRecords] = await Promise.all([
		listSourceManualFacts(provider),
		listSourceUpstreamMappings(),
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
			...upstreamRecords.map((record) => record.source),
			...autoRecords.map((record) => record.source),
		].map((source) => [sourceIdentityKey(source), source]),
	);
	const anilistIdsBySourceKey = await getAniListIdsBySourceKey(
		[...sourcesByKey.values()],
	);
	const linkedUpstreamRecords = upstreamRecords.map(
		(record): ActiveMappingUpstreamRecord => ({
			source: record.source,
			anilistId: anilistIdsBySourceKey.get(sourceIdentityKey(record.source)) ?? null,
			targets: record.targets,
		}),
	);
	const upstreamBySourceKey = await getUpstreamTargetsBySourceKey(
		provider,
		linkedUpstreamRecords,
		options,
	);
	const sourceKeys = new Set([
		...manualBySourceKey.keys(),
		...upstreamBySourceKey.keys(),
		...autoBySourceKey.keys(),
	]);

	return [...sourceKeys].flatMap((sourceKey): ActiveMappingRecord[] => {
		const source = sourcesByKey.get(sourceKey);
		if (!source) return [];

		const upstreamTargets = [...(upstreamBySourceKey.get(sourceKey) ?? [])];

		return [
			{
				source,
				anilistId: anilistIdsBySourceKey.get(sourceKey) ?? null,
				result: chooseMappingResult({
					provider,
					manual: manualBySourceKey.get(sourceKey) ?? null,
					upstream: upstreamTargets,
					auto: autoBySourceKey.get(sourceKey) ?? null,
				}),
				upstreamTargets,
			},
		];
	});
}

async function getAniListIdsBySourceKey(
	sources: readonly SourceIdentity[],
): Promise<ReadonlyMap<string, AniListId>> {
	const records = await Promise.all(
		sources.map(async (source): Promise<[string, AniListId] | null> => {
			const anilistId =
				source.source === "anilist"
					? source.id
					: await getUniqueAniListIdForSource(source);

			return anilistId === null ? null : [sourceIdentityKey(source), anilistId];
		}),
	);

	return new Map(records.flatMap((record) => (record === null ? [] : [record])));
}

async function getUpstreamTargetsBySourceKey(
	provider: Provider,
	records: readonly ActiveMappingUpstreamRecord[],
	options: CollectActiveMappingFactsOptions,
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

	const upstreamTarget = getSingleUpstreamTarget(provider, upstream);
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
	provider: Provider,
	upstream: UpstreamTarget[],
): UpstreamTarget | undefined {
	if (upstream.length === 1) return upstream[0];
	if (provider !== "sonarr" || upstream.length === 0) return undefined;

	const firstTarget = upstream[0];
	if (firstTarget?.provider !== "sonarr") return undefined;

	const providerId = firstTarget.providerId;
	if (
		upstream.some(
			(target) =>
				target.provider !== "sonarr" || target.providerId !== providerId,
		)
	) {
		return undefined;
	}

	return {
		provider: "sonarr",
		providerId,
	};
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
