/** Sonarr-specific manual mapping search panel for the media modal. */
// src/features/media-modal/sonarr/sonarr-mapping-panel.tsx

import { useState } from "react";
import { getProviderRouteSlug } from "@/providers/provider-route-slug";
import { parseTvdbId } from "@/providers/schemas";
import type { SonarrLookupSeries } from "@/providers/sonarr/types";
import { useSonarrLookupSearch } from "@/queries/sonarr";
import type { SonarrLookupOutput } from "@/rpc/types";
import {
	MappingSearchShell,
	type MappingPanelProps,
} from "../mapping/mapping-search-shell";
import { normalizeLinkedAniListIds, pickProviderPoster } from "../helpers";
import type { MediaModalTargetSummary } from "../types";

const PROVIDER = "sonarr" as const;

/** Prefer lookup stats once they report files; otherwise use cached library stats. */
function resolveStats(
	series: SonarrLookupSeries,
	cachedStats: NonNullable<SonarrLookupOutput["statsMap"]>[number] | undefined,
): { episodeCount?: number; episodeFileCount?: number } {
	const lookupStats = series.statistics;
	const stats =
		(lookupStats?.episodeFileCount ?? 0) > 0
			? lookupStats
			: (cachedStats ?? lookupStats);
	const episodeCount = stats?.episodeCount ?? stats?.totalEpisodeCount;

	return {
		...(episodeCount === undefined ? {} : { episodeCount }),
		...(stats?.episodeFileCount === undefined
			? {}
			: { episodeFileCount: stats.episodeFileCount }),
	};
}

function buildCandidate(
	series: SonarrLookupSeries,
	data: SonarrLookupOutput,
): MediaModalTargetSummary {
	const tvdbId = parseTvdbId(series.tvdbId);
	const isInLibrary = data.libraryTvdbIds?.includes(tvdbId) ?? null;
	const stats = resolveStats(
		series,
		isInLibrary ? data.statsMap?.[tvdbId] : undefined,
	);
	const providerRouteSlug = isInLibrary
		? (getProviderRouteSlug(PROVIDER, series) ?? undefined)
		: undefined;
	const posterUrl = pickProviderPoster(series);
	const linkedAniListIds = normalizeLinkedAniListIds(
		data.linkedAniListIdsByTvdbId?.[tvdbId],
	);

	return {
		provider: PROVIDER,
		providerId: tvdbId,
		title: series.title,
		isInLibrary,
		...(series.folder ? { providerFolderName: series.folder } : {}),
		...(typeof series.year === "number" ? { year: series.year } : {}),
		...(series.seriesType ? { typeLabel: series.seriesType } : {}),
		...(providerRouteSlug ? { providerRouteSlug } : {}),
		...(posterUrl === undefined ? {} : { posterUrl }),
		...(series.status === undefined ? {} : { statusLabel: series.status }),
		...stats,
		...(series.overview ? { overview: series.overview } : {}),
		...(linkedAniListIds?.length ? { linkedAniListIds } : {}),
	};
}

export function SonarrMappingPanel(
	props: MappingPanelProps,
): React.JSX.Element {
	const [searchTerm, setSearchTerm] = useState("");
	const search = useSonarrLookupSearch({
		term: searchTerm,
		enabled: searchTerm.length > 0,
	});
	const { data } = search;

	return (
		<MappingSearchShell
			{...props}
			provider={PROVIDER}
			searchPlaceholder="Search by series title or TVDB ID..."
			hasSearchTerm={searchTerm.length > 0}
			isFetching={search.isFetching}
			error={search.error}
			candidates={
				data?.results.map((series) => buildCandidate(series, data)) ?? []
			}
			onSearch={setSearchTerm}
		/>
	);
}
