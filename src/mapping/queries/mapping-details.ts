/** Builds one mapping-owned inspection payload without re-running provider resolution. */
// src/mapping/queries/mapping-details.ts
// eslint-disable-max-params

import type { AniListId } from "@/anilist";
import { resolveTitlePreference } from "@/anilist/title-preference";
import type { AniListMetadata } from "@/anilist/schemas/metadata.schema";
import type { AniListMediaFormat } from "@/anilist/schemas/media.schema";
import {
	type RadarrMovieSnapshot,
	type Provider,
	type TmdbId,
	type TvdbId,
} from "@/providers";
import type { SonarrSeriesSnapshot } from "@/providers/sonarr/types";
import type {
	AcceptedMappingEvidence,
	AcceptedMappingReason,
	AcceptedMappingSource,
	ProviderExternalId,
} from "@/mapping/types";
import type {
	AutoMappingRecord,
	AutoMappingStatus,
} from "@/mapping/auto-mapping/types";
import {
	buildEffectiveMapping,
	type EffectiveMapping,
} from "@/mapping/effective-mapping";
import {
	collectLinkedAniListIds,
	getMappingSource,
} from "@/mapping/queries/mapping-sources";
import {
	deriveLibraryUnknownReason,
	type LibraryUnknownReason,
} from "@/providers/library/types";
import { deriveMappingRowStatus } from "@/features/provider-action";
import type {
	MappingIssue,
	MappingIssueReason,
	MappingIssuesSummary,
} from "./mapping-issues";
import { projectMappingIssues } from "./mapping-issues";
import type { MappingListRowStatus } from "./list-mappings";

export interface GetMappingInspectionInput {
	provider: Provider;
	anilistId: AniListId;
}

export interface GetMappingInspectionDeps {
	manualMappingService: {
		get<P extends Provider>(
			provider: P,
			anilistId: AniListId,
		): ProviderExternalId | null;
		isIgnored(provider: Provider, anilistId: AniListId): boolean;
		listRejectedCandidates(provider?: Provider): Array<{
			anilistId: AniListId;
			provider: Provider;
			providerId: ProviderExternalId;
			updatedAt: number;
		}>;
		getLinkedAniListIds<P extends Provider>(
			provider: P,
			providerId: ProviderExternalId,
		): AniListId[];
	};
	anibridgeMappingStore: {
		getSonarrCandidates(anilistId: AniListId): TvdbId[];
		getRadarrCandidates(anilistId: AniListId): TmdbId[];
		getAniListIdsForTvdb(tvdbId: TvdbId): AniListId[];
		getAniListIdsForTmdb(tmdbId: TmdbId): AniListId[];
	};
	autoMappingStore: {
		get(
			provider: Provider,
			anilistId: AniListId,
		): Promise<AutoMappingRecord | null>;
		list(
			provider?: Provider,
		): Promise<
			Array<AutoMappingRecord & { anilistId: AniListId; provider: Provider }>
		>;
	};
	anilistMetadataStore: {
		getMetadata(
			ids: number[],
			options?: {
				refreshStale?: boolean;
				maxBatch?: number;
				fetchMissing?: boolean;
			},
		): Promise<{ metadata: AniListMetadata[]; missingIds?: number[] }>;
	};
	sonarrLibrary: {
		getLeanSeriesList(): Promise<SonarrSeriesSnapshot[]>;
	};
	radarrLibrary: {
		getLeanMovieList(): Promise<RadarrMovieSnapshot[]>;
	};
}

interface MappingDetailsLibrarySnapshot {
	isInLibrary: boolean | null;
	title?: string;
	type?: "series" | "movie";
	statusLabel?: string;
	inLibraryCount?: number;
	libraryUnknownReason?: LibraryUnknownReason;
}

interface MappingDetailsLinkedAniListEntry {
	anilistId: AniListId;
	title?: string;
	format?: AniListMediaFormat | null;
	year?: number | null;
	relation?: "current";
}

interface MappingDetailsExplanationItem {
	kind: "effective-source" | "suppression" | "resolver-outcome" | "review";
	summary: string;
	source?: AcceptedMappingSource;
	reason?: AcceptedMappingReason;
	resolverOutcome?: AutoMappingStatus;
	reviewReason?: MappingIssueReason;
	suppressedProviderId?: ProviderExternalId;
	details?: readonly string[];
}

interface MappingDetailsReview {
	needsReview: boolean;
	summary?: MappingIssuesSummary;
	items?: readonly MappingIssue[];
}

