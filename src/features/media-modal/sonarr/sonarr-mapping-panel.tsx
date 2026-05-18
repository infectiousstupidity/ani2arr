/** Sonarr-specific manual mapping search panel for the media modal. */
// src/features/media-modal/sonarr/sonarr-mapping-panel.tsx

import { useMemo, useState } from "react";
import {
	getProviderExternalIdLabel,
	getProviderLabel,
} from "@/providers/provider-labels";
import { buildProviderOpenUrl } from "@/providers/provider-links";
import { getProviderRouteSlug } from "@/providers/provider-route-slug";
import { parseTvdbId, type TvdbId } from "@/providers/schemas";
import type { SonarrLookupSeries } from "@/providers/sonarr/types";
import { useSonarrLookupSearch } from "@/queries/sonarr";
import { useDebounced } from "@/shared/hooks/use-debounced";
import {
	MappingCandidateRow,
	MappingResultList,
} from "../mapping/mapping-search-results";
import { normalizeLinkedAniListIds, pickProviderPoster } from "../helpers";
import type { MediaModalTargetSummary } from "../types";

export type SonarrMappingCandidate = {
	tvdbId: TvdbId;
	result: SonarrLookupSeries;
	summary: MediaModalTargetSummary;
};

type SonarrMappingPanelProps = {
	baseUrl: string;
	contentContainer: HTMLDivElement | null;
	currentTarget: MediaModalTargetSummary | null;
	selectedCandidate: SonarrMappingCandidate | null;
	onSelectCandidate: (candidate: SonarrMappingCandidate | null) => void;
};

type SonarrResultStats = {
	episodeCount?: number;
	episodeFileCount?: number;
};

const PROVIDER = "sonarr" as const;

function resolveStats(input: {
	series: SonarrLookupSeries;
	statsMap:
		| Record<
				number,
				{
					episodeCount?: number | undefined;
					episodeFileCount?: number | undefined;
					totalEpisodeCount?: number | undefined;
				}
		  >
		| undefined;
	tvdbId: TvdbId;
	isInLibrary: boolean;
}): SonarrResultStats {
	const lookupStats = input.series.statistics;
	const hasLookupStats = (lookupStats?.episodeFileCount ?? 0) > 0;
	const cachedStats = input.isInLibrary
		? input.statsMap?.[input.tvdbId]
		: undefined;
	const stats = hasLookupStats ? lookupStats : (cachedStats ?? lookupStats);
	const episodeCount = stats?.episodeCount ?? stats?.totalEpisodeCount;

	return {
		...(episodeCount === undefined ? {} : { episodeCount }),
		...(stats?.episodeFileCount === undefined
			? {}
			: { episodeFileCount: stats.episodeFileCount }),
	};
}

function getAlternateTitles(
	series: SonarrLookupSeries,
): MediaModalTargetSummary["alternateTitles"] {
	const titles = series.alternateTitles
		?.map((entry) => entry?.title?.trim())
		.filter((title): title is string => !!title);

	return titles?.length ? titles : undefined;
}

function buildCandidate(input: {
	series: SonarrLookupSeries;
	baseUrl: string;
	libraryTvdbIds: number[];
	linkedAniListIdsByTvdbId: Record<number, number[]> | undefined;
	statsMap:
		| Record<
				number,
				{
					episodeCount?: number | undefined;
					episodeFileCount?: number | undefined;
					totalEpisodeCount?: number | undefined;
				}
		  >
		| undefined;
}): SonarrMappingCandidate {
	const tvdbId = parseTvdbId(input.series.tvdbId);
	const isInLibrary = input.libraryTvdbIds.includes(tvdbId);
	const { episodeCount, episodeFileCount } = resolveStats({
		series: input.series,
		statsMap: input.statsMap,
		tvdbId,
		isInLibrary,
	});
	const providerRouteSlug = isInLibrary
		? (getProviderRouteSlug(PROVIDER, input.series) ?? undefined)
		: undefined;
	const posterUrl = pickProviderPoster(input.series, input.baseUrl);
	const linkedAniListIds = normalizeLinkedAniListIds(
		input.linkedAniListIdsByTvdbId?.[tvdbId],
	);
	const alternateTitles = getAlternateTitles(input.series);
	const summary: MediaModalTargetSummary = {
		provider: PROVIDER,
		providerId: tvdbId,
		title: input.series.title,
		isInLibrary,
		...(input.series.folder ? { providerFolderName: input.series.folder } : {}),
		...(typeof input.series.year === "number" ? { year: input.series.year } : {}),
		...(input.series.seriesType ? { typeLabel: input.series.seriesType } : {}),
		...(providerRouteSlug ? { providerRouteSlug } : {}),
		...(posterUrl === undefined ? {} : { posterUrl }),
		...(input.series.status === undefined
			? {}
			: { statusLabel: input.series.status }),
		...(input.series.network === undefined
			? {}
			: { networkOrStudio: input.series.network }),
		...(episodeCount === undefined ? {} : { episodeCount }),
		...(episodeFileCount === undefined ? {} : { episodeFileCount }),
		...(input.series.overview ? { overview: input.series.overview } : {}),
		...(alternateTitles ? { alternateTitles } : {}),
		...(linkedAniListIds?.length ? { linkedAniListIds } : {}),
	};

	return { tvdbId, result: input.series, summary };
}

