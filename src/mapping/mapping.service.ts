/** Composes shared mapping facts and exposes mapping write actions. */

import type { AniListId, AniListMediaHint } from "@/anilist/types";
import type { SeerrTargetSource } from "@/providers/seerr/types";
import type { Provider } from "@/providers/types";
import {
	captureAutomaticWriteToken,
	getAutomaticLayerRecord,
	listAniListAutomaticLayers,
} from "./auto.store";
import {
	projectRadarrTarget,
	projectSonarrTarget,
	type ExternalIdLayer,
	type ExternalIdLayers,
} from "./external-id-facts";
import {
	chooseMappingResultFromLayers,
	collectEffectiveMappingRecords,
	type MappingFactLayers,
} from "./mapping-facts";
import {
	clearIgnored as removeIgnored,
	clearManualMapping as removeManualMapping,
	clearRejectedAutoCandidate as removeRejectedCandidate,
	getManualLayerRecord,
	listAniListManualLayers,
	rejectAutoCandidate,
	setIgnored as saveIgnored,
	setManualMapping as saveManualMapping,
} from "./manual.store";
import type { AutomaticResolver } from "./resolve/resolve";
import {
	projectSeerrTarget,
	type SeerrTargetWithEvidence,
} from "./seerr-target";
import type { SourceIdentity } from "./source-identity";
import {
	getSourceUpstreamLayers,
	listAniListUpstreamLayers,
	type SourceUpstreamLayers,
} from "./upstream.store";
import type { MappingResult } from "./types";

export type EffectiveSeerrTarget = {
	anilistId?: AniListId;
	source: SeerrTargetSource;
} & SeerrTargetWithEvidence;

export class MappingService {
	public constructor(
		private readonly resolveAutomaticMapping: AutomaticResolver,
	) {}

	public async getMapping(
		provider: Provider,
		source: SourceIdentity,
	): Promise<MappingResult> {
		const state = await this.getMappingState(provider, source);
		return chooseMappingResultFromLayers(provider, state.layers);
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
		const writeToken = captureAutomaticWriteToken();
		const state = await this.getMappingState(provider, source);
		const current = chooseMappingResultFromLayers(provider, state.layers);
		if (current.kind === "mapped" || current.kind === "ignored") return current;
		if (current.kind === "ambiguous") return current;
		if (current.hadResolveAttempt && options?.forceRetry !== true)
			return current;

		await this.resolveAutomaticMapping({
			writeToken,
			provider,
			identity: source,
			anilistId: state.anilistId,
			rejectedProviderIds: current.rejectedProviderIds ?? [],
			...(options?.title === undefined ? {} : { title: options.title }),
			...(options?.metadata === undefined
				? {}
				: { metadata: options.metadata }),
		});
		const automatic = await getAutomaticLayerRecord(
			source,
			state.anilistId ?? undefined,
		);
		return chooseMappingResultFromLayers(provider, {
			...state.layers,
			automatic,
		});
	}

	public async getSeerrTarget(
		source: SourceIdentity,
		mediaType: "movie" | "tv",
	): Promise<EffectiveSeerrTarget | null> {
		const upstream = await getSourceUpstreamLayers(source);
		const anilistId = upstream.anilistId ?? undefined;
		const [manual, automatic] = await Promise.all([
			getManualLayerRecord(source, anilistId),
			getAutomaticLayerRecord(source, anilistId),
		]);
		return composeSeerrTarget(
			{
				manual,
				upstream: selectSeerrUpstreamLayer(upstream, mediaType),
				automatic,
			},
			mediaType,
			anilistId,
		);
	}

	public async listSeerrTargets(
		items: readonly { anilistId: AniListId; mediaType: "movie" | "tv" }[],
	): Promise<EffectiveSeerrTarget[]> {
		if (items.length === 0) return [];
		const layers = await loadAniListLayers();
		return items.flatMap(({ anilistId, mediaType }) => {
			const target = composeSeerrTarget(
				{
					manual: layers.manual.get(anilistId) ?? null,
					upstream: layers.upstream.get(anilistId) ?? null,
					automatic: layers.automatic.get(anilistId) ?? null,
				},
				mediaType,
				anilistId,
			);
			return target ? [target] : [];
		});
	}

	public async listAllSeerrTargets(
		mediaType: "movie" | "tv",
	): Promise<Array<EffectiveSeerrTarget & { anilistId: AniListId }>> {
		const layers = await loadAniListLayers();
		const ids = new Set([
			...layers.manual.keys(),
			...layers.upstream.keys(),
			...layers.automatic.keys(),
		]);
		return [...ids].flatMap((anilistId) => {
			const target = composeSeerrTarget(
				{
					manual: layers.manual.get(anilistId) ?? null,
					upstream: layers.upstream.get(anilistId) ?? null,
					automatic: layers.automatic.get(anilistId) ?? null,
				},
				mediaType,
				anilistId,
			);
			return target ? [{ ...target, anilistId }] : [];
		});
	}

	public async setManualMapping(
		provider: Provider,
		identity: SourceIdentity | AniListId,
		providerId: number,
		anilistId?: AniListId,
	): Promise<void> {
		await saveManualMapping(provider, identity, { providerId }, anilistId);
	}

	public async clearManualMapping(
		provider: Provider,
		identity: SourceIdentity | AniListId,
		anilistId?: AniListId,
	): Promise<void> {
		await removeManualMapping(provider, identity, anilistId);
	}

	public async setIgnored(
		provider: Provider,
		identity: SourceIdentity | AniListId,
		anilistId?: AniListId,
	): Promise<void> {
		await saveIgnored(provider, identity, anilistId);
	}

