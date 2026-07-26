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
	type ManualFacts,
	type ManualMapping,
} from "./manual.store";
import { getSourceUpstreamMapping } from "./upstream.store";
import { getAutoResult } from "./auto.store";
import type { SourceIdentity } from "./source-identity";
import type { AutomaticResolver } from "./resolve/resolve";
import type { MappingResult, UpstreamTarget } from "./types";
import {
	chooseMappingResult,
	collectEffectiveMappingRecords,
	matchesUpstream,
} from "./mapping-facts";

export class MappingService {
	public constructor(
		private readonly resolveAutomaticMapping: AutomaticResolver,
	) {}

	public async getMapping(
		provider: Provider,
		source: SourceIdentity,
	): Promise<MappingResult> {
		const state = await this.getMappingState(provider, source);
		return state.result;
	}

	private async getMappingState(
		provider: Provider,
		source: SourceIdentity,
	): Promise<{
		identity: SourceIdentity;
		anilistId: AniListId | null;
		manual: ManualFacts | null;
		upstream: UpstreamTarget[];
		result: MappingResult;
	}> {
		const upstream = await getSourceUpstreamMapping(provider, source);
		const legacyIdentity =
			source.source === "mal" && upstream.anilistId !== null
				? ({ source: "anilist", id: upstream.anilistId } as const)
				: null;
		const [directManual, directAuto] = await Promise.all([
			getManualFacts(provider, source),
			getAutoResult(provider, source),
		]);
		const [legacyManual, legacyAuto] =
			legacyIdentity === null
				? [null, null]
				: await Promise.all([
						directManual === null
							? getManualFacts(provider, legacyIdentity)
							: null,
						directAuto === null
							? getAutoResult(provider, legacyIdentity)
							: null,
					]);
		const manual = directManual ?? legacyManual;
		const auto = directAuto ?? legacyAuto;
		return {
			identity: source,
			anilistId: upstream.anilistId,
			manual,
			upstream: upstream.targets,
			result: chooseMappingResult({
				provider,
				manual,
				upstream: upstream.targets,
				auto,
			}),
		};
	}

	public async resolveMapping(
		provider: Provider,
		source: SourceIdentity,
		options?: {
			forceRetry?: boolean;
			title?: string;
			metadata?: AniListMediaHint | null;
		},
	): Promise<MappingResult> {
		const currentState = await this.getMappingState(provider, source);
		const current = currentState.result;

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

		await this.resolveAutomaticMapping({
			provider,
			identity: currentState.identity,
			anilistId: currentState.anilistId,
			rejectedProviderIds:
				current.kind === "unmapped" ? (current.rejectedProviderIds ?? []) : [],
			...(options?.title === undefined ? {} : { title: options.title }),
			...(options?.metadata === undefined
				? {}
				: { metadata: options.metadata }),
		});

		const auto = await getAutoResult(provider, currentState.identity);
		return chooseMappingResult({
			provider,
			manual: currentState.manual,
			upstream: currentState.upstream,
			auto,
		});
	}

	public async setManualMapping(
		provider: Provider,
		identity: SourceIdentity | AniListId,
		providerId: number,
		season?: number,
	): Promise<void> {
		const mapping: ManualMapping =
			provider === "sonarr" && season !== undefined
				? { providerId, season }
				: { providerId };

		await saveManualMapping(provider, identity, mapping);
	}

	public async clearManualMapping(
		provider: Provider,
		identity: SourceIdentity | AniListId,
	): Promise<void> {
		await removeManualMapping(provider, identity);
	}

	public async setIgnored(
		provider: Provider,
		identity: SourceIdentity | AniListId,
	): Promise<void> {
		await saveIgnored(provider, identity);
	}

	public async clearIgnored(
		provider: Provider,
		identity: SourceIdentity | AniListId,
	): Promise<void> {
		await removeIgnored(provider, identity);
	}

	public async rejectCandidate(
		provider: Provider,
		identity: SourceIdentity | AniListId,
		providerId: number,
	): Promise<void> {
		await rejectAutoCandidate(provider, identity, providerId);
	}

	public async clearRejectedCandidate(
		provider: Provider,
		identity: SourceIdentity | AniListId,
		providerId: number,
	): Promise<void> {
		await removeRejectedCandidate(provider, identity, providerId);
	}

	public async cleanupRedundantManualMapping(
		provider: Provider,
		anilistId: AniListId,
	): Promise<boolean> {
		const [manual, upstream] = await Promise.all([
			getManualFacts(provider, anilistId),
			getSourceUpstreamMapping(provider, { source: "anilist", id: anilistId }),
		]);

		if (!manual || !("mapping" in manual) || upstream.targets.length !== 1) {
			return false;
		}

		const upstreamTarget = upstream.targets[0];

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

		const activeRecords = await collectEffectiveMappingRecords(provider);
		const linkedAniListIdsByProviderId = new Map<number, Set<AniListId>>();

		for (const record of activeRecords) {
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
		for (const [
			linkedProviderId,
			linkedAniListIds,
		] of linkedAniListIdsByProviderId) {
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
