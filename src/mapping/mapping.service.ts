/** Decides the active mapping result and exposes mapping write actions. */
// src/mapping/mapping.service.ts

import type { AniListId, AniListMediaHint } from "@/anilist/types";
import type { Provider } from "@/providers/types";
import {
	clearIgnored as removeIgnored,
	clearManualMapping as removeManualMapping,
	clearRejectedAutoCandidate as removeRejectedCandidate,
	getManualFacts,
	listSourceManualFacts,
	rejectAutoCandidate,
	setIgnored as saveIgnored,
	setManualMapping as saveManualMapping,
	type ManualFacts,
	type ManualMapping,
} from "./manual.store";
import {
	getCachedIdsMoeTarget,
	resolveIdsMoeTarget,
	type IdsMoeResolver,
} from "./idsmoe.store";
import {
	getUniqueAniListIdForSource,
	getUpstreamTargets,
	listSourceUpstreamMappings,
} from "./upstream.store";
import { getAutoResult, listSourceAutoResults } from "./auto.store";
import type { AutomaticResolver } from "./resolve/resolve";
import {
	sourceIdentityKey,
	type AutoResult,
	type MappingResult,
	type SourceIdentity,
	type UpstreamTarget,
} from "./types";

type MappingCandidates = {
	provider: Provider;
	manual: ManualFacts | null;
	upstream: UpstreamTarget[];
	auto: AutoResult | null;
	idsMoe?: UpstreamTarget | null;
};

export class MappingService {
	public constructor(
		private readonly resolveAutomaticMapping: AutomaticResolver,
		private readonly resolveIdsMoeMapping: IdsMoeResolver = resolveIdsMoeTarget,
		private readonly getCachedIdsMoeMapping: IdsMoeResolver = getCachedIdsMoeTarget,
	) {}

	public async getMapping(
		provider: Provider,
		source: SourceIdentity | AniListId,
	): Promise<MappingResult> {
		const sourceIdentity = toSourceIdentity(source);
		const [manual, upstream, auto] = await Promise.all([
			getManualFacts(provider, sourceIdentity),
			getUpstreamTargets(provider, sourceIdentity),
			getAutoResult(provider, sourceIdentity),
		]);
		const idsMoe = await getIdsMoeTargetIfUseful(
			provider,
			sourceIdentity,
			upstream,
			this.getCachedIdsMoeMapping,
		);

		return chooseMappingResult({
			provider,
			manual,
			upstream,
			auto,
			idsMoe,
		});
	}

	public async resolveMapping(
		provider: Provider,
		source: SourceIdentity | AniListId,
		options?: {
			forceRetry?: boolean;
			title?: string;
			metadata?: AniListMediaHint | null;
		},
	): Promise<MappingResult> {
		const sourceIdentity = toSourceIdentity(source);
		const current = await this.getMapping(provider, sourceIdentity);

		if (isStableMapping(current)) {
			return current;
		}

		if (
			await shouldKeepAmbiguousMapping({
				provider,
				source: sourceIdentity,
				current,
				forceRetry: options?.forceRetry === true,
			})
		) {
			return current;
		}

		if (current.kind === "unmapped") {
			const idsMoeTarget = await this.resolveIdsMoeMapping(
				provider,
				sourceIdentity,
			);
			if (idsMoeTarget !== null) {
				return this.getMapping(provider, sourceIdentity);
			}

			if (shouldKeepUnmappedMapping(current, options?.forceRetry === true)) {
				return current;
			}
		}

		await this.resolveAutomaticMapping(
			provider,
			sourceIdentity,
			current.kind === "unmapped" ? (current.rejectedProviderIds ?? []) : [],
			{
				...(options?.title === undefined ? {} : { title: options.title }),
				...(options?.metadata === undefined
					? {}
					: { metadata: options.metadata }),
			},
		);

		return this.getMapping(provider, sourceIdentity);
	}

