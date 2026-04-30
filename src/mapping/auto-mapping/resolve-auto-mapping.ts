/** Auto-mapping workflow for lookup, scoring, persistence, and cached auto outcomes. */
// src/mapping/auto-mapping/resolve-auto-mapping.ts

import type { AniListId, AniListMediaService } from "@/anilist";
import type { AniListMedia } from "@/anilist/schemas/media.schema";
import {
	readAutoMappingFailure,
	removeAutoMappingFailure,
	writeAutoMappingFailure,
} from "./failure.cache";
import type {
	Provider,
	ProviderCredentials,
	SonarrLookupSeries,
} from "@/providers";
import { getProviderLabel } from "@/providers/provider-labels";
import { resolveProviderForAniListFormat } from "@/providers/provider-routing";
import {
	createError,
	ErrorCode,
	normalizeError,
	type ExtensionError,
} from "@/shared/errors";
import type { RequestPriority } from "@/shared/utils/request-priority";
import type { ScopedLogger } from "@/shared/utils/logger";
import {
	EARLY_STOP_THRESHOLD,
	MAX_SEARCH_TERMS,
	SCORE_THRESHOLD,
} from "./constants";
import { tryTitleLookup } from "./lookup/title-lookup";
import { buildMediaFromMetadata } from "./metadata-hints";
import { attemptVerifiedInheritedSonarrResolution } from "./inheritance/verified-inheritance";
import type {
	ProviderTitleLookup,
	ProviderTitleResult,
} from "./lookup/provider-title-lookup";
import type { ManualMappingService } from "../manual-mapping";
import { searchAutoMappingCandidates } from "./candidate-search/candidate-search";
import {
	createPipelineRecentEvaluation,
	createRecentEvaluationTrace,
	createSingleCandidateTrace,
	mergeRecentEvaluations,
	rewriteTraceCandidateStatus,
} from "./recent-evaluation";
import {
	UNRESOLVED_AUTO_MAPPING_TTL,
	type AutoMappingStore,
} from "./auto-mapping.store";
import {
	resolveUnresolvedSearchTerms,
	shouldCacheFailure,
} from "../resolution-policy";
import type { AnibridgeMappingStore } from "../upstream-mapping";
import type {
	AcceptedMappingSource,
	RecentMappingEvaluationTrace,
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
	recentEvaluation?: RecentMappingEvaluationTrace;
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
	allowInheritedTraversal: boolean;
};

type ManualMappingReads = Pick<ManualMappingService, "isIgnored" | "get">;