interface MappingDetailsProviderLinks {
	provider: Provider;
	providerId: ProviderExternalId | null;
	linkedAniListIds: readonly AniListId[];
	linkedAniListCount: number;
}

export interface MappingDetailsPayload {
	effectiveMapping: EffectiveMapping & {
		isInLibrary: boolean | null;
		mappingRowStatus: MappingListRowStatus;
		resolverOutcome?: AutoMappingStatus;
		libraryUnknownReason?: LibraryUnknownReason;
		evidence?: AcceptedMappingEvidence;
		library?: MappingDetailsLibrarySnapshot;
	};
	providerContext: MappingDetailsProviderLinks;
	linkedAniListEntries: readonly MappingDetailsLinkedAniListEntry[];
	whyThisMapping: readonly MappingDetailsExplanationItem[];
	review: MappingDetailsReview;
}

const buildLibrarySummary = (input: {
	provider: Provider;
	providerMappingState: EffectiveMapping["providerMappingState"];
	isInLibrary: boolean | null;
	libraryEntry: SonarrSeriesSnapshot | RadarrMovieSnapshot | null;
	libraryUnknownReason?: "library-check-failed";
}): MappingDetailsLibrarySnapshot => {
	const {
		provider,
		providerMappingState,
		isInLibrary,
		libraryEntry,
		libraryUnknownReason,
	} = input;
	if (libraryEntry === null) {
		return {
			isInLibrary: providerMappingState === "mapped" ? isInLibrary : null,
			...(libraryUnknownReason ? { libraryUnknownReason } : {}),
		};
	}

	if (provider === "sonarr") {
		const series = libraryEntry as SonarrSeriesSnapshot;
		let inLibraryCount: number | undefined;
		if (series.statistics?.episodeCount !== undefined) {
			inLibraryCount = series.statistics.episodeCount;
		} else if (series.statistics?.episodeFileCount !== undefined) {
			inLibraryCount = series.statistics.episodeFileCount;
		}

		return {
			isInLibrary,
			...(series.title ? { title: series.title } : {}),
			type: "series",
			...(series.status ? { statusLabel: series.status } : {}),
			...(inLibraryCount === undefined ? {} : { inLibraryCount }),
			...(libraryUnknownReason ? { libraryUnknownReason } : {}),
		};
	}

	const movie = libraryEntry as RadarrMovieSnapshot;
	let inLibraryCount: number | undefined;
	if (movie.hasFile !== undefined) {
		inLibraryCount = movie.hasFile ? 1 : 0;
	}

	return {
		isInLibrary,
		...(movie.title ? { title: movie.title } : {}),
		type: "movie",
		...(movie.status ? { statusLabel: movie.status } : {}),
		...(inLibraryCount === undefined ? {} : { inLibraryCount }),
		...(libraryUnknownReason ? { libraryUnknownReason } : {}),
	};
};

const formatReviewReason = (reason: MappingIssueReason): string => {
	switch (reason) {
		case "manual-upstream-disagreement": {
			return "Manual mapping conflicts with exact upstream mapping.";
		}
		case "ignored-but-exact-upstream": {
			return "Ignored entry now has an exact upstream mapping.";
		}
	}
};

