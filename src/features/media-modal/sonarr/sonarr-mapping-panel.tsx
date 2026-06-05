/** Sonarr-specific manual mapping search panel for the media modal. */
// src/features/media-modal/sonarr/sonarr-mapping-panel.tsx

import { useMemo, useState } from "react";
import {
	getProviderExternalIdLabel,
	getProviderLabel,
} from "@/providers/provider-labels";
import { getProviderOpenTarget } from "@/providers/provider-links";
import { getProviderRouteSlug } from "@/providers/provider-route-slug";
import { parseTvdbId, type TvdbId } from "@/providers/schemas";
import type { SonarrLookupSeries } from "@/providers/sonarr/types";
import { openProviderPage } from "@/rpc/provider-page";
import { useSonarrLookupSearch } from "@/queries/sonarr";
import { MappingCandidateRow } from "../mapping/mapping-search-results";
import { MappingSearchShell } from "../mapping/mapping-search-shell";
import { normalizeLinkedAniListIds, pickProviderPoster } from "../helpers";
import type { MediaModalTargetSummary } from "../types";

export type SonarrMappingCandidate = {
	tvdbId: TvdbId;
	result: SonarrLookupSeries;
	summary: MediaModalTargetSummary;
};

type SonarrMappingPanelProps = {
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

function buildCandidate(input: {
	series: SonarrLookupSeries;
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
	const posterUrl = pickProviderPoster(input.series);
	const linkedAniListIds = normalizeLinkedAniListIds(
		input.linkedAniListIdsByTvdbId?.[tvdbId],
	);
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
		...(episodeCount === undefined ? {} : { episodeCount }),
		...(episodeFileCount === undefined ? {} : { episodeFileCount }),
		...(input.series.overview ? { overview: input.series.overview } : {}),
		...(linkedAniListIds?.length ? { linkedAniListIds } : {}),
	};

	return { tvdbId, result: input.series, summary };
}

function getLibraryLabel(input: {
	candidate: SonarrMappingCandidate;
	providerLabel: string;
}): string | null {
	const { candidate, providerLabel } = input;
	if (!candidate.summary.isInLibrary) return null;

	if (
		candidate.summary.episodeFileCount !== undefined &&
		candidate.summary.episodeCount !== undefined
	) {
		return `In ${providerLabel}: ${candidate.summary.episodeFileCount}/${candidate.summary.episodeCount} eps`;
	}

	return `In ${providerLabel}`;
}

export function SonarrMappingPanel(
	props: SonarrMappingPanelProps,
): React.JSX.Element {
	const {
		contentContainer,
		currentTarget,
		selectedCandidate,
		onSelectCandidate,
	} = props;
	const [searchTerm, setSearchTerm] = useState("");
	const search = useSonarrLookupSearch({
		term: searchTerm,
		enabled: searchTerm.length > 0,
	});
	const providerLabel = getProviderLabel(PROVIDER);
	const providerIdLabel = getProviderExternalIdLabel(PROVIDER);
	const candidates = useMemo(
		() =>
			search.data?.results.map((series) =>
				buildCandidate({
					series,
					libraryTvdbIds: search.data?.libraryTvdbIds ?? [],
					linkedAniListIdsByTvdbId: search.data?.linkedAniListIdsByTvdbId,
					statsMap: search.data?.statsMap,
				}),
			) ?? [],
		[search.data],
	);
	const candidatePosterUrls = useMemo(
		() =>
			candidates.flatMap((candidate) =>
				candidate.summary.posterUrl ? [candidate.summary.posterUrl] : [],
			),
		[candidates],
	);

	const handleQueryChange = (): void => {
		setSearchTerm("");
		onSelectCandidate(null);
	};

	return (
		<MappingSearchShell
			providerLabel={providerLabel}
			searchPlaceholder="Search by series title or TVDB ID..."
			hasSearchTerm={searchTerm.length > 0}
			isFetching={search.isFetching}
			resultCount={candidates.length}
			resultImageUrls={candidatePosterUrls}
			onQueryChange={handleQueryChange}
			onSearch={setSearchTerm}
		>
			{candidates.map((candidate) => {
				const summary = candidate.summary;
				const externalLabel = `Open in ${providerLabel}`;
				const isSelected = selectedCandidate?.tvdbId === candidate.tvdbId;

				return (
					<MappingCandidateRow
						key={candidate.tvdbId}
						title={summary.title}
						providerIdLabel={providerIdLabel}
						providerId={summary.providerId}
						contentContainer={contentContainer}
						externalLabel={externalLabel}
						openProvider={() => {
							openProviderPage({
								provider: PROVIDER,
								target: getProviderOpenTarget({
									isInLibrary: summary.isInLibrary,
									providerRouteSlug: summary.providerRouteSlug,
									searchTerm: summary.title,
								}),
							});
						}}
						isCurrent={currentTarget?.providerId === candidate.tvdbId}
						isSelected={isSelected}
						libraryLabel={getLibraryLabel({ candidate, providerLabel })}
						linkedAniListCount={summary.linkedAniListIds?.length}
						onToggleSelection={() =>
							onSelectCandidate(isSelected ? null : candidate)
						}
						posterUrl={summary.posterUrl}
						typeLabel={summary.typeLabel}
						year={summary.year}
					/>
				);
			})}
		</MappingSearchShell>
	);
}
