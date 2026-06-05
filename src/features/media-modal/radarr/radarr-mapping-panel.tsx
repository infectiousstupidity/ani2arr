/** Radarr-specific manual mapping search panel for the media modal. */
// src/features/media-modal/radarr/radarr-mapping-panel.tsx

import { useMemo, useState } from "react";
import { parseTmdbId, type TmdbId } from "@/providers/schemas";
import {
	getProviderExternalIdLabel,
	getProviderLabel,
} from "@/providers/provider-labels";
import { getProviderOpenTarget } from "@/providers/provider-links";
import { getProviderRouteSlug } from "@/providers/provider-route-slug";
import type { RadarrLookupMovie } from "@/providers/radarr/types";
import { openProviderPage } from "@/rpc/provider-page";
import { useRadarrLookupSearch } from "@/queries/radarr";
import { MappingCandidateRow } from "../mapping/mapping-search-results";
import { MappingSearchShell } from "../mapping/mapping-search-shell";
import { normalizeLinkedAniListIds, pickProviderPoster } from "../helpers";
import type { MediaModalTargetSummary } from "../types";

export type RadarrMappingCandidate = {
	tmdbId: TmdbId;
	result: RadarrLookupMovie;
	summary: MediaModalTargetSummary;
};

type RadarrMappingPanelProps = {
	contentContainer: HTMLDivElement | null;
	currentTarget: MediaModalTargetSummary | null;
	selectedCandidate: RadarrMappingCandidate | null;
	onSelectCandidate: (candidate: RadarrMappingCandidate | null) => void;
};

const PROVIDER = "radarr" as const;

function buildCandidate(input: {
	movie: RadarrLookupMovie;
	libraryTmdbIds: number[];
	linkedAniListIdsByTmdbId: Record<number, number[]> | undefined;
}): RadarrMappingCandidate {
	const tmdbId = parseTmdbId(input.movie.tmdbId);
	const isInLibrary = input.libraryTmdbIds.includes(tmdbId);
	const providerRouteSlug = isInLibrary
		? (getProviderRouteSlug(PROVIDER, input.movie) ?? undefined)
		: undefined;
	const posterUrl = pickProviderPoster(input.movie);
	const linkedAniListIds = normalizeLinkedAniListIds(
		input.linkedAniListIdsByTmdbId?.[tmdbId],
	);
	const summary: MediaModalTargetSummary = {
		provider: PROVIDER,
		providerId: tmdbId,
		title: input.movie.title,
		isInLibrary,
		typeLabel: "Movie",
		...(input.movie.folderName
			? { providerFolderName: input.movie.folderName }
			: {}),
		...(typeof input.movie.year === "number" ? { year: input.movie.year } : {}),
		...(providerRouteSlug ? { providerRouteSlug } : {}),
		...(posterUrl === undefined ? {} : { posterUrl }),
		...(input.movie.status === undefined
			? {}
			: { statusLabel: input.movie.status }),
		...(input.movie.overview ? { overview: input.movie.overview } : {}),
		...(typeof input.movie.runtime === "number"
			? { runtimeMinutes: input.movie.runtime }
			: {}),
		...(input.movie.hasFile === undefined
			? {}
			: { hasFile: input.movie.hasFile }),
		...(linkedAniListIds?.length ? { linkedAniListIds } : {}),
	};

	return { tmdbId, result: input.movie, summary };
}

function getLibraryLabel(input: {
	candidate: RadarrMappingCandidate;
	providerLabel: string;
}): string | null {
	const { candidate, providerLabel } = input;
	if (!candidate.summary.isInLibrary) return null;

	if (candidate.summary.hasFile !== undefined) {
		return `In ${providerLabel}: ${candidate.summary.hasFile ? "1 file" : "0 files"}`;
	}

	return `In ${providerLabel}`;
}

export function RadarrMappingPanel(
	props: RadarrMappingPanelProps,
): React.JSX.Element {
	const {
		contentContainer,
		currentTarget,
		selectedCandidate,
		onSelectCandidate,
	} = props;
	const [searchTerm, setSearchTerm] = useState("");
	const search = useRadarrLookupSearch({
		term: searchTerm,
		enabled: searchTerm.length > 0,
	});
	const providerLabel = getProviderLabel(PROVIDER);
	const providerIdLabel = getProviderExternalIdLabel(PROVIDER);
	const candidates = useMemo(
		() =>
			search.data?.results.map((movie) =>
				buildCandidate({
					movie,
					libraryTmdbIds: search.data?.libraryTmdbIds ?? [],
					linkedAniListIdsByTmdbId: search.data?.linkedAniListIdsByTmdbId,
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
			searchPlaceholder="Search by movie title or TMDB ID..."
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
				const isSelected = selectedCandidate?.tmdbId === candidate.tmdbId;

				return (
					<MappingCandidateRow
						key={candidate.tmdbId}
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
						isCurrent={currentTarget?.providerId === candidate.tmdbId}
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