	public async clearIgnored(
		provider: Provider,
		identity: SourceIdentity | AniListId,
		anilistId?: AniListId,
	): Promise<void> {
		await removeIgnored(provider, identity, anilistId);
	}

	public async rejectCandidate(
		provider: Provider,
		identity: SourceIdentity | AniListId,
		providerId: number,
		anilistId?: AniListId,
	): Promise<void> {
		await rejectAutoCandidate(provider, identity, providerId, anilistId);
	}

	public async clearRejectedCandidate(
		provider: Provider,
		identity: SourceIdentity | AniListId,
		providerId: number,
		anilistId?: AniListId,
	): Promise<void> {
		await removeRejectedCandidate(provider, identity, providerId, anilistId);
	}

	public async cleanupRedundantManualMapping(
		provider: Provider,
		anilistId: AniListId,
	): Promise<boolean> {
		const source = { source: "anilist", id: anilistId } as const;
		const upstream = await getSourceUpstreamLayers(source);
		const manual = await getManualLayerRecord(source, anilistId);
		if (!manual) return false;
		const full = chooseMappingResultFromLayers(provider, {
			manual,
			upstream: selectArrUpstreamLayer(provider, upstream),
			automatic: null,
		});
		const withoutManual = chooseMappingResultFromLayers(provider, {
			manual: null,
			upstream: selectArrUpstreamLayer(provider, upstream),
			automatic: null,
		});
		if (
			full.kind !== "mapped" ||
			withoutManual.kind !== "mapped" ||
			full.providerId !== withoutManual.providerId ||
			full.season !== withoutManual.season
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
		const linked = await this.getLinkedAniListIdsByProviderIds(provider, [
			providerId,
		]);
		return linked.get(providerId) ?? [];
	}

	public async getLinkedAniListIdsByProviderIds(
		provider: Provider,
		providerIds: Iterable<number>,
	): Promise<Map<number, AniListId[]>> {
		const requested = new Set(providerIds);
		if (requested.size === 0) return new Map();
		const records = await collectEffectiveMappingRecords(provider);
		const linked = new Map<number, Set<AniListId>>();
		for (const record of records) {
			if (
				record.result.kind !== "mapped" ||
				!requested.has(record.result.providerId)
			) {
				continue;
			}
			const ids = linked.get(record.result.providerId) ?? new Set();
			ids.add(record.anilistId);
			linked.set(record.result.providerId, ids);
		}
		return new Map(
			[...linked].map(([id, ids]) => [
				id,
				[...ids].toSorted((left, right) => left - right),
			]),
		);
	}

	private async getMappingState(
		provider: Provider,
		source: SourceIdentity,
	): Promise<{ anilistId: AniListId | null; layers: MappingFactLayers }> {
		const upstream = await getSourceUpstreamLayers(source);
		const anilistId = upstream.anilistId ?? undefined;
		const [manual, automatic] = await Promise.all([
			getManualLayerRecord(source, anilistId),
			getAutomaticLayerRecord(source, anilistId),
		]);
		return {
			anilistId: upstream.anilistId,
			layers: {
				manual,
				upstream: selectArrUpstreamLayer(provider, upstream),
				automatic,
			},
		};
	}
}

function selectArrUpstreamLayer(
	provider: Provider,
	upstream: SourceUpstreamLayers,
): ExternalIdLayer | null {
	if (upstream.direct) {
		const projection =
			provider === "sonarr"
				? projectSonarrTarget({ upstream: upstream.direct })
				: projectRadarrTarget({ upstream: upstream.direct });
		if (projection.kind !== "missing") return upstream.direct;
	}
	return upstream.canonical;
}

function selectSeerrUpstreamLayer(
	upstream: SourceUpstreamLayers,
	mediaType: "movie" | "tv",
): ExternalIdLayer | null {
	if (upstream.direct) {
		const projection = projectSeerrTarget(
			{ upstream: upstream.direct },
			mediaType,
		);
		if (projection.kind !== "missing") return upstream.direct;
	}
	return upstream.canonical;
}

function composeSeerrTarget(
	layers: MappingFactLayers,
	mediaType: "movie" | "tv",
	anilistId?: AniListId,
): EffectiveSeerrTarget | null {
	const externalLayers: ExternalIdLayers = {
		...(layers.manual ? { manual: layers.manual } : {}),
		...(layers.upstream ? { upstream: layers.upstream } : {}),
		...(layers.automatic ? { automatic: layers.automatic } : {}),
	};
	const projection = projectSeerrTarget(externalLayers, mediaType);
	if (projection.kind !== "target") return null;
	return {
		...(anilistId === undefined ? {} : { anilistId }),
		source: projection.source === "upstream" ? "anibridge" : projection.source,
		...projection.target,
	};
}

async function loadAniListLayers(): Promise<{
	manual: Map<AniListId, MappingFactLayers["manual"]>;
	upstream: Map<AniListId, MappingFactLayers["upstream"]>;
	automatic: Map<AniListId, MappingFactLayers["automatic"]>;
}> {
	const [manual, upstream, automatic] = await Promise.all([
		listAniListManualLayers(),
		listAniListUpstreamLayers(),
		listAniListAutomaticLayers(),
	]);
	return {
		manual: new Map(manual.map((record) => [record.anilistId, record.record])),
		upstream: new Map(
			upstream.map((record) => [record.anilistId, record.record]),
		),
		automatic: new Map(
			automatic.map((record) => [record.anilistId, record.record]),
		),
	};
}
