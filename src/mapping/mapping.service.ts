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
import { getUpstreamTargets, listUpstreamMappings } from "./upstream.store";
import { getAutoResult, listAutoResults } from "./auto.store";
import type { AutomaticResolver } from "./resolve/resolve";
import type { AutoResult, MappingResult, UpstreamTarget } from "./types";

export class MappingService {
	public constructor(
		private readonly resolveAutomaticMapping: AutomaticResolver,
	) {}

	public async getMapping(
		provider: Provider,
		anilistId: AniListId,
	): Promise<MappingResult> {
		const [manual, upstream, auto] = await Promise.all([
			getManualFacts(provider, anilistId),
			getUpstreamTargets(provider, anilistId),
			getAutoResult(provider, anilistId),
		]);

		return chooseMappingResult(provider, manual, upstream, auto);
	}

	public async resolveMapping(
		provider: Provider,
		anilistId: AniListId,
		options?: {
			forceRetry?: boolean;
			title?: string;
			metadata?: AniListMediaHint | null;
		},
	): Promise<MappingResult> {
		const current = await this.getMapping(provider, anilistId);

		if (
			current.kind === "mapped" ||
			current.kind === "ignored" ||
			(current.kind === "ambiguous" &&
				(await getAutoResult(provider, anilistId)) !== null &&
				options?.forceRetry !== true) ||
			(current.kind === "unmapped" &&
				current.hadResolveAttempt &&
				options?.forceRetry !== true)
		) {
			return current;
		}

		await this.resolveAutomaticMapping(
			provider,
			anilistId,
			current.kind === "unmapped" ? (current.rejectedProviderIds ?? []) : [],
			{
				...(options?.title === undefined ? {} : { title: options.title }),
				...(options?.metadata === undefined
					? {}
					: { metadata: options.metadata }),
			},
		);

		return this.getMapping(provider, anilistId);
	}

	public async setManualMapping(
		provider: Provider,
		anilistId: AniListId,
		providerId: number,
		season?: number,
	): Promise<void> {
		const mapping: ManualMapping =
			provider === "sonarr" && season !== undefined
				? { providerId, season }
				: { providerId };

		await saveManualMapping(provider, anilistId, mapping);
	}

	public async clearManualMapping(
		provider: Provider,
		anilistId: AniListId,
	): Promise<void> {
		await removeManualMapping(provider, anilistId);
	}

	public async setIgnored(
		provider: Provider,
		anilistId: AniListId,
	): Promise<void> {
		await saveIgnored(provider, anilistId);
	}

	public async clearIgnored(
		provider: Provider,
		anilistId: AniListId,
	): Promise<void> {
		await removeIgnored(provider, anilistId);
	}

	public async rejectCandidate(
		provider: Provider,
		anilistId: AniListId,
		providerId: number,
	): Promise<void> {
		await rejectAutoCandidate(provider, anilistId, providerId);
	}

	public async clearRejectedCandidate(
		provider: Provider,
		anilistId: AniListId,
		providerId: number,
	): Promise<void> {
		await removeRejectedCandidate(provider, anilistId, providerId);
	}

	public async cleanupRedundantManualMapping(
		provider: Provider,
		anilistId: AniListId,
	): Promise<boolean> {
		const [manual, upstream] = await Promise.all([
			getManualFacts(provider, anilistId),
			getUpstreamTargets(provider, anilistId),
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

		await removeManualMapping(provider, anilistId);

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
			const result = chooseMappingResult(
				provider,
				manualByAniListId.get(anilistId) ?? null,
				upstreamByAniListId.get(anilistId) ?? [],
				autoByAniListId.get(anilistId) ?? null,
			);

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

export function chooseMappingResult(
	provider: Provider,
	manual: ManualFacts | null,
	upstream: UpstreamTarget[],
	auto: AutoResult | null,
): MappingResult {
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
	if (autoMapping) return autoMapping;

	if (upstream.length > 1) {
		return ambiguous(upstream);
	}

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
