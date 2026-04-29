/** Radarr API DTO normalization for app-facing provider models. */
// src/providers/adapters/radarr.adapter.ts

import type { RadarrLookupMovie, RadarrMovie } from "@/providers/radarr.types";
import type { RadarrMovieApi } from "@/providers/schemas/radarr.schemas";

function normalizeText(value: string | null | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ?? undefined;
}

function normalizeTitle(value: string | null, fallbackId: number): string {
	return normalizeText(value) ?? `Radarr movie ${fallbackId}`;
}

function omitUndefinedProperties<T extends Record<string, unknown>>(
	input: T,
): T {
	for (const key of Object.keys(input)) {
		if (input[key] === undefined) {
			delete input[key];
		}
	}
	return input;
}

export function toRadarrMovie(raw: RadarrMovieApi): RadarrMovie {
	return omitUndefinedProperties({
		id: raw.id,
		title: normalizeTitle(raw.title, raw.id),
		tmdbId: raw.tmdbId,
		imdbId: raw.imdbId,
		titleSlug: normalizeText(raw.titleSlug),
		sortTitle: normalizeText(raw.sortTitle),
		originalTitle: normalizeText(raw.originalTitle),
		alternateTitles: raw.alternateTitles?.map((title) => ({
			title: title.title,
			sourceType: title.sourceType,
			movieMetadataId: title.movieMetadataId,
		})),
		monitored: raw.monitored,
		year: raw.year,
		runtime: raw.runtime,
		status: raw.status,
		overview: normalizeText(raw.overview),
		genres: raw.genres ?? undefined,
		path: normalizeText(raw.path),
		rootFolderPath: normalizeText(raw.rootFolderPath),
		folderName: normalizeText(raw.folderName ?? raw.folder),
		qualityProfileId: raw.qualityProfileId,
		minimumAvailability: raw.minimumAvailability,
		tags: raw.tags ?? [],
		hasFile: raw.hasFile ?? undefined,
		movieFileId: raw.movieFileId,
		sizeOnDisk: raw.sizeOnDisk ?? undefined,
		added: raw.added,
		inCinemas: raw.inCinemas,
		digitalRelease: raw.digitalRelease,
		physicalRelease: raw.physicalRelease,
		images: raw.images ?? undefined,
		movieFile: raw.movieFile
			? {
					id: raw.movieFile.id,
					path: normalizeText(raw.movieFile.path),
					relativePath: normalizeText(raw.movieFile.relativePath),
					size: raw.movieFile.size,
					quality: raw.movieFile.quality,
				}
			: undefined,
		addOptions: raw.addOptions,
	}) as RadarrMovie;
}

export function toRadarrLookupMovie(raw: RadarrMovieApi): RadarrLookupMovie {
	const movie = toRadarrMovie(raw);
	return omitUndefinedProperties({
		title: movie.title,
		tmdbId: movie.tmdbId,
		imdbId: movie.imdbId,
		titleSlug: movie.titleSlug,
		sortTitle: movie.sortTitle,
		originalTitle: movie.originalTitle,
		year: movie.year,
		runtime: movie.runtime,
		status: movie.status,
		overview: movie.overview,
		genres: movie.genres,
		monitored: movie.monitored,
		minimumAvailability: movie.minimumAvailability,
		images: movie.images,
		alternateTitles: movie.alternateTitles,
		folderName: movie.folderName,
		remotePoster: raw.remotePoster,
		hasFile: movie.hasFile,
		id: movie.id,
	}) as RadarrLookupMovie;
}
