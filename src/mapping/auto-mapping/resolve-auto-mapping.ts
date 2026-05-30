/** Auto-mapping workflow for lookup, scoring, and candidate resolution. */
// src/mapping/auto-mapping/resolve-auto-mapping.ts

import type { AniListId, AniListMediaService } from "@/anilist";
import type { AniListMedia } from "@/anilist/schemas/media.schema";
import type { Provider, ProviderCredentials } from "@/providers";
import { getProviderLabel } from "@/providers/provider-labels";
import { resolveProviderForAniListFormat } from "@/providers/provider-routing";
import { createError, ErrorCode } from "@/shared/errors";
import type { RequestPriority } from "@/shared/utils/request-priority";
import type { ScopedLogger } from "@/shared/utils/logger";
import {
	EARLY_STOP_THRESHOLD,
	MAX_SEARCH_TERMS,
	SCORE_THRESHOLD,
} from "./constants";
import { buildMediaFromMetadata } from "./metadata-hints";
import type { ProviderTitleLookup } from "./lookup/provider-title-lookup";
import { searchAutoMappingCandidates } from "./candidate-search/candidate-search";
import type { AcceptedMappingReason, ProviderExternalId } from "../types";
import type { AutoMappingOptions, AcceptedAutoMappingResult } from "./types";

type ProviderTitleLookupRegistry = Record<Provider, ProviderTitleLookup>;

type ResolutionAttempt = {
	resolved: AcceptedAutoMappingResult | null;
	confidence?: number;
};

type NetworkResolutionContext = {
	provider: Provider;
	anilistId: AniListId;
	options: AutoMappingOptions;
	credentials: ProviderCredentials;
	hints: AutoMappingOptions["hints"] | undefined;
	priority: RequestPriority | undefined;
	forceLookupNetwork: boolean;
};

type MediaResolutionContext = NetworkResolutionContext & {
	media: AniListMedia;
};

export type ResolveAutoMappingDeps = {
	anilistApi: AniListMediaService;
	lookupClients: ProviderTitleLookupRegistry;
	log: ScopedLogger;
	getConfiguredCredentials: (
		provider: Provider,
	) => Promise<ProviderCredentials>;
	isCandidateSuppressed: (
		provider: Provider,
		anilistId: AniListId,
		providerId: ProviderExternalId,
		reason: AcceptedMappingReason,
	) => boolean;
};

export async function resolveAutoMapping(
	deps: ResolveAutoMappingDeps,
	provider: Provider,
	anilistId: AniListId,
	options: AutoMappingOptions,
): Promise<AcceptedAutoMappingResult | null> {
	if (options.network === "never") {
		throw createError(
			ErrorCode.VALIDATION_ERROR,
			`AniList ID ${anilistId} requires a network lookup but network access is disabled.`,
			`Unable to resolve this title without contacting ${getProviderLabel(provider)}.`,
			{ reason: "network-disabled", provider },
		);
	}

	const credentials = await deps.getConfiguredCredentials(provider);
	const context: NetworkResolutionContext = {
		provider,
		anilistId,
		options,
		credentials,
		hints: options.hints,
		priority: options.priority,
		forceLookupNetwork: options.forceLookupNetwork === true,
	};

	const attempt = await resolveViaNetwork(deps, context);

	if (attempt.resolved === null) {
		deps.log.debug?.(
			`mapping:auto-resolution-outcome provider=${provider} anilistId=${anilistId} state=unresolved reason=no-match`,
		);
		return null;
	}

	deps.log.debug?.(
		`mapping:auto-resolution-outcome provider=${provider} anilistId=${anilistId} state=mapped providerId=${attempt.resolved.providerId} reason=${attempt.resolved.reason}${attempt.confidence === undefined ? "" : ` confidence=${attempt.confidence.toFixed(3)}`}`,
	);

	return attempt.resolved;
}

async function resolveViaNetwork(
	deps: ResolveAutoMappingDeps,
	context: NetworkResolutionContext,
): Promise<ResolutionAttempt> {
	const { provider, anilistId } = context;

	const applyAttempt = (
		label: string,
		attempt: ResolutionAttempt,
	): ResolutionAttempt | null => {
		const resolved = attempt.resolved;
		if (resolved === null) {
			return null;
		}

		if (
			!deps.isCandidateSuppressed(
				provider,
				anilistId,
				resolved.providerId,
				resolved.reason,
			)
		) {
			return attempt;
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
	const directPrequelIds = new Set(directPrequelMedia.map((media) => media.id));

	for (const relationMedia of directPrequelMedia) {
		const relationAttempt = await tryResolveWithMedia(
			deps,
			{ ...context, media: relationMedia },
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
			{ ...context, media: prequelMedia },
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
			isCandidateSuppressed: (providerId, reason) =>
				deps.isCandidateSuppressed(
					provider,
					context.anilistId,
					providerId,
					reason,
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
