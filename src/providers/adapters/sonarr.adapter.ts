/** Sonarr API DTO normalization for app-facing provider models. */
// src/providers/adapters/sonarr.adapter.ts

import type {
	SonarrLookupSeries,
	SonarrSeries,
} from "@/providers/sonarr.types";
import type { TvdbId } from "@/providers/provider-id";
import type { SonarrSeriesApi } from "@/providers/schemas/sonarr.schemas";

function normalizeText(value: string | null | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ?? undefined;
}

function normalizeTitle(value: string | null, fallbackId: number): string {
	return normalizeText(value) ?? `Sonarr series ${fallbackId}`;
}

function normalizeTitleSlug(value: string | null, tvdbId: TvdbId): string {
	return normalizeText(value) ?? `tvdb-${tvdbId}`;
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

export function toSonarrSeries(raw: SonarrSeriesApi): SonarrSeries {
	return omitUndefinedProperties({
		id: raw.id,
		title: normalizeTitle(raw.title, raw.id),
		tvdbId: raw.tvdbId,
		titleSlug: normalizeTitleSlug(raw.titleSlug, raw.tvdbId),
		alternateTitles: raw.alternateTitles?.map((title) => ({
			title: title.title,
			sceneSeasonNumber: title.sceneSeasonNumber,
			seasonNumber: title.seasonNumber,
			sourceType: title.sourceType ?? title.sceneOrigin,
		})),
		monitored: raw.monitored,
		year: raw.year,
		genres: raw.genres ?? undefined,
		seasonCount: raw.seasonCount ?? raw.statistics?.seasonCount,
		episodeCount: raw.episodeCount ?? raw.statistics?.episodeCount,
		episodeFileCount: raw.episodeFileCount ?? raw.statistics?.episodeFileCount,
		sizeOnDisk: raw.sizeOnDisk ?? raw.statistics?.sizeOnDisk,
		path: normalizeText(raw.path),
		rootFolderPath: normalizeText(raw.rootFolderPath),
		folder: normalizeText(raw.folder),
		qualityProfileId: raw.qualityProfileId,
		languageProfileId: raw.languageProfileId,
		seasons: raw.seasons ?? undefined,
		seasonFolder: raw.seasonFolder,
		monitorNewItems: raw.monitorNewItems,
		addOptions: raw.addOptions,
		seriesType: raw.seriesType,
		tags: raw.tags ?? [],
		added: raw.added,
		overview: normalizeText(raw.overview),
		previousAiring: raw.previousAiring,
		network: normalizeText(raw.network),
		images: raw.images ?? undefined,
		remotePoster: raw.remotePoster,
		status: raw.status,
		statistics: raw.statistics,
	}) as SonarrSeries;
}

export function toSonarrLookupSeries(raw: SonarrSeriesApi): SonarrLookupSeries {
	const series = toSonarrSeries(raw);
	return omitUndefinedProperties({
		title: series.title,
		tvdbId: series.tvdbId,
		titleSlug: series.titleSlug,
		year: series.year,
		genres: series.genres,
		id: series.id,
		network: series.network,
		seriesType: series.seriesType,
		status: series.status,
		images: series.images,
		remotePoster: series.remotePoster,
		statistics: series.statistics,
	}) as SonarrLookupSeries;
}
