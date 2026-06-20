/** Decides the active mapping result and exposes mapping write actions. */
// src/mapping/mapping.service.ts

import type { AniListId, AniListMediaHint } from "@/anilist/types";
import type { Provider } from "@/providers/types";
import {
	clearIgnored as removeIgnored,
	clearManualMapping as removeManualMapping,
	clearRejectedAutoCandidate as removeRejectedCandidate,
	getManualFacts,
	listManualFacts,
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
import { getUpstreamTargets, listUpstreamMappings } from "./upstream.store";
import { getAutoResult, listAutoResults } from "./auto.store";
import type { AutomaticResolver } from "./resolve/resolve";
import type {
	AutoResult,
	MappingResult,
	SourceIdentity,
	UpstreamTarget,
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
			listManualFacts(provider),
			listUpstreamMappings(),
			listAutoResults(provider),
		]);

		const manualByAniListId = new Map(
			manualRecords.map((record) => [record.anilistId, record.facts]),
		);

		const upstreamByAniListId = new Map<AniListId, UpstreamTarget[]>();

		for (const record of upstreamRecords) {
			const targets = record.targets.filter(
				(target) => target.provider === provider,
			);

			if (targets.length > 0) {
				upstreamByAniListId.set(record.anilistId, targets);
			}
		}

		const autoByAniListId = new Map(
			autoRecords.map((record) => [record.anilistId, record.result]),
		);

		const anilistIds = new Set([
			...manualByAniListId.keys(),
			...upstreamByAniListId.keys(),
			...autoByAniListId.keys(),
		]);

		const linkedAniListIdsByProviderId = new Map<number, AniListId[]>();

		for (const anilistId of anilistIds) {
			const result = chooseMappingResult({
				provider,
				manual: manualByAniListId.get(anilistId) ?? null,
				upstream: upstreamByAniListId.get(anilistId) ?? [],
				auto: autoByAniListId.get(anilistId) ?? null,
			});

			if (
				result.kind !== "mapped" ||
				!requestedProviderIds.has(result.providerId)
			) {
				continue;
			}

			const linkedAniListIds =
				linkedAniListIdsByProviderId.get(result.providerId) ?? [];
			linkedAniListIds.push(anilistId);
			linkedAniListIdsByProviderId.set(result.providerId, linkedAniListIds);
		}

		for (const [linkedProviderId, linkedAniListIds] of linkedAniListIdsByProviderId) {
			linkedAniListIdsByProviderId.set(
				linkedProviderId,
				linkedAniListIds.toSorted((left, right) => left - right),
			);
		}

		return linkedAniListIdsByProviderId;
	}
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
