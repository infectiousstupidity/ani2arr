/** Composes mapping records for provider reads and automatic resolution. */

import type { AniListId, AniListMediaHint } from "@/anilist/types";
import type { SeerrTargetSource } from "@/providers/seerr/types";
import type { Provider } from "@/providers/types";
import {
	captureAutomaticWriteToken,
	getAutomaticLayerRecord,
	listAniListAutomaticLayers,
} from "./auto.store";
import {
	selectArrMapping,
	selectSeerrMapping,
	type MappingSelectionRecords,
	type SeerrMappingOutcome,
} from "./effective-mapping";
import { listEffectiveMappingsByProvider } from "./list-mappings";
import {
	getManualLayerRecord,
	listAniListManualLayers,
} from "./manual.store";
import type { AutomaticResolver } from "./resolve/resolve";
import type { SourceIdentity } from "./source-identity";
import {
	getSourceUpstreamLayers,
	listAniListUpstreamLayers,
} from "./upstream.store";
import type { MappingResult, SeerrTargetWithEvidence } from "./types";

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
		linkedAniListId: AniListId | null,
	): Promise<MappingResult> {
		const state = await this.getMappingState(source, linkedAniListId);
		return selectArrMapping(provider, state.records);
	}

	public async resolveMapping(
		provider: Provider,
		source: SourceIdentity,
		linkedAniListId: AniListId | null,
		options?: {
			forceRetry?: boolean;
			title?: string;
			metadata?: AniListMediaHint | null;
		},
	): Promise<MappingResult> {
		const writeToken = captureAutomaticWriteToken();
		const state = await this.getMappingState(source, linkedAniListId);
		const current = selectArrMapping(provider, state.records);
		if (current.kind !== "unmapped") return current;
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
		return selectArrMapping(provider, { ...state.records, automatic });
	}

	public async getSeerrMappingOutcome(
		source: SourceIdentity,
		mediaType: "movie" | "tv",
		linkedAniListId: AniListId | null,
	): Promise<SeerrMappingOutcome & { anilistId?: AniListId }> {
		const state = await this.getMappingState(source, linkedAniListId);
		return {
			...selectSeerrMapping(mediaType, state.records),
			...(state.anilistId === null ? {} : { anilistId: state.anilistId }),
		};
	}

	public async getSeerrTarget(
		source: SourceIdentity,
		mediaType: "movie" | "tv",
		linkedAniListId: AniListId | null,
	): Promise<EffectiveSeerrTarget | null> {
		const outcome = await this.getSeerrMappingOutcome(
			source,
			mediaType,
			linkedAniListId,
		);
		return outcome.kind === "mapped" ? effectiveSeerrTarget(outcome) : null;
	}

	public async listSeerrTargets(
		items: readonly { anilistId: AniListId; mediaType: "movie" | "tv" }[],
	): Promise<EffectiveSeerrTarget[]> {
		if (items.length === 0) return [];
		const records = await loadAniListRecords();
		return items.flatMap(({ anilistId, mediaType }) => {
			const outcome = selectSeerrMapping(
				mediaType,
				recordsForAniList(records, anilistId),
			);
			return outcome.kind === "mapped"
				? [effectiveSeerrTarget({ ...outcome, anilistId })]
				: [];
		});
	}

	public async listAllSeerrTargets(
		mediaType: "movie" | "tv",
	): Promise<Array<EffectiveSeerrTarget & { anilistId: AniListId }>> {
		const records = await loadAniListRecords();
		const ids = new Set([
			...records.manual.keys(),
			...records.upstream.keys(),
			...records.automatic.keys(),
		]);
		return [...ids].flatMap((anilistId) => {
			const outcome = selectSeerrMapping(
				mediaType,
				recordsForAniList(records, anilistId),
			);
			if (outcome.kind !== "mapped") return [];
			return [{ ...effectiveSeerrTarget(outcome), anilistId }];
		});
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
		const linked = new Map<number, Set<AniListId>>();
		const records = await listEffectiveMappingsByProvider();
		for (const record of records[provider]) {
			if (
				record.result.kind !== "mapped" ||
				!requested.has(record.result.providerId)
			)
				continue;
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
		source: SourceIdentity,
		linkedAniListId: AniListId | null,
	): Promise<{
		anilistId: AniListId | null;
		records: MappingSelectionRecords;
	}> {
		const upstream = await getSourceUpstreamLayers(source, linkedAniListId);
		const anilistId = upstream.anilistId ?? undefined;
		const [manual, automatic] = await Promise.all([
			getManualLayerRecord(source, anilistId),
			getAutomaticLayerRecord(source, anilistId),
		]);
		return {
			anilistId: upstream.anilistId,
			records: {
				manual,
				direct: upstream.direct,
				canonical: upstream.canonical,
				automatic,
			},
		};
	}
}

function effectiveSeerrTarget(
	outcome: Extract<SeerrMappingOutcome, { kind: "mapped" }> & {
		anilistId?: AniListId;
	},
): EffectiveSeerrTarget {
	return {
		...(outcome.anilistId === undefined
			? {}
			: { anilistId: outcome.anilistId }),
		source: outcome.source === "upstream" ? "anibridge" : outcome.source,
		...outcome.target,
	};
}

type AniListRecords = Awaited<ReturnType<typeof loadAniListRecords>>;
function recordsForAniList(
	records: AniListRecords,
	anilistId: AniListId,
): MappingSelectionRecords {
	return {
		manual: records.manual.get(anilistId) ?? null,
		direct: records.upstream.get(anilistId) ?? null,
		canonical: null,
		automatic: records.automatic.get(anilistId) ?? null,
	};
}

async function loadAniListRecords() {
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