const buildExplanationItems = (
	candidate: EffectiveMapping,
	reviewReasons: readonly MappingIssueReason[],
): MappingDetailsExplanationItem[] => {
	const items: MappingDetailsExplanationItem[] = [];
	const evidence = candidate.acceptedEvidence;

	if (evidence) {
		const details: string[] = [];
		if (evidence.successfulTitle) {
			details.push(`Matched with title "${evidence.successfulTitle}".`);
		}

		let summary = "Accepted mapping is currently effective.";
		switch (evidence.reason) {
			case "exact-upstream": {
				summary = "Exact upstream mapping is currently effective.";
				break;
			}
			case "manual-override": {
				summary = "Manual mapping is currently effective.";
				break;
			}
			case "exact-title-match": {
				summary = "Automatic exact title match is currently effective.";
				break;
			}
			case "fuzzy-match": {
				summary = "Fuzzy fallback match is currently effective.";
				break;
			}
		}

		items.push({
			kind: "effective-source",
			summary,
			source: evidence.source,
			reason: evidence.reason,
			...(details.length > 0 ? { details } : {}),
		});
	}

	if (candidate.suppressionKind === "ignored-entry") {
		items.push({
			kind: "suppression",
			summary: "This AniList entry is currently ignored for this provider.",
		});
	} else if (
		candidate.suppressionKind === "rejected-candidate" &&
		candidate.suppressedProviderId
	) {
		items.push({
			kind: "suppression",
			summary: `Candidate ${candidate.suppressedProviderId} was rejected for this AniList entry.`,
			suppressedProviderId: candidate.suppressedProviderId,
		});
	}

	if (candidate.autoMappingStatus && candidate.autoMappingStatus !== "mapped") {
		let summary = "No effective mapping is currently resolved.";
		switch (candidate.autoMappingStatus) {
			case "ambiguous": {
				summary = "Resolution is currently ambiguous.";
				break;
			}
			case "unresolved": {
				summary =
					"No acceptable mapping was accepted in the last resolution attempt.";
				break;
			}
		}
		items.push({
			kind: "resolver-outcome",
			summary,
			resolverOutcome: candidate.autoMappingStatus,
		});
	}

	for (const reason of reviewReasons) {
		items.push({
			kind: "review",
			summary: formatReviewReason(reason),
			reviewReason: reason,
		});
	}

	if (items.length === 0) {
		items.push({
			kind: "resolver-outcome",
			summary:
				"No effective mapping is currently stored for this AniList entry.",
		});
	}

	return items;
};

const buildLinkedAniListEntries = (
	anilistId: AniListId,
	linkedAniListIds: readonly AniListId[],
	metadataById: Map<AniListId, AniListMetadata>,
): MappingDetailsLinkedAniListEntry[] =>
	linkedAniListIds.map((linkedAniListId) => {
		const metadata = metadataById.get(linkedAniListId);
		const title = metadata
			? resolveTitlePreference({ titles: metadata.titles }).primary
			: undefined;

		return {
			anilistId: linkedAniListId,
			...(title ? { title } : {}),
			...(metadata?.format === undefined ? {} : { format: metadata.format }),
			...(metadata?.seasonYear === undefined
				? {}
				: { year: metadata.seasonYear }),
			...(linkedAniListId === anilistId ? { relation: "current" } : {}),
		};
	});

