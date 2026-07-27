/** Seerr target search pane with expected-type filtering and result rows. */
// src/features/media-modal/seerr/seerr-change-target-main-pane.tsx

import { Search } from "lucide-react";
import type { SubmitEvent } from "react";
import type { SeerrSearchResult } from "@/providers/seerr/types";
import type { SeerrRequestTarget } from "@/rpc/types";
import Button from "@/shared/ui/primitives/button";
import { MappingCandidateRow } from "../mapping/mapping-search-results";
import type { AniListHeaderData } from "../types";
import {
	filterSeerrSearchResults,
	getExpectedSeerrMediaType,
	getTmdbPosterUrl,
} from "./seerr-selection";

export function SeerrChangeTargetMainPane(props: {
	contentContainer: HTMLDivElement | null;
	defaultQuery: string;
	currentTarget: SeerrRequestTarget | null;
	format: AniListHeaderData["format"];
	isConfigured: boolean;
	selectedResult: SeerrSearchResult | null;
	searchQuery: string;
	setSearchQuery: (query: string) => void;
	onSearch: (query: string) => void;
	searchResults: readonly SeerrSearchResult[];
	isSearching: boolean;
	searchError: string | null;
	onSelectResult: (result: SeerrSearchResult) => void;
}): React.JSX.Element {
	const {
		contentContainer,
		defaultQuery,
		currentTarget,
		format,
		isConfigured,
		selectedResult,
		searchQuery,
		setSearchQuery,
		onSearch,
		searchResults,
		isSearching,
		searchError,
		onSelectResult,
	} = props;
	const expectedMediaType = getExpectedSeerrMediaType({
		currentTargetMediaType: currentTarget?.mediaType,
		format,
	});
	const visibleResults = filterSeerrSearchResults({
		results: searchResults,
		expectedMediaType,
	});
	const handleSubmit = (event: SubmitEvent<HTMLFormElement>): void => {
		event.preventDefault();
		if (!event.isTrusted) return;
		onSearch(searchQuery);
	};

	return (
		<div className="flex h-80 min-h-0 flex-col overflow-hidden pt-4 md:h-full">
			<p className="text-sm font-semibold text-text-primary">
				Search Seerr database
			</p>
			<form className="mt-3 flex gap-2" onSubmit={handleSubmit}>
				<input
					value={searchQuery}
					onChange={(event) => setSearchQuery(event.target.value)}
					placeholder={defaultQuery}
					className="min-w-0 flex-1 rounded-xl border border-border-primary/60 bg-bg-tertiary/80 px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-accent-primary focus:outline-none"
				/>
				<Button
					type="submit"
					size="sm"
					disabled={!isConfigured || searchQuery.trim().length === 0}
					className="h-9 gap-2 rounded-xl px-3"
				>
					<Search size={15} />
					Search
				</Button>
			</form>

			<div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-2">
				{isSearching ? (
					<p className="rounded-lg border border-border-primary/50 bg-bg-tertiary/45 px-3 py-4 text-sm text-text-secondary">
						Searching...
					</p>
				) : null}
				{searchError ? (
					<p className="rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
						{searchError}
					</p>
				) : null}
				{visibleResults.length > 0 ? (
					<div className="flex flex-col gap-2">
						{visibleResults.map((result) => {
							const isSelected =
								selectedResult?.mediaType === result.mediaType &&
								selectedResult.tmdbId === result.tmdbId;
							const isCurrent =
								currentTarget?.mediaType === result.mediaType &&
								currentTarget.tmdbId === result.tmdbId;

							return (
								<MappingCandidateRow
									key={`${result.mediaType}-${result.tmdbId}`}
									title={result.title}
									providerIdLabel="TMDB"
									providerId={result.tmdbId}
									contentContainer={contentContainer}
									externalLabel="Open in Seerr"
									isCurrent={isCurrent}
									isSelected={isSelected}
									onToggleSelection={() => onSelectResult(result)}
									posterUrl={getTmdbPosterUrl(result.posterPath) ?? undefined}
									typeLabel={result.mediaType === "movie" ? "Movie" : "TV"}
									year={result.year}
								/>
							);
						})}
					</div>
				) : null}
			</div>
		</div>
	);
}
