/** Auto-mapping workflow for lookup, scoring, persistence, and cached auto outcomes. */
// src/mapping/auto-mapping/resolve-auto-mapping.ts

import type { AniListId, AniListMediaService } from "@/anilist";
import type { AniListMedia } from "@/anilist/schemas/media.schema";
import type { Provider, ProviderCredentials } from "@/providers";
import { getProviderLabel } from "@/providers/provider-labels";
import { resolveProviderForAniListFormat } from "@/providers/provider-routing";
import { createError, ErrorCode, normalizeError } from "@/shared/errors";
import type { RequestPriority } from "@/shared/utils/request-priority";
import type { ScopedLogger } from "@/shared/utils/logger";
import {
	EARLY_STOP_THRESHOLD,
	MAX_SEARCH_TERMS,
	SCORE_THRESHOLD,
} from "./constants";
import { buildMediaFromMetadata } from "./metadata-hints";
import type {
	ProviderTitleLookup,
	ProviderTitleResult,
} from "./lookup/provider-title-lookup";
import { searchAutoMappingCandidates } from "./candidate-search/candidate-search";
import {
	UNRESOLVED_AUTO_MAPPING_TTL,
	type AutoMappingStore,
} from "./auto-mapping.store";
import type {
	AcceptedMappingReason,
	AcceptedMappingSource,
} from "../types";
import type {
	AutoMappingSource,
	AutoMappingOptions,
	AcceptedAutoMappingResult,
	AutoMappingRecord,
} from "./types";

type ProviderTitleLookupRegistry = Record<
	Provider,
	ProviderTitleLookup<ProviderTitleResult>
>;

type ResolutionAttempt = {
	resolved: AcceptedAutoMappingResult | null;
	confidence?: number;
};

type AutoMappingRequest = {
	provider: Provider;
	anilistId: AniListId;
	options: AutoMappingOptions;
	bypassCachedResolutionState: boolean;
};

type NetworkResolutionContext = AutoMappingRequest & {
	credentials: ProviderCredentials;
	hints: AutoMappingOptions["hints"] | undefined;
	priority: RequestPriority | undefined;
	forceLookupNetwork: boolean;
};

type MediaResolutionContext = NetworkResolutionContext & {
	media: AniListMedia;
};

type ResolutionAttemptLabel = "metadata" | "api" | "relation" | "prequel-chain";

type ResolveAutoMappingDeps = {
	anilistApi: AniListMediaService;
	lookupClients: ProviderTitleLookupRegistry;
	autoMappingStore: Pick<AutoMappingStore, "get">;
	log: ScopedLogger;
	acceptResolved: (
		provider: Provider,
		anilistId: AniListId,
		resolved: AcceptedAutoMappingResult,
		source: AutoMappingSource,
	) => Promise<AcceptedAutoMappingResult | null>;
	recordAutoMapping: (
		provider: Provider,
		anilistId: AniListId,
		state: Omit<AutoMappingRecord, "updatedAt">,
		ttl: { hardMs: number },
	) => Promise<void>;
	clearAutoMapping: (provider: Provider, anilistId: AniListId) => Promise<void>;
	getConfiguredCredentials: (
		provider: Provider,
	) => Promise<ProviderCredentials>;
	isResolvedCandidateSuppressed: (
		provider: Provider,
		anilistId: AniListId,
		resolved: AcceptedAutoMappingResult,
		source: AcceptedMappingSource,
	) => boolean;
};

export async function resolveAutoMapping(
	deps: ResolveAutoMappingDeps,
	provider: Provider,
	anilistId: AniListId,
	options: AutoMappingOptions,
): Promise<AcceptedAutoMappingResult | null> {
	const request: AutoMappingRequest = {
		provider,
		anilistId,
		options,
		bypassCachedResolutionState: options.forceLookupNetwork === true,
	};

	const cachedAutoMapping = await readUsableCachedAutoMapping(deps, request);
	if (cachedAutoMapping.handled) {
		return cachedAutoMapping.resolved;
	}

	const cachedTerminalState = await readCachedTerminalState(
		deps,
		request,
		cachedAutoMapping.autoMappingRecord,
	);
	if (cachedTerminalState.handled) {
		return cachedTerminalState.resolved;
	}

	if (options.network === "never") {
		throw createError(
			ErrorCode.VALIDATION_ERROR,
			`AniList ID ${anilistId} requires a network lookup but network access is disabled.`,
			`Unable to resolve this title without contacting ${getProviderLabel(provider)}.`,
			{ reason: "network-disabled", provider },
		);
	}

	return attemptNetworkResolution(deps, request);
}

async function readUsableCachedAutoMapping(
	deps: ResolveAutoMappingDeps,
	request: AutoMappingRequest,
): Promise<
	| { handled: true; resolved: AcceptedAutoMappingResult }
	| { handled: false; autoMappingRecord: AutoMappingRecord | null }