function getResultLink(input: {
	candidate: SonarrMappingCandidate;
	baseUrl: string;
}): string | null {
	return buildProviderOpenUrl({
		provider: PROVIDER,
		baseUrl: input.baseUrl,
		isInLibrary: input.candidate.summary.isInLibrary,
		...(input.candidate.summary.providerRouteSlug
			? { providerRouteSlug: input.candidate.summary.providerRouteSlug }
			: {}),
		searchTerm: input.candidate.summary.title,
	});
}

function getLibraryLabel(input: {
	candidate: SonarrMappingCandidate;
	providerLabel: string;
}): string | null {
	const { candidate, providerLabel } = input;
	if (!candidate.summary.isInLibrary) return null;

	return `In ${providerLabel}${
		candidate.summary.episodeFileCount
			? ` - ${candidate.summary.episodeFileCount} eps`
			: ""
	}`;
}

export function SonarrMappingPanel(
	props: SonarrMappingPanelProps,
): React.JSX.Element {
	const {
		baseUrl,
		contentContainer,
		currentTarget,
		selectedCandidate,
		onSelectCandidate,
	} = props;
	const [query, setQuery] = useState("");
	const debouncedQuery = useDebounced(query, 300).trim();
	const search = useSonarrLookupSearch({
		term: debouncedQuery,
		enabled: debouncedQuery.length >= 2,
	});
	const providerLabel = getProviderLabel(PROVIDER);
	const providerIdLabel = getProviderExternalIdLabel(PROVIDER);
	const candidates = useMemo(
		() =>
			search.data?.results.map((series) =>
				buildCandidate({
					series,
					baseUrl,
					libraryTvdbIds: search.data?.libraryTvdbIds ?? [],
					linkedAniListIdsByTvdbId: search.data?.linkedAniListIdsByTvdbId,
					statsMap: search.data?.statsMap,
				}),
			) ?? [],
		[baseUrl, search.data],
	);
	const trimmedQuery = query.trim();
	const showMinimumCharacterMessage =
		query.length > 0 && trimmedQuery.length < 2;
	const canRenderSearchState = showMinimumCharacterMessage === false;
	const showSearchingState =
		canRenderSearchState && search.isFetching && candidates.length === 0;
	const showEmptyState =
		canRenderSearchState && !search.isFetching && candidates.length === 0;

	const handleQueryChange = (nextQuery: string): void => {
		setQuery(nextQuery);
		onSelectCandidate(null);
	};

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden px-4 pt-4">
			<div className="shrink-0 pb-4">
				<div className="space-y-1">
					<p className="text-[11px] font-semibold leading-none uppercase tracking-[0.16em] text-text-secondary">
						Search Sonarr database
					</p>
					<p className="text-xs text-text-secondary">
						Search results update the target preview on the right.
					</p>
				</div>

				<div className="mt-3">
					<input
						value={query}
						onChange={(event) => handleQueryChange(event.target.value)}
						placeholder={`Search ${providerLabel} title or ${providerIdLabel}...`}
						className="w-full rounded-xl border border-border-primary/60 bg-bg-tertiary/80 px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/60 focus:border-accent-primary focus:outline-none"
					/>
				</div>
			</div>

			<div className="min-h-0 flex-1">
				<MappingResultList
					providerLabel={providerLabel}
					query={query}
					showMinimumCharacterMessage={showMinimumCharacterMessage}
					showSearchingState={showSearchingState}
					showEmptyState={showEmptyState}
					canRenderResults={canRenderSearchState}
				>
					{candidates.map((candidate) => {
						const summary = candidate.summary;
						const externalLabel = `Open in ${providerLabel}`;

						return (
							<MappingCandidateRow
								key={candidate.tvdbId}
								title={summary.title}
								providerIdLabel={providerIdLabel}
								providerId={summary.providerId}
								contentContainer={contentContainer}
								externalLabel={externalLabel}
								externalUrl={getResultLink({ candidate, baseUrl })}
								isCurrent={currentTarget?.providerId === candidate.tvdbId}
								isSelected={selectedCandidate?.tvdbId === candidate.tvdbId}
								libraryLabel={getLibraryLabel({ candidate, providerLabel })}
								linkedAniListCount={summary.linkedAniListIds?.length}
								onSelect={() => onSelectCandidate(candidate)}
								posterUrl={summary.posterUrl}
								typeLabel={summary.typeLabel}
								year={summary.year}
							/>
						);
					})}
				</MappingResultList>
			</div>
		</div>
	);
}