// eslint-disable-next-line complexity
export async function getMappingInspection(
	input: GetMappingInspectionInput,
	deps: GetMappingInspectionDeps,
): Promise<MappingDetailsPayload> {
	const [mappingSource, seriesListResult, movieListResult] = await Promise.all([
		getMappingSource(input.provider, input.anilistId, deps),
		input.provider === "sonarr"
			? deps.sonarrLibrary.getLeanSeriesList().then(
					(items) => ({ ok: true as const, items }),
					() => ({ ok: false as const, items: [] as SonarrSeriesSnapshot[] }),
				)
			: Promise.resolve({
					ok: true as const,
					items: [] as SonarrSeriesSnapshot[],
				}),
		input.provider === "radarr"
			? deps.radarrLibrary.getLeanMovieList().then(
					(items) => ({ ok: true as const, items }),
					() => ({ ok: false as const, items: [] as RadarrMovieSnapshot[] }),
				)
			: Promise.resolve({
					ok: true as const,
					items: [] as RadarrMovieSnapshot[],
				}),
	]);

	const candidate = buildEffectiveMapping({
		provider: input.provider,
		anilistId: input.anilistId,
		manualProviderId: mappingSource.manualMappedProviderId,
		ignored: mappingSource.ignored,
		upstreamProviderIds: mappingSource.upstreamProviderIds,
		rejectedCandidateProviderId: mappingSource.rejectedCandidateProviderId,
		autoMappingRecord: mappingSource.autoMappingRecord,
	});

	let libraryEntry: SonarrSeriesSnapshot | RadarrMovieSnapshot | null = null;
	if (candidate.providerId !== null) {
		libraryEntry =
			input.provider === "sonarr"
				? (seriesListResult.items.find(
						(series) => series.tvdbId === candidate.providerId,
					) ?? null)
				: (movieListResult.items.find(
						(movie) => movie.tmdbId === candidate.providerId,
					) ?? null);
	}
	const libraryLookupFailed =
		candidate.providerId !== null &&
		((input.provider === "sonarr" && !seriesListResult.ok) ||
			(input.provider === "radarr" && !movieListResult.ok));
	let isInLibrary: boolean | null = null;
	if (candidate.providerMappingState === "mapped") {
		if (libraryEntry) {
			isInLibrary = true;
		} else if (libraryLookupFailed) {
			isInLibrary = null;
		} else {
			isInLibrary = false;
		}
	}
	const libraryUnknownReason = deriveLibraryUnknownReason({
		providerMappingState: candidate.providerMappingState,
		isInLibrary,
		...(libraryLookupFailed
			? { libraryUnknownReason: "library-check-failed" as const }
			: {}),
	});
	const library = buildLibrarySummary({
		provider: input.provider,
		providerMappingState: candidate.providerMappingState,
		isInLibrary,
		libraryEntry,
		...(libraryUnknownReason ? { libraryUnknownReason } : {}),
	});
	const linkedAniListIds =
		candidate.providerId === null
			? []
			: await collectLinkedAniListIds(
					input.provider,
					candidate.providerId,
					deps,
				);
	const linkedIdsWithCurrent =
		candidate.providerId === null
			? []
			: [...new Set([input.anilistId, ...linkedAniListIds])].toSorted(
					(left, right) => left - right,
				);
	const linkedMetadata =
		linkedIdsWithCurrent.length > 0
			? await deps.anilistMetadataStore.getMetadata(linkedIdsWithCurrent, {
					refreshStale: false,
					fetchMissing: false,
				})
			: { metadata: [] as AniListMetadata[] };
	const metadataById = new Map(
		linkedMetadata.metadata.map((entry) => [entry.id, entry] as const),
	);

	const reviewProjection = projectMappingIssues({
		mappingEntryKind: candidate.mappingEntryKind,
		providerId: candidate.providerId,
		...(candidate.acceptedEvidence
			? { acceptedEvidence: candidate.acceptedEvidence }
			: {}),
		...(candidate.autoMappingStatus
			? { autoMappingStatus: candidate.autoMappingStatus }
			: {}),
		...(candidate.exactUpstreamMatchProviderId === undefined
			? {}
			: {
					exactUpstreamMatchProviderId: candidate.exactUpstreamMatchProviderId,
				}),
	});

	const mappingRowStatus = deriveMappingRowStatus({
		...(reviewProjection.reviewSummary
			? { reviewSummary: reviewProjection.reviewSummary }
			: {}),
		...(candidate.suppressionKind
			? { suppressionKind: candidate.suppressionKind }
			: {}),
		providerMappingState: candidate.providerMappingState,
		isInLibrary,
	});

	return {
		effectiveMapping: {
			provider: input.provider,
			anilistId: input.anilistId,
			providerId: candidate.providerId,
			providerMappingState: candidate.providerMappingState,
			isInLibrary,
			...(candidate.suppressedProviderId === undefined
				? {}
				: { suppressedProviderId: candidate.suppressedProviderId }),
			mappingRowStatus,
			mappingEntryKind: candidate.mappingEntryKind,
			...(candidate.acceptedEvidence?.source
				? { mappingSource: candidate.acceptedEvidence.source }
				: {}),
			...(candidate.acceptedEvidence?.reason
				? { mappingReason: candidate.acceptedEvidence.reason }
				: {}),
			...(candidate.autoMappingStatus
				? { resolverOutcome: candidate.autoMappingStatus }
				: {}),
			...(candidate.suppressionKind
				? { suppressionKind: candidate.suppressionKind }
				: {}),
			...(candidate.mappingUnknownReason
				? { mappingUnknownReason: candidate.mappingUnknownReason }
				: {}),
			...(libraryUnknownReason ? { libraryUnknownReason } : {}),
			...(candidate.hadResolveAttempt ? { hadResolveAttempt: true } : {}),
			...(candidate.acceptedEvidence
				? { evidence: candidate.acceptedEvidence }
				: {}),
			library,
		},
		providerContext: {
			provider: input.provider,
			providerId: candidate.providerId,
			linkedAniListIds: linkedIdsWithCurrent,
			linkedAniListCount: linkedIdsWithCurrent.length,
		},
		linkedAniListEntries: buildLinkedAniListEntries(
			input.anilistId,
			linkedIdsWithCurrent,
			metadataById,
		),
		whyThisMapping: buildExplanationItems(
			candidate,
			reviewProjection.reviewSummary?.reasons ?? [],
		),
		review: {
			needsReview: reviewProjection.reviewSummary !== undefined,
			...(reviewProjection.reviewSummary
				? { summary: reviewProjection.reviewSummary }
				: {}),
			...(reviewProjection.reviewItems
				? { items: reviewProjection.reviewItems }
				: {}),
		},
	};
}