type ResolveAutoMappingDeps = {
	anilistApi: AniListMediaService;
	anibridgeMappingStore: AnibridgeMappingStore;
	lookupClients: ProviderTitleLookupRegistry;
	autoMappingStore: Pick<AutoMappingStore, "get">;
	log: ScopedLogger;
	sessionSeenCanonical: Record<Provider, Set<string>>;
	manualMappings?: ManualMappingReads;
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
		bypassCachedResolutionState: options.ignoreFailureCache === true,
	};

	const cachedAutoMapping = await readUsableCachedAutoMapping(deps, request);
	if (cachedAutoMapping.handled) {
		return cachedAutoMapping.resolved;
	}

	const cachedFailureOrTerminal = await readCachedFailureOrTerminalState(
		deps,
		request,
		cachedAutoMapping.autoMappingRecord,
	);
	if (cachedFailureOrTerminal.handled) {
		return cachedFailureOrTerminal.resolved;
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

	if (autoMappingRecord.acceptedEvidence.source !== "auto") {
		await deps.clearAutoMapping(provider, anilistId);
		return { handled: false, autoMappingRecord: null };
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

	if (import.meta.env.DEV) {
		deps.log.debug?.(
			`mapping:auto-mapping-hit provider=${provider} anilistId=${anilistId} providerId=${autoMappingRecord.providerId} source=${autoMappingRecord.acceptedEvidence.source} reason=${autoMappingRecord.acceptedEvidence.reason}`,
		);
	}
	return { handled: true, resolved };
}

async function readCachedFailureOrTerminalState(
	deps: ResolveAutoMappingDeps,
	request: AutoMappingRequest,
	autoMappingRecord: AutoMappingRecord | null,
): Promise<{ handled: true; resolved: null } | { handled: false }> {
	const { provider, anilistId, bypassCachedResolutionState } = request;
	if (bypassCachedResolutionState) {
		return { handled: false };
	}

	const cachedFailure = await readAutoMappingFailure(provider, anilistId);
	if (cachedFailure) {
		if (import.meta.env.DEV) {
			deps.log.debug?.(
				`mapping:failure-cache-hit provider=${provider} anilistId=${anilistId} code=${cachedFailure.value.code}`,
			);
		}
		throw cachedFailure.value;
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
	const { provider, anilistId, options, bypassCachedResolutionState } = request;
	let attempt: ResolutionAttempt;
	try {
		if (import.meta.env.DEV) {
			deps.log.debug?.(
				`mapping:network-start provider=${provider} anilistId=${anilistId} priority=${options.priority ?? "normal"}`,
			);
		}
		attempt = await resolveViaNetwork(deps, request);
	} catch (error) {
		const normalized = normalizeError(error);
		if (normalized.code === ErrorCode.VALIDATION_ERROR) {
			const fallbackTrace = createRecentEvaluationTrace(
				resolveUnresolvedSearchTerms(options.hints),
				[],
			);
			const recentEvaluation = mergeRecentEvaluations(
				fallbackTrace,
			);
			await deps.recordAutoMapping(
				provider,
				anilistId,
				{
					state: "unresolved",
					...(recentEvaluation ? { recentEvaluation } : {}),
				},
				UNRESOLVED_AUTO_MAPPING_TTL,
			);
			await removeAutoMappingFailure(provider, anilistId);
			return null;
		}

		if (!bypassCachedResolutionState && shouldCacheFailure(normalized)) {
			await cacheFailure(provider, anilistId, normalized);
		}
		throw normalized;
	}

	const recentEvaluation = mergeRecentEvaluations(
		attempt.recentEvaluation,
		createRecentEvaluationTrace(
			resolveUnresolvedSearchTerms(options.hints),
			[],
		),
	);

	if (attempt.resolved === null) {
		await deps.recordAutoMapping(
			provider,
			anilistId,
			{
				state: "unresolved",
				...(recentEvaluation ? { recentEvaluation } : {}),
			},
			UNRESOLVED_AUTO_MAPPING_TTL,
		);
		await removeAutoMappingFailure(provider, anilistId);
		return null;
	}

	if (import.meta.env.DEV) {
		deps.log.debug?.(
			`mapping:network-success provider=${provider} anilistId=${anilistId} providerId=${attempt.resolved.providerId}${attempt.resolved.successfulSynonym ? ` synonym="${attempt.resolved.successfulSynonym}"` : ""}`,
		);
	}
	return deps.acceptResolved(
		provider,
		anilistId,
		{
			...attempt.resolved,
			...(recentEvaluation ? { recentEvaluation } : {}),
		},
		"auto",
	);
}

async function cacheFailure(
	provider: Provider,
	anilistId: AniListId,
	error: ExtensionError,
): Promise<void> {
	await writeAutoMappingFailure(provider, anilistId, error);
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
	let recentEvaluation: RecentMappingEvaluationTrace | undefined;

	const applyAttempt = (
		label: "metadata" | "api",
		attempt: ResolutionAttempt,
	): ResolutionAttempt | null => {
		const resolved = attempt.resolved;

		if (resolved === null) {
			recentEvaluation = mergeRecentEvaluations(
				recentEvaluation,
				attempt.recentEvaluation,
			);
			return null;
		}

		if (
			!deps.isResolvedCandidateSuppressed(provider, anilistId, resolved, "auto")
		) {
			const mergedRecentEvaluation = mergeRecentEvaluations(
				recentEvaluation,
				attempt.recentEvaluation,
			);
			return {
				resolved,
				...(mergedRecentEvaluation
					? { recentEvaluation: mergedRecentEvaluation }
					: {}),
			};
		}

		recentEvaluation = mergeRecentEvaluations(
			recentEvaluation,
			rewriteTraceCandidateStatus(
				attempt.recentEvaluation,
				resolved.providerId,
				"rejected",
			),
		);
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
			allowInheritedTraversal: false,
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
		allowInheritedTraversal: true,
	});
	const resolvedFromApi = applyAttempt("api", apiAttempt);
	if (resolvedFromApi) {
		return resolvedFromApi;
	}

	deps.log.debug?.(
		`resolveViaNetwork: provider=${provider} no match found for AniList ID ${anilistId}`,
	);
	return { resolved: null, ...(recentEvaluation ? { recentEvaluation } : {}) };
}

async function tryResolveWithMedia(
	deps: ResolveAutoMappingDeps,
	context: MediaResolutionContext,
): Promise<ResolutionAttempt> {
	const { provider, media } = context;
	const routedProvider = resolveProviderForAniListFormat(media.format);
	if (routedProvider !== provider) {
		deps.log.debug?.(
			`tryResolveWithMedia: provider mismatch for AniList ID ${media.id} format='${String(media.format)}' expected=${provider} actual=${String(routedProvider)}`,
		);
		return { resolved: null };
	}

	let recentEvaluation: RecentMappingEvaluationTrace | undefined;

	const inheritedResolution = await tryVerifiedInheritedResolution(
		deps,
		context,
	);
	if (inheritedResolution.handled) {
		return inheritedResolution.attempt;
	}
	recentEvaluation = inheritedResolution.recentEvaluation;

	const lookupClient = deps.lookupClients[provider];
	const outcome = await searchAutoMappingCandidates(
		media,
		{
			lookupClient,
			credentials: context.credentials,
			...(context.priority === undefined ? {} : { priority: context.priority }),
			...(context.forceLookupNetwork ? { forceLookupNetwork: true } : {}),
			isCandidateSuppressed: (providerId) =>
				deps.isResolvedCandidateSuppressed(
					provider,
					media.id,
					{
						providerId,
						reason: "exact-title-match",
					},
					"auto",
				),
			sessionSeenCanonical: deps.sessionSeenCanonical[provider],
			limits: {
				maxTerms: MAX_SEARCH_TERMS,
				scoreThreshold: SCORE_THRESHOLD,
				earlyStopThreshold: EARLY_STOP_THRESHOLD,
			},
			log: deps.log,
		},
		context.hints?.primaryTitle,
	);

	if (outcome.status === "resolved") {
		recentEvaluation = mergeRecentEvaluations(
			recentEvaluation,
			createPipelineRecentEvaluation(outcome),
		);
		return {
			resolved: {
				providerId: outcome.providerId,
				reason: outcome.reason,
				...(outcome.successfulSynonym
					? { successfulSynonym: outcome.successfulSynonym }
					: {}),
			},
			...(recentEvaluation ? { recentEvaluation } : {}),
		};
	}
	recentEvaluation = mergeRecentEvaluations(
		recentEvaluation,
		createPipelineRecentEvaluation(outcome),
	);
	return {
		resolved: null,
		...(recentEvaluation ? { recentEvaluation } : {}),
	};
}

async function tryVerifiedInheritedResolution(
	deps: ResolveAutoMappingDeps,
	context: MediaResolutionContext,
): Promise<
	| { handled: true; attempt: ResolutionAttempt }
	| { handled: false; recentEvaluation?: RecentMappingEvaluationTrace }
> {
	const { provider, media } = context;
	if (provider !== "sonarr" || !context.allowInheritedTraversal) {
		return { handled: false };
	}

	const inheritedAttempt = await attemptVerifiedInheritedSonarrResolution({
		media,
		anilistApi: deps.anilistApi,
		anibridgeMappingStore: deps.anibridgeMappingStore,
		lookupClient: deps.lookupClients
			.sonarr as ProviderTitleLookup<SonarrLookupSeries>,
		credentials: context.credentials,
		...(deps.manualMappings ? { manualMappings: deps.manualMappings } : {}),
	});

	let recentEvaluation = inheritedAttempt.recentEvaluation;

	if (inheritedAttempt.status === "accepted") {
		if (
			!deps.isResolvedCandidateSuppressed(
				provider,
				media.id,
				inheritedAttempt.resolved,
				"auto",
			)
		) {
			return {
				handled: true,
				attempt: {
					resolved: inheritedAttempt.resolved,
					...(recentEvaluation ? { recentEvaluation } : {}),
				},
			};
		}

		recentEvaluation = mergeRecentEvaluations(
			recentEvaluation,
			rewriteTraceCandidateStatus(
				createSingleCandidateTrace({
					resolved: inheritedAttempt.resolved,
					source: "auto",
					status: "accepted",
				}),
				inheritedAttempt.resolved.providerId,
				"rejected",
			),
		);
	}

	if (
		inheritedAttempt.status !== "rejected" ||
		!inheritedAttempt.borrowedBaseTitle
	) {
		return {
			handled: false,
			...(recentEvaluation ? { recentEvaluation } : {}),
		};
	}

	const borrowed = await tryTitleLookup(
		inheritedAttempt.borrowedBaseTitle,
		deps.lookupClients.sonarr,
		{
			credentials: context.credentials,
			log: deps.log,
			forceLookupNetwork: context.forceLookupNetwork,
		},
	);
	if (!borrowed) {
		return {
			handled: false,
			...(recentEvaluation ? { recentEvaluation } : {}),
		};
	}

	const borrowedTrace = createSingleCandidateTrace({
		resolved: borrowed,
		source: "auto",
		status: "accepted",
		searchTerms: [inheritedAttempt.borrowedBaseTitle],
		...(borrowed.successfulSynonym
			? { title: borrowed.successfulSynonym }
			: {}),
	});
	recentEvaluation = mergeRecentEvaluations(recentEvaluation, borrowedTrace);

	if (
		!deps.isResolvedCandidateSuppressed(provider, media.id, borrowed, "auto")
	) {
		return {
			handled: true,
			attempt: {
				resolved: borrowed,
				...(recentEvaluation ? { recentEvaluation } : {}),
			},
		};
	}

	const rejectedRecentEvaluation = mergeRecentEvaluations(
		recentEvaluation,
		rewriteTraceCandidateStatus(borrowedTrace, borrowed.providerId, "rejected"),
	);
	return {
		handled: false,
		...(rejectedRecentEvaluation
			? { recentEvaluation: rejectedRecentEvaluation }
			: {}),
	};
}
