/** Radarr-specific manual mapping search panel for the media modal. */
// src/features/media-modal/radarr/radarr-mapping-panel.tsx

import { useState } from "react";
import { getProviderRouteSlug } from "@/providers/provider-route-slug";
import type { RadarrLookupMovie } from "@/providers/radarr/types";
import { parseTmdbId } from "@/providers/schemas";
import { useRadarrLookupSearch } from "@/queries/radarr";
import type { RadarrLookupOutput } from "@/rpc/types";
import {
	MappingSearchShell,
	type MappingPanelProps,
} from "../mapping/mapping-search-shell";
import { normalizeLinkedAniListIds, pickProviderPoster } from "../helpers";
import type { MediaModalTargetSummary } from "../types";

const PROVIDER = "radarr" as const;

function buildCandidate(
	movie: RadarrLookupMovie,
	data: RadarrLookupOutput,
): MediaModalTargetSummary {
	const tmdbId = parseTmdbId(movie.tmdbId);
	const isInLibrary = data.libraryTmdbIds?.includes(tmdbId) ?? null;
	const providerRouteSlug = isInLibrary
		? (getProviderRouteSlug(PROVIDER, movie) ?? undefined)
		: undefined;
	const posterUrl = pickProviderPoster(movie);
	const linkedAniListIds = normalizeLinkedAniListIds(
		data.linkedAniListIdsByTmdbId?.[tmdbId],
	);

	return {
		provider: PROVIDER,
		providerId: tmdbId,
		title: movie.title,
		isInLibrary,
		typeLabel: "Movie",
		...(movie.folderName ? { providerFolderName: movie.folderName } : {}),
		...(typeof movie.year === "number" ? { year: movie.year } : {}),
		...(providerRouteSlug ? { providerRouteSlug } : {}),
		...(posterUrl === undefined ? {} : { posterUrl }),
		...(movie.status === undefined ? {} : { statusLabel: movie.status }),
		...(movie.overview ? { overview: movie.overview } : {}),
		...(typeof movie.runtime === "number"
			? { runtimeMinutes: movie.runtime }
			: {}),
		...(movie.hasFile === undefined ? {} : { hasFile: movie.hasFile }),
		...(linkedAniListIds?.length ? { linkedAniListIds } : {}),
	};
}

export function RadarrMappingPanel(
	props: MappingPanelProps,
): React.JSX.Element {
	const [searchTerm, setSearchTerm] = useState("");
	const search = useRadarrLookupSearch({
		term: searchTerm,
		enabled: searchTerm.length > 0,
	});
	const { data } = search;

	return (
		<MappingSearchShell
			{...props}
			provider={PROVIDER}
			searchPlaceholder="Search by movie title or TMDB ID..."
			hasSearchTerm={searchTerm.length > 0}
			isFetching={search.isFetching}
			error={search.error}
			candidates={
				data?.results.map((movie) => buildCandidate(movie, data)) ?? []
			}
			onSearch={setSearchTerm}
		/>
	);
}
