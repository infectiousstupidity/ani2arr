/** Decides the active mapping result and exposes mapping write actions. */
// src/mapping/mapping.service.ts

import type { AniListId, AniListMediaHint } from "@/anilist/types";
import type { Provider } from "@/providers/types";
import {
	clearIgnored as removeIgnored,
	clearManualMapping as removeManualMapping,
	clearRejectedAutoCandidate as removeRejectedCandidate,
	getManualFacts,
	rejectAutoCandidate,
	setIgnored as saveIgnored,
	setManualMapping as saveManualMapping,
	type ManualMapping,
} from "./manual.store";
import { getUpstreamTargets } from "./upstream.store";
import { getAutoResult } from "./auto.store";
import type { AutomaticResolver } from "./resolve/resolve";
import {
	normalizeSourceIdentity,
	type SourceIdentity,
} from "./source-identity";
import type { MappingResult } from "./types";
import {
	chooseMappingResult,
	collectActiveMappingFacts,
	matchesUpstream,
} from "./mapping-facts";

export { chooseMappingResult } from "./mapping-facts";

export class MappingService {
	public constructor(
		private readonly resolveAutomaticMapping: AutomaticResolver,
	) {}

	public async getMapping(
		provider: Provider,
		source: SourceIdentity | AniListId,
	): Promise<MappingResult> {
		const sourceIdentity = normalizeSourceIdentity(source);
		const [manual, upstream, auto] = await Promise.all([
			getManualFacts(provider, sourceIdentity),
			getUpstreamTargets(provider, sourceIdentity),
			getAutoResult(provider, sourceIdentity),
		]);
		return chooseMappingResult({
			provider,
			manual,
			upstream,
			auto,
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
		const sourceIdentity = normalizeSourceIdentity(source);
		const current = await this.getMapping(provider, sourceIdentity);

		if (isStableMapping(current)) {
			return current;
		}

		if (current.kind === "ambiguous") {
			return current;
		}

		if (
			current.kind === "unmapped" &&
			shouldKeepUnmappedMapping(current, options?.forceRetry === true)
		) {
			return current;
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

		await saveManualMapping(provider, normalizeSourceIdentity(source), mapping);
	}

	public async clearManualMapping(
		provider: Provider,
		source: SourceIdentity | AniListId,
	): Promise<void> {
		await removeManualMapping(provider, normalizeSourceIdentity(source));
	}

	public async setIgnored(
		provider: Provider,
		source: SourceIdentity | AniListId,
	): Promise<void> {
		await saveIgnored(provider, normalizeSourceIdentity(source));
	}

	public async clearIgnored(
		provider: Provider,
		source: SourceIdentity | AniListId,
	): Promise<void> {
		await removeIgnored(provider, normalizeSourceIdentity(source));
	}

	public async rejectCandidate(
		provider: Provider,
		source: SourceIdentity | AniListId,
		providerId: number,
	): Promise<void> {
		await rejectAutoCandidate(provider, normalizeSourceIdentity(source), providerId);
	}

	public async clearRejectedCandidate(
		provider: Provider,
		source: SourceIdentity | AniListId,
		providerId: number,
	): Promise<void> {
		await removeRejectedCandidate(provider, normalizeSourceIdentity(source), providerId);
	}

	public async cleanupRedundantManualMapping(
		provider: Provider,
		source: SourceIdentity | AniListId,
	): Promise<boolean> {
		const sourceIdentity = normalizeSourceIdentity(source);
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

		const activeRecords = await collectActiveMappingFacts(provider);
		const linkedAniListIdsByProviderId = new Map<number, Set<AniListId>>();

		for (const record of activeRecords) {
			if (record.anilistId === null) continue;

			if (
				record.result.kind !== "mapped" ||
				!requestedProviderIds.has(record.result.providerId)
			) {
				continue;
			}

			const linkedAniListIds =
				linkedAniListIdsByProviderId.get(record.result.providerId) ?? new Set();
			linkedAniListIds.add(record.anilistId);
			linkedAniListIdsByProviderId.set(
				record.result.providerId,
				linkedAniListIds,
			);
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

function isStableMapping(mapping: MappingResult): boolean {
	return mapping.kind === "mapped" || mapping.kind === "ignored";
}

function shouldKeepUnmappedMapping(
	current: Extract<MappingResult, { kind: "unmapped" }>,
	forceRetry: boolean,
): boolean {
	return current.hadResolveAttempt && !forceRetry;
}