	public async setManualMapping(
		provider: Provider,
		source: SourceIdentity | AniListId,
		providerId: number,
		season?: number,
	): Promise<void> {
		const mapping: ManualMapping =
			provider === "sonarr" && season !== undefined
				? { providerId, season }
				: { providerId };

		await saveManualMapping(provider, toSourceIdentity(source), mapping);
	}

	public async clearManualMapping(
		provider: Provider,
		source: SourceIdentity | AniListId,
	): Promise<void> {
		await removeManualMapping(provider, toSourceIdentity(source));
	}

	public async setIgnored(
		provider: Provider,
		source: SourceIdentity | AniListId,
	): Promise<void> {
		await saveIgnored(provider, toSourceIdentity(source));
	}

	public async clearIgnored(
		provider: Provider,
		source: SourceIdentity | AniListId,
	): Promise<void> {
		await removeIgnored(provider, toSourceIdentity(source));
	}

	public async rejectCandidate(
		provider: Provider,
		source: SourceIdentity | AniListId,
		providerId: number,
	): Promise<void> {
		await rejectAutoCandidate(provider, toSourceIdentity(source), providerId);
	}

	public async clearRejectedCandidate(
		provider: Provider,
		source: SourceIdentity | AniListId,
		providerId: number,
	): Promise<void> {
		await removeRejectedCandidate(provider, toSourceIdentity(source), providerId);
	}

	public async cleanupRedundantManualMapping(
		provider: Provider,
		source: SourceIdentity | AniListId,
	): Promise<boolean> {
		const sourceIdentity = toSourceIdentity(source);
		const [manual, upstream] = await Promise.all([
			getManualFacts(provider, sourceIdentity),
			getUpstreamTargets(provider, sourceIdentity),
		]);

		if (!manual || !("mapping" in manual) || upstream.length !== 1) {
			return false;
		}

		const upstreamTarget = upstream[0];

		if (
			!upstreamTarget ||
			!matchesUpstream(provider, manual.mapping, upstreamTarget)
		) {
			return false;
		}

		await removeManualMapping(provider, sourceIdentity);

		return true;
	}

	public async getLinkedAniListIds(
		provider: Provider,
		providerId: number,
	): Promise<AniListId[]> {
		const linkedAniListIdsByProviderId =
			await this.getLinkedAniListIdsByProviderIds(provider, [providerId]);

		return linkedAniListIdsByProviderId.get(providerId) ?? [];
	}

	public async getLinkedAniListIdsByProviderIds(
		provider: Provider,
		providerIds: Iterable<number>,
	): Promise<Map<number, AniListId[]>> {
		const requestedProviderIds = new Set(providerIds);
		if (requestedProviderIds.size === 0) {
			return new Map();
		}

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

		const upstreamBySourceKey = new Map<string, UpstreamTarget[]>();

		for (const record of upstreamRecords) {
			const targets = record.targets.filter(
				(target) => target.provider === provider,
			);

			if (targets.length > 0) {
				upstreamBySourceKey.set(sourceIdentityKey(record.source), targets);
			}
		}

		const autoBySourceKey = new Map(
			autoRecords.map((record) => [
				sourceIdentityKey(record.source),
				record.result,
			]),
		);

		const sourceKeys = new Set([
			...manualBySourceKey.keys(),
			...upstreamBySourceKey.keys(),
			...autoBySourceKey.keys(),
		]);

		const sourcesByKey = new Map(
			[
				...manualRecords.map((record) => record.source),
				...upstreamRecords.map((record) => record.source),
				...autoRecords.map((record) => record.source),
			].map((source) => [sourceIdentityKey(source), source]),
		);
		const linkedAniListIdsByProviderId = new Map<number, Set<AniListId>>();

		for (const sourceKey of sourceKeys) {
			const source = sourcesByKey.get(sourceKey);
			if (!source) continue;

			const anilistId = await getLinkedAniListIdForSource(source);
			if (anilistId === null) continue;

			const result = chooseMappingResult({
				provider,
				manual: manualBySourceKey.get(sourceKey) ?? null,
				upstream: upstreamBySourceKey.get(sourceKey) ?? [],
				auto: autoBySourceKey.get(sourceKey) ?? null,
			});

			if (
				result.kind !== "mapped" ||
				!requestedProviderIds.has(result.providerId)
			) {
				continue;
			}

			const linkedAniListIds =
				linkedAniListIdsByProviderId.get(result.providerId) ?? new Set();
			linkedAniListIds.add(anilistId);
			linkedAniListIdsByProviderId.set(result.providerId, linkedAniListIds);
		}

		const sortedLinkedAniListIdsByProviderId = new Map<number, AniListId[]>();
		for (const [linkedProviderId, linkedAniListIds] of linkedAniListIdsByProviderId) {
			sortedLinkedAniListIdsByProviderId.set(
				linkedProviderId,
				[...linkedAniListIds].toSorted((left, right) => left - right),
			);
		}

		return sortedLinkedAniListIdsByProviderId;
	}
}

