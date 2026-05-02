/** Radarr transport client for raw Arr API requests and mutations. */
// src/providers/clients/radarr.client.ts

import { BaseProviderClient } from "./base-provider.client";
import { createError, ErrorCode } from "@/shared/errors";
import type { RadarrMinimumAvailability } from "@/providers/settings/provider-settings.schema";
import {
	parseProviderQualityProfileId,
	parseProviderTagId,
	parseRadarrMovieId,
	parseRadarrMovieIdOrNull,
	parseTmdbId,
	type ProviderQualityProfile,
	type ProviderRootFolder,
	type ProviderTag,
	type RadarrLookupMovie,
	type RadarrMovie,
	type ProviderCredentials,
	type ProviderQualityProfileId,
	type ProviderTagId,
	type RadarrMovieId,
	type TmdbId,
} from "@/providers";

export interface AddRadarrMoviePayload {
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

export interface UpdateRadarrMoviePatch {
	qualityProfileId: ProviderQualityProfileId;
	rootFolderPath: string;
	path: string;
	tags: ProviderTagId[];
	monitored?: boolean;
	minimumAvailability?: RadarrMinimumAvailability;
}

export class RadarrClient extends BaseProviderClient {
	public constructor(options: {
		hasUrlPermission: (url: string) => Promise<boolean>;
	}) {
		super({
			providerName: "Radarr",
			logScope: "RadarrClient",
			hasUrlPermission: options.hasUrlPermission,
		});
	}

	public getAllMovies = async (
		credentials: ProviderCredentials,
	): Promise<RadarrMovie[]> => {
		const json = await this.requestJson("movie", credentials);
		return Array.isArray(json)
			? json.map((element) => readRadarrMovieResource(element))
			: [];
	};

	public getMovieById = async (
		movieId: RadarrMovieId,
		credentials: ProviderCredentials,
	): Promise<RadarrMovie> => {
		const json = await this.requestJson(`movie/${movieId}`, credentials);
		return readRadarrMovieResource(json);
	};

	public getMovieByTmdbId = async (
		tmdbId: TmdbId,
		credentials: ProviderCredentials,
	): Promise<RadarrMovie | null> => {
		const qs = new URLSearchParams({ tmdbId: String(tmdbId) }).toString();
		const json = await this.requestJson(`movie?${qs}`, credentials);
		const match = Array.isArray(json)
			? (json.find((m) => m.tmdbId === tmdbId) ?? json[0])
			: json;
		return match ? readRadarrMovieResource(match) : null;
	};

	public lookupMovieByTerm = async (
		term: string,
		credentials: ProviderCredentials,
	): Promise<RadarrLookupMovie[]> => {
		const qs = new URLSearchParams({ term }).toString();
		const json = await this.requestJson(`movie/lookup?${qs}`, credentials);
		return Array.isArray(json)
			? json.map((element) => readRadarrLookupMovieResource(element))
			: [];
	};

	public lookupMovieByTmdbId = async (
		tmdbId: TmdbId,
		credentials: ProviderCredentials,
	): Promise<RadarrLookupMovie | null> => {
		const qs = new URLSearchParams({ tmdbId: String(tmdbId) }).toString();
		const json = await this.requestJson(`movie/lookup/tmdb?${qs}`, credentials);
		const match = Array.isArray(json)
			? json.find((m) => m.tmdbId === tmdbId)
			: json;
		return match ? readRadarrLookupMovieResource(match) : null;
	};

	public lookupMovieByImdbId = async (
		imdbId: string,
		credentials: ProviderCredentials,
	): Promise<RadarrLookupMovie | null> => {
		const trimmed = imdbId.trim();
		if (!trimmed)
			throw createError(
				ErrorCode.VALIDATION_ERROR,
				"IMDb ID is empty.",
				"IMDb ID cannot be empty.",
			);

		const qs = new URLSearchParams({ imdbId: trimmed }).toString();
		const json = await this.requestJson(`movie/lookup/imdb?${qs}`, credentials);
		const match = Array.isArray(json)
			? json.find((m) => m.imdbId === trimmed)
			: json;
		return match ? readRadarrLookupMovieResource(match) : null;
	};