> {
	const { provider, anilistId } = request;
	const autoMappingRecord = await deps.autoMappingStore.get(
		provider,
		anilistId,
	);
	if (autoMappingRecord?.state !== "mapped") {
		return { handled: false, autoMappingRecord };
	}

	const resolved = {
		providerId: autoMappingRecord.providerId,
		reason: autoMappingRecord.acceptedEvidence.reason,
		...(autoMappingRecord.acceptedEvidence.successfulTitle
			? {
					successfulSynonym: autoMappingRecord.acceptedEvidence.successfulTitle,
				}
			: {}),
	};

	if (
		deps.isResolvedCandidateSuppressed(
			provider,
			anilistId,
			resolved,
			autoMappingRecord.acceptedEvidence.source,
		)
	) {
		await deps.clearAutoMapping(provider, anilistId);
		return { handled: false, autoMappingRecord: null };
	}

	if (request.options.forceLookupNetwork === true) {
		return { handled: false, autoMappingRecord: null };
	}

	if (import.meta.env.DEV) {
		deps.log.debug?.(
			`mapping:auto-mapping-hit provider=${provider} anilistId=${anilistId} providerId=${autoMappingRecord.providerId} source=${autoMappingRecord.acceptedEvidence.source} reason=${autoMappingRecord.acceptedEvidence.reason}`,
		);
	}
	return { handled: true, resolved };
}

async function readCachedTerminalState(
	deps: ResolveAutoMappingDeps,
	request: AutoMappingRequest,
	autoMappingRecord: AutoMappingRecord | null,
): Promise<{ handled: true; resolved: null } | { handled: false }> {
	const { provider, anilistId, bypassCachedResolutionState } = request;
	if (bypassCachedResolutionState) {
		return { handled: false };
	}

	if (autoMappingRecord) {
		if (import.meta.env.DEV) {
			deps.log.debug?.(
				`mapping:auto-mapping-terminal provider=${provider} anilistId=${anilistId} state=${autoMappingRecord.state}`,
			);
		}
		return { handled: true, resolved: null };
	}

	return { handled: false };
}

async function attemptNetworkResolution(
	deps: ResolveAutoMappingDeps,
	request: AutoMappingRequest,
): Promise<AcceptedAutoMappingResult | null> {
	const { provider, anilistId } = request;
	let attempt: ResolutionAttempt;
	try {
		attempt = await resolveViaNetwork(deps, request);
	} catch (error) {
		const normalized = normalizeError(error);
		if (normalized.code === ErrorCode.VALIDATION_ERROR) {
			await deps.recordAutoMapping(
				provider,
				anilistId,
				{
					state: "unresolved",
				},
				UNRESOLVED_AUTO_MAPPING_TTL,
			);
			deps.log.debug?.(
				`mapping:auto-resolution-outcome provider=${provider} anilistId=${anilistId} state=unresolved reason=validation-error`,
			);
			return null;
		}

		throw normalized;
	}

	if (attempt.resolved === null) {
		await deps.recordAutoMapping(
			provider,
			anilistId,
			{
				state: "unresolved",
			},
			UNRESOLVED_AUTO_MAPPING_TTL,
		);
		deps.log.debug?.(
			`mapping:auto-resolution-outcome provider=${provider} anilistId=${anilistId} state=unresolved reason=no-match`,
		);
		return null;
	}

	deps.log.debug?.(
		`mapping:auto-resolution-outcome provider=${provider} anilistId=${anilistId} state=mapped providerId=${attempt.resolved.providerId} reason=${attempt.resolved.reason}${attempt.confidence === undefined ? "" : ` confidence=${attempt.confidence.toFixed(3)}`}`,
	);
	return deps.acceptResolved(
		provider,
		anilistId,
		{
			...attempt.resolved,
		},
		"auto",
	);
}