async function getLinkedAniListIdForSource(
	source: SourceIdentity,
): Promise<AniListId | null> {
	return source.source === "anilist"
		? source.id
		: getUniqueAniListIdForSource(source);
}

function toSourceIdentity(source: SourceIdentity | AniListId): SourceIdentity {
	if (typeof source === "number") {
		return { source: "anilist", id: source };
	}

	return source;
}

export function chooseMappingResult(input: MappingCandidates): MappingResult {
	const { provider, manual, upstream, auto, idsMoe = null } = input;

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

	const autoMapping = chooseAutoMapping(auto, upstream, rejectedProviderIds);
	if (upstream.length > 1) {
		return autoMapping ?? ambiguous(upstream);
	}

	const idsMoeMapping = chooseIdsMoeMapping(idsMoe, rejectedProviderIds);
	if (idsMoeMapping) return idsMoeMapping;

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

function chooseIdsMoeMapping(
	target: UpstreamTarget | null,
	rejectedProviderIds: number[] | undefined,
): MappingResult | null {
	if (!target) return null;
	return rejectedProviderIds?.includes(target.providerId) === true
		? unmapped(true, rejectedProviderIds)
		: mappedFromIdsMoe(target);
}

function mappedFromIdsMoe(target: UpstreamTarget): MappingResult {
	return {
		kind: "mapped",
		source: "idsmoe",
		providerId: target.providerId,
		...(target.provider === "sonarr" && target.season !== undefined
			? { season: target.season }
			: {}),
	};
}

function chooseAutoMapping(
	auto: AutoResult | null,
	upstream: UpstreamTarget[],
	rejectedProviderIds: number[] | undefined,
): MappingResult | null {
	if (auto?.kind !== "mapped") return null;

	const autoIsRejected = rejectedProviderIds?.includes(auto.providerId) === true;
	if (upstream.length > 1) {
		return !autoIsRejected && upstreamHasProviderId(upstream, auto.providerId)
			? mappedFromAuto(auto)
			: ambiguous(upstream);
	}

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

function upstreamHasProviderId(
	upstream: readonly UpstreamTarget[],
	providerId: number,
): boolean {
	return upstream.some((target) => target.providerId === providerId);
}

function matchesUpstream(
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

async function getIdsMoeTargetIfUseful(
	provider: Provider,
	source: SourceIdentity,
	upstream: UpstreamTarget[],
	readCachedIdsMoeTarget: IdsMoeResolver,
): Promise<UpstreamTarget | null> {
	return upstream.length === 0
		? readCachedIdsMoeTarget(provider, source)
		: null;
}

function isStableMapping(mapping: MappingResult): boolean {
	return mapping.kind === "mapped" || mapping.kind === "ignored";
}

async function shouldKeepAmbiguousMapping(input: {
	provider: Provider;
	source: SourceIdentity;
	current: MappingResult;
	forceRetry: boolean;
}): Promise<boolean> {
	if (input.current.kind !== "ambiguous" || input.forceRetry) return false;
	return (await getAutoResult(input.provider, input.source)) !== null;
}

function shouldKeepUnmappedMapping(
	current: Extract<MappingResult, { kind: "unmapped" }>,
	forceRetry: boolean,
): boolean {
	return current.hadResolveAttempt && !forceRetry;
}
