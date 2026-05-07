/** Radarr add payload shape used by the provider API client. */
// src/providers/radarr/add.ts

import type {
	ProviderQualityProfileId,
	ProviderTagId,
	TmdbId,
} from "../schemas";
import type { RadarrMinimumAvailability } from "./schemas";

export interface RadarrAddMoviePayload {
	title: string;
	tmdbId: TmdbId;
	qualityProfileId: ProviderQualityProfileId;
	rootFolderPath: string;
	monitored?: boolean;
	minimumAvailability?: RadarrMinimumAvailability;
	tags?: ProviderTagId[];
	path?: string;
	year?: number;
	imdbId?: string | null;
	addOptions?: { searchForMovie?: boolean };
}