async function resolveViaNetwork(
	deps: ResolveAutoMappingDeps,
	request: AutoMappingRequest,
): Promise<ResolutionAttempt> {
	const { provider, anilistId, options } = request;
	const credentials = await deps.getConfiguredCredentials(provider);
	const context: NetworkResolutionContext = {
		...request,
		credentials,
		hints: options.hints,
		priority: options.priority,
		forceLookupNetwork: options.forceLookupNetwork === true,
	};

	const applyAttempt = (
		label: ResolutionAttemptLabel,
		attempt: ResolutionAttempt,
	): ResolutionAttempt | null => {
		const resolved = attempt.resolved;

		if (resolved === null) {
			return null;
		}

		if (
			!deps.isResolvedCandidateSuppressed(provider, anilistId, resolved, "auto")
		) {
			return {
				resolved,
				...(attempt.confidence === undefined
					? {}
					: { confidence: attempt.confidence }),
			};
		}

		if (import.meta.env.DEV) {
			deps.log.debug?.(
				`mapping:${label}-candidate-suppressed provider=${provider} anilistId=${anilistId} providerId=${resolved.providerId} reason=${resolved.reason}`,
			);
		}
		return null;
	};

	const metadataMedia = buildMediaFromMetadata(
		anilistId,
		context.hints?.domMedia,
	);
	if (metadataMedia) {
		const metadataAttempt = await tryResolveWithMedia(deps, {
			...context,
			media: metadataMedia,
		});
		const resolvedFromMetadata = applyAttempt("metadata", metadataAttempt);
		if (resolvedFromMetadata) {
			return resolvedFromMetadata;
		}
	}

	const anilistMediaWithRelations =
		await deps.anilistApi.fetchMediaWithRelations(
			anilistId,
			context.priority === undefined
				? { source: "mapping-resolve" }
				: { priority: context.priority, source: "mapping-resolve" },
		);
	const apiAttempt = await tryResolveWithMedia(deps, {
		...context,
		media: anilistMediaWithRelations,
	});
	const resolvedFromApi = applyAttempt("api", apiAttempt);
	if (resolvedFromApi) {
		return resolvedFromApi;
	}

	const directPrequelMedia = getDirectPrequelMedia(
		anilistMediaWithRelations,
		provider,
	);
	const directPrequelIds = new Set(
		directPrequelMedia.map((media) => media.id),
	);
	for (const relationMedia of directPrequelMedia) {
		const relationAttempt = await tryResolveWithMedia(
			deps,
			{
				...context,
				media: relationMedia,
			},
			{ usePrimaryTitleHint: false },
		);
		const resolvedFromRelation = applyAttempt("relation", relationAttempt);
		if (resolvedFromRelation) {
			return resolvedFromRelation;
		}
	}

	for await (const prequelMedia of deps.anilistApi.iteratePrequelChain(
		anilistMediaWithRelations,
		{ includeRoot: false },
	)) {
		if (directPrequelIds.has(prequelMedia.id)) {
			continue;
		}
		const prequelAttempt = await tryResolveWithMedia(
			deps,
			{
				...context,
				media: prequelMedia,
			},
			{ usePrimaryTitleHint: false },
		);
		const resolvedFromPrequel = applyAttempt("prequel-chain", prequelAttempt);
		if (resolvedFromPrequel) {
			return resolvedFromPrequel;
		}
	}

	return { resolved: null };
}

async function tryResolveWithMedia(
	deps: ResolveAutoMappingDeps,
	context: MediaResolutionContext,
	options: { usePrimaryTitleHint?: boolean } = {},
): Promise<ResolutionAttempt> {
	const { provider, media } = context;
	const routedProvider = resolveProviderForAniListFormat(media.format);
	if (routedProvider !== provider) {
		deps.log.debug?.(
			`tryResolveWithMedia: provider mismatch for AniList ID ${media.id} format='${String(media.format)}' expected=${provider} actual=${String(routedProvider)}`,
		);
		return { resolved: null };
	}

	const lookupClient = deps.lookupClients[provider];
	const outcome = await searchAutoMappingCandidates(
		media,
		{
			lookupClient,
			credentials: context.credentials,
			...(context.priority === undefined ? {} : { priority: context.priority }),
			...(context.forceLookupNetwork ? { forceLookupNetwork: true } : {}),
			isCandidateSuppressed: (providerId, reason: AcceptedMappingReason) =>
				deps.isResolvedCandidateSuppressed(
					provider,
					context.anilistId,
					{
						providerId,
						reason,
					},
					"auto",
				),
			limits: {
				maxTerms: MAX_SEARCH_TERMS,
				scoreThreshold: SCORE_THRESHOLD,
				earlyStopThreshold: EARLY_STOP_THRESHOLD,
			},
			log: deps.log,
		},
		options.usePrimaryTitleHint === false
			? undefined
			: context.hints?.primaryTitle,
	);

	if (outcome.status === "resolved") {
		return {
			resolved: {
				providerId: outcome.providerId,
				reason: outcome.reason,
				...(outcome.successfulSynonym
					? { successfulSynonym: outcome.successfulSynonym }
					: {}),
			},
			confidence: outcome.confidence,
		};
	}
	return { resolved: null };
}

function hasUsableRelationTitles(media: AniListMedia): boolean {
	return (
		Object.values(media.title ?? {}).some(
			(value) => typeof value === "string" && value.trim().length > 0,
		) ||
		(media.synonyms ?? []).some(
			(value) => typeof value === "string" && value.trim().length > 0,
		)
	);
}

function relationNodeToMedia(
	media: AniListMedia,
	provider: Provider,
): AniListMedia | null {
	const routedProvider = resolveProviderForAniListFormat(media.format);
	if (routedProvider !== provider || !hasUsableRelationTitles(media)) {
		return null;
	}
	return media;
}

function getDirectPrequelMedia(
	media: AniListMedia,
	provider: Provider,
): AniListMedia[] {
	return (media.relations?.edges ?? []).flatMap((edge) => {
		if (edge.relationType !== "PREQUEL") {
			return [];
		}
		const node = edge.node;
		const relationMedia = relationNodeToMedia(
			{
				id: node.id,
				format: node.format ?? null,
				title: node.title ?? {},
				synonyms: node.synonyms ?? [],
				...(node.startDate ? { startDate: node.startDate } : {}),
			},
			provider,
		);
		return relationMedia ? [relationMedia] : [];
	});
}