	public getRootFolders = async (
		credentials: ProviderCredentials,
	): Promise<ProviderRootFolder[]> => {
		const json = await this.requestJson("rootfolder", credentials);
		return Array.isArray(json)
			? json
					.map((element) => readProviderRootFolder(element))
					.filter((f) => f.path)
			: [];
	};

	public getQualityProfiles = async (
		credentials: ProviderCredentials,
	): Promise<ProviderQualityProfile[]> => {
		const json = await this.requestJson("qualityprofile", credentials);
		return Array.isArray(json)
			? json
					.map((element) => readProviderQualityProfile(element))
					.filter((p) => p.name)
			: [];
	};

	public getTags = async (
		credentials: ProviderCredentials,
	): Promise<ProviderTag[]> => {
		const json = await this.requestJson("tag", credentials);
		return Array.isArray(json)
			? json.map((element) => readProviderTag(element)).filter((t) => t.label)
			: [];
	};

	public createTag = async (
		credentials: ProviderCredentials,
		label: string,
	): Promise<ProviderTag> => {
		const trimmed = label.trim();
		if (!trimmed)
			throw createError(
				ErrorCode.VALIDATION_ERROR,
				"Tag label is empty.",
				"Tag label cannot be empty.",
			);

		const json = await this.requestJson("tag", credentials, {
			method: "POST",
			body: JSON.stringify({ label: trimmed }),
		});
		return readProviderTag(json);
	};

	public addMovie = async (
		payload: AddRadarrMoviePayload,
		credentials: ProviderCredentials,
	): Promise<RadarrMovie> => {
		const {
			addOptions,
			monitored = true,
			minimumAvailability = "released",
			...rest
		} = payload;
		const apiPayload = {
			...rest,
			monitored,
			minimumAvailability,
			tags: payload.tags ?? [],
			addOptions: { searchForMovie: addOptions?.searchForMovie ?? true },
		};

		this.log.debug("Sending addMovie payload to Radarr:", apiPayload);
		const json = await this.requestJson("movie", credentials, {
			method: "POST",
			body: JSON.stringify(apiPayload),
		});

		return readRadarrMovieResource(json);
	};

