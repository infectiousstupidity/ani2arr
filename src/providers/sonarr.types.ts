/** Sonarr resource types owned by the provider domain. */
// src/providers/sonarr.types.ts

import type {
	SonarrMonitorOption,
	SonarrSeriesType,
} from "@/providers/settings/provider-settings.schema";
import type {
	ProviderQualityProfileId,
	ProviderTagId,
	SonarrSeriesId,
	TvdbId,
} from "./provider-id";

export interface SonarrSeries {
	id: SonarrSeriesId;
	title: string;
	tvdbId: TvdbId;
	titleSlug: string;
	alternateTitles?: Array<{
		title?: string | null;
		sceneSeasonNumber?: number | null;
		seasonNumber?: number | null;
		sourceType?: string | null;
	}>;
	monitored?: boolean;
	year?: number;
	genres?: string[];
	seasonCount?: number;
	episodeCount?: number;
	episodeFileCount?: number;
	sizeOnDisk?: number;
	path?: string;
	rootFolderPath?: string;
	folder?: string;
	qualityProfileId?: ProviderQualityProfileId;
	languageProfileId?: number;
	seasons?: unknown[];
	seasonFolder?: boolean;
	monitorNewItems?: "all" | "none";
	addOptions?: {
		searchForMissingEpisodes?: boolean;
		searchForCutoffUnmetEpisodes?: boolean;
		monitor?: SonarrMonitorOption;
	};
	seriesType?: SonarrSeriesType;
	tags?: ProviderTagId[];
	added?: string;
	overview?: string;
	previousAiring?: string | null;
	network?: string;
	images?: Array<{
		coverType?: string;
		url?: string | null;
		remoteUrl?: string | null;
	}>;
	remotePoster?: string | null;
	status?: "continuing" | "ended" | "upcoming" | "deleted";
	statistics?: {
		seasonCount?: number;
		episodeCount?: number;
		episodeFileCount?: number;
		totalEpisodeCount?: number;
		sizeOnDisk?: number;
	};
}

export interface SonarrSeriesSnapshot {
	id: SonarrSeriesId;
	tvdbId: TvdbId;
	title: string;
	titleSlug: string;
	alternateTitles?: string[];
	status?: "continuing" | "ended" | "upcoming" | "deleted";
	statistics?: {
		episodeCount?: number;
		episodeFileCount?: number;
		totalEpisodeCount?: number;
	};
}

export interface SonarrLookupSeries {
	id?: SonarrSeriesId;
	title: string;
	tvdbId: TvdbId;
	titleSlug?: string;
	year?: number;
	genres?: string[];
	network?: string;
	seriesType?: SonarrSeriesType;
	status?: "continuing" | "ended" | "upcoming" | "deleted";
	images?: Array<{
		coverType?: string;
		url?: string | null;
		remoteUrl?: string | null;
	}>;
	remotePoster?: string | null;
	statistics?: {
		seasonCount?: number;
		episodeCount?: number;
		episodeFileCount?: number;
		totalEpisodeCount?: number;
	};
}
