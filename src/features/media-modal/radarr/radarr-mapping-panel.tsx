/** Radarr-specific manual mapping search panel for the media modal. */
// src/features/media-modal/radarr/radarr-mapping-panel.tsx

import { useMemo, useState } from "react";
import { parseTmdbId, type TmdbId } from "@/providers/schemas";
import {
	getProviderExternalIdLabel,
	getProviderLabel,
} from "@/providers/provider-labels";
import { buildProviderOpenUrl } from "@/providers/provider-links";
import { getProviderRouteSlug } from "@/providers/provider-route-slug";
import type { RadarrLookupMovie } from "@/providers/radarr/types";
import { useRadarrLookupSearch } from "@/queries/radarr";
import { useDebounced } from "@/shared/hooks/use-debounced";
import {
	MappingCandidateRow,
	MappingResultList,
} from "../mapping/mapping-search-results";
import { normalizeLinkedAniListIds, pickProviderPoster } from "../helpers";
import type { MediaModalTargetSummary } from "../types";

export type RadarrMappingCandidate = {
	tmdbId: TmdbId;
	result: RadarrLookupMovie;
	summary: MediaModalTargetSummary;
};

type RadarrMappingPanelProps = {
	baseUrl: string;
	contentContainer: HTMLDivElement | null;
	currentTarget: MediaModalTargetSummary | null;
	selectedCandidate: RadarrMappingCandidate | null;
	onSelectCandidate: (candidate: RadarrMappingCandidate | null) => void;
};

const PROVIDER = "radarr" as const;

function getAlternateTitles(movie: RadarrLookupMovie): string[] | undefined {
	const titles = movie.alternateTitles
		?.map((title) => title?.title)
		.filter(
			(title): title is string =>
				typeof title === "string" && title.length > 0,
		);

	return titles?.length ? titles : undefined;
}

function buildCandidate(input: {
	movie: RadarrLookupMovie;
	baseUrl: string;
	libraryTmdbIds: number[];
	linkedAniListIdsByTmdbId: Record<number, number[]> | undefined;
}): RadarrMappingCandidate {
	const tmdbId = parseTmdbId(input.movie.tmdbId);
	const isInLibrary = input.libraryTmdbIds.includes(tmdbId);
	const providerRouteSlug = isInLibrary
		? (getProviderRouteSlug(PROVIDER, input.movie) ?? undefined)
		: undefined;
	const posterUrl = pickProviderPoster(input.movie, input.baseUrl);
	const linkedAniListIds = normalizeLinkedAniListIds(
		input.linkedAniListIdsByTmdbId?.[tmdbId],
	);
	const alternateTitles = getAlternateTitles(input.movie);
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
		...(alternateTitles ? { alternateTitles } : {}),
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

function getResultLink(input: {
	candidate: RadarrMappingCandidate;
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
	candidate: RadarrMappingCandidate;
	providerLabel: string;
}): string | null {
	const { candidate, providerLabel } = input;
	if (!candidate.summary.isInLibrary) return null;

	return `In ${providerLabel}${candidate.summary.hasFile ? " - has file" : ""}`;
}

export function RadarrMappingPanel(
	props: RadarrMappingPanelProps,
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
	const search = useRadarrLookupSearch({
		term: debouncedQuery,
		enabled: debouncedQuery.length >= 2,
	});
	const providerLabel = getProviderLabel(PROVIDER);
	const providerIdLabel = getProviderExternalIdLabel(PROVIDER);
	const candidates = useMemo(
		() =>
			search.data?.results.map((movie) =>
				buildCandidate({
					movie,
					baseUrl,
					libraryTmdbIds: search.data?.libraryTmdbIds ?? [],
					linkedAniListIdsByTmdbId: search.data?.linkedAniListIdsByTmdbId,
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
						Search Radarr database
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
								key={candidate.tmdbId}
								title={summary.title}
								providerIdLabel={providerIdLabel}
								providerId={summary.providerId}
								contentContainer={contentContainer}
								externalLabel={externalLabel}
								externalUrl={getResultLink({ candidate, baseUrl })}
								isCurrent={currentTarget?.providerId === candidate.tmdbId}
								isSelected={selectedCandidate?.tmdbId === candidate.tmdbId}
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