	public updateMovie = async (
		movieId: RadarrMovieId,
		patch: UpdateRadarrMoviePatch,
		credentials: ProviderCredentials,
		options?: { moveFiles?: boolean },
	): Promise<RadarrMovie> => {
		const currentRaw = await this.requestJson(`movie/${movieId}`, credentials);
		if (!isProviderRecord(currentRaw)) {
			throw createError(
				ErrorCode.API_ERROR,
				`Radarr returned an invalid movie resource for ${movieId}.`,
				"Radarr returned an invalid movie response.",
			);
		}

		const payload = { ...currentRaw, ...patch };
		const qs = new URLSearchParams();
		if (options?.moveFiles) qs.set("moveFiles", "true");
		const endpoint =
			qs.size > 0 ? `movie/${movieId}?${qs.toString()}` : `movie/${movieId}`;

		this.log.debug("Sending updateMovie payload to Radarr:", {
			movieId,
			moveFiles: options?.moveFiles,
			payload,
		});

		const json = await this.requestJson(endpoint, credentials, {
			method: "PUT",
			body: JSON.stringify(payload),
		});

		return readRadarrMovieResource(json);
	};
}

// --- Private Resource Readers ---

type ProviderRecord = Record<string, unknown>;
type RadarrAddOptions = NonNullable<RadarrMovie["addOptions"]>;
type RadarrMinimumAvailabilityValue = NonNullable<
	RadarrMovie["minimumAvailability"]
>;
type RadarrLookupMinimumAvailabilityValue = NonNullable<
	RadarrLookupMovie["minimumAvailability"]
>;

function asRecord(value: unknown): ProviderRecord {
	return value && typeof value === "object" ? (value as ProviderRecord) : {};
}

function isProviderRecord(value: unknown): value is ProviderRecord {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function trimmedString(value: unknown): string | undefined {
	return typeof value === "string" ? value.trim() || undefined : undefined;
}

function numberValue(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}

function booleanValue(value: unknown): boolean | undefined {
	return typeof value === "boolean" ? value : undefined;
}

function positiveInteger(value: unknown): number {
	if (
		typeof value !== "number" ||
		!Number.isFinite(value) ||
		!Number.isInteger(value) ||
		value < 1
	) {
		throw new Error("Invalid provider metadata ID");
	}
	return value;
}

function ifDefined<K extends string, V>(
	key: K,
	value: V | undefined,
): Partial<Record<K, V>> {
	return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}

function stringArray(value: unknown): string[] | undefined {
	return Array.isArray(value)
		? value.filter((item) => typeof item === "string")
		: undefined;
}

function tagIds(value: unknown): ProviderTagId[] {
	return Array.isArray(value)
		? value.map((item) => parseProviderTagId(item))
		: [];
}

function readMediaCovers(value: unknown): RadarrMovie["images"] {
	if (!Array.isArray(value)) return undefined;
	return value.map((item) => {
		const image = asRecord(item);
		return {
			...ifDefined("coverType", trimmedString(image.coverType)),
			...ifDefined("url", trimmedString(image.url)),
			...ifDefined("remoteUrl", trimmedString(image.remoteUrl)),
		};
	});
}

function readAlternateTitles(value: unknown): RadarrMovie["alternateTitles"] {
	if (!Array.isArray(value)) return undefined;
	return value.map((item) => {
		const alternateTitle = asRecord(item);
		return {
			...ifDefined("title", trimmedString(alternateTitle.title)),
			...ifDefined("sourceType", trimmedString(alternateTitle.sourceType)),
			...ifDefined(
				"movieMetadataId",
				numberValue(alternateTitle.movieMetadataId),
			),
		};
	});
}

function readMovieFile(value: unknown): RadarrMovie["movieFile"] {
	if (!value || typeof value !== "object") return undefined;
	const movieFile = asRecord(value);
	return {
		...ifDefined("id", numberValue(movieFile.id)),
		...ifDefined("path", trimmedString(movieFile.path)),
		...ifDefined("relativePath", trimmedString(movieFile.relativePath)),
		...ifDefined("size", numberValue(movieFile.size)),
		...(movieFile.quality === undefined ? {} : { quality: movieFile.quality }),
	};
}

function readRadarrMovieResource(raw: unknown): RadarrMovie {
	const resource = asRecord(raw);
	const id = parseRadarrMovieId(resource.id);
	const tmdbId = parseTmdbId(resource.tmdbId);
	const folderName =
		trimmedString(resource.folderName) ?? trimmedString(resource.folder);
	const addOptions = asRecord(resource.addOptions);

	return {
		id,
		title: trimmedString(resource.title) ?? `Radarr movie ${id}`,
		tmdbId,
		...ifDefined("imdbId", trimmedString(resource.imdbId)),
		...ifDefined("titleSlug", trimmedString(resource.titleSlug)),
		...ifDefined("sortTitle", trimmedString(resource.sortTitle)),
		...ifDefined("originalTitle", trimmedString(resource.originalTitle)),
		...ifDefined(
			"alternateTitles",
			readAlternateTitles(resource.alternateTitles),
		),
		...ifDefined("monitored", booleanValue(resource.monitored)),
		...ifDefined("year", numberValue(resource.year)),
		...ifDefined("runtime", numberValue(resource.runtime)),
		...ifDefined("status", trimmedString(resource.status)),
		...ifDefined("overview", trimmedString(resource.overview)),
		...ifDefined("genres", stringArray(resource.genres)),
		...ifDefined("path", trimmedString(resource.path)),
		...ifDefined("rootFolderPath", trimmedString(resource.rootFolderPath)),
		...ifDefined("folderName", folderName),
		...(resource.qualityProfileId === undefined
			? {}
			: {
					qualityProfileId: parseProviderQualityProfileId(
						resource.qualityProfileId,
					),
				}),
		...(typeof resource.minimumAvailability === "string"
			? {
					minimumAvailability:
						resource.minimumAvailability as RadarrMinimumAvailabilityValue,
				}
			: {}),
		tags: tagIds(resource.tags),
		...ifDefined("hasFile", booleanValue(resource.hasFile)),
		...ifDefined("movieFileId", numberValue(resource.movieFileId)),
		...ifDefined("sizeOnDisk", numberValue(resource.sizeOnDisk)),
		...ifDefined("added", trimmedString(resource.added)),
		...ifDefined("inCinemas", trimmedString(resource.inCinemas)),
		...ifDefined("digitalRelease", trimmedString(resource.digitalRelease)),
		...ifDefined("physicalRelease", trimmedString(resource.physicalRelease)),
		...ifDefined("images", readMediaCovers(resource.images)),
		...ifDefined("movieFile", readMovieFile(resource.movieFile)),
		...(resource.addOptions === addOptions && Object.keys(addOptions).length > 0
			? { addOptions: addOptions as RadarrAddOptions }
			: {}),
	};
}

function readRadarrLookupMovieResource(raw: unknown): RadarrLookupMovie {
	const resource = asRecord(raw);
	const tmdbId = parseTmdbId(resource.tmdbId);
	const id = parseRadarrMovieIdOrNull(resource.id);
	const folderName =
		trimmedString(resource.folderName) ?? trimmedString(resource.folder);
	return {
		title: trimmedString(resource.title) ?? `Radarr movie ${tmdbId}`,
		tmdbId,
		...(id === null ? {} : { id }),
		...ifDefined("imdbId", trimmedString(resource.imdbId)),
		...ifDefined("titleSlug", trimmedString(resource.titleSlug)),
		...ifDefined("sortTitle", trimmedString(resource.sortTitle)),
		...ifDefined("originalTitle", trimmedString(resource.originalTitle)),
		...ifDefined("year", numberValue(resource.year)),
		...ifDefined("runtime", numberValue(resource.runtime)),
		...ifDefined("status", trimmedString(resource.status)),
		...ifDefined("overview", trimmedString(resource.overview)),
		...ifDefined("genres", stringArray(resource.genres)),
		...ifDefined("monitored", booleanValue(resource.monitored)),
		...(typeof resource.minimumAvailability === "string"
			? {
					minimumAvailability:
						resource.minimumAvailability as RadarrLookupMinimumAvailabilityValue,
				}
			: {}),
		...ifDefined("images", readMediaCovers(resource.images)),
		...ifDefined(
			"alternateTitles",
			readAlternateTitles(resource.alternateTitles),
		),
		...ifDefined("folderName", folderName),
		...ifDefined("remotePoster", trimmedString(resource.remotePoster)),
		...ifDefined("hasFile", booleanValue(resource.hasFile)),
	};
}

function readProviderRootFolder(raw: unknown): ProviderRootFolder {
	const resource = asRecord(raw);
	return {
		id: positiveInteger(resource.id),
		path: trimmedString(resource.path) ?? "",
		freeSpace: numberValue(resource.freeSpace) ?? null,
	};
}

function readProviderQualityProfile(raw: unknown): ProviderQualityProfile {
	const resource = asRecord(raw);
	return {
		id: parseProviderQualityProfileId(resource.id),
		name: trimmedString(resource.name) ?? "",
	};
}

function readProviderTag(raw: unknown): ProviderTag {
	const resource = asRecord(raw);
	return {
		id: parseProviderTagId(resource.id),
		label: trimmedString(resource.label) ?? "",
	};
}
