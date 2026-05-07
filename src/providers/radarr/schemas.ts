/** Valibot schemas for Radarr API responses, payload shapes, and cache rows. */
// src/providers/radarr/schemas.ts

import * as v from "valibot";

import {
	ProviderQualityProfileIdSchema,
	ProviderTagIdSchema,
	RadarrMovieIdSchema,
	TmdbIdSchema,
	parseProviderQualityProfileId,
	parseProviderTagId,
	parseRadarrMovieId,
	parseRadarrMovieIdOrNull,
	parseTmdbId,
	type ProviderQualityProfileId,
	type ProviderTagId,
	type RadarrMovieId,
	type TmdbId,
} from "../schemas";

export const RADARR_MINIMUM_AVAILABILITY_OPTIONS = [
	"tba",
	"announced",
	"inCinemas",
	"released",
	"deleted",
] as const;

export const RadarrMinimumAvailabilitySchema = v.picklist(
	RADARR_MINIMUM_AVAILABILITY_OPTIONS,
);
export type RadarrMinimumAvailability = v.InferOutput<
	typeof RadarrMinimumAvailabilitySchema
>;

type ProviderRecord = Record<string, unknown>;

interface RadarrImage {
	coverType?: string;
	url?: string | null;
	remoteUrl?: string | null;
}

interface RadarrAlternateTitle {
	title?: string | null;
	sourceType?: string | null;
	movieMetadataId?: number | null;
}

interface RadarrMovieFile {
	id?: number;
	path?: string;
	relativePath?: string;
	size?: number;
	quality?: unknown;
}

interface RadarrMovieResource extends ProviderRecord {
	id: RadarrMovieId;
	title: string;
	tmdbId: TmdbId;
	imdbId?: string | null;
	titleSlug?: string;
	sortTitle?: string;
	originalTitle?: string;
	alternateTitles?: RadarrAlternateTitle[];
	monitored?: boolean;
	year?: number;
	runtime?: number;
	status?: string;
	overview?: string;
	genres?: string[];
	path?: string;
	rootFolderPath?: string;
	folderName?: string;
	qualityProfileId?: ProviderQualityProfileId;
	minimumAvailability?: RadarrMinimumAvailability;
	tags?: ProviderTagId[];
	hasFile?: boolean;
	movieFileId?: number;
	sizeOnDisk?: number;
	added?: string;
	inCinemas?: string | null;
	digitalRelease?: string | null;
	physicalRelease?: string | null;
	images?: RadarrImage[];
	movieFile?: RadarrMovieFile;
	addOptions?: { searchForMovie?: boolean };
}

interface RadarrLookupMovieResource {
	id?: RadarrMovieId;
	title: string;
	tmdbId: TmdbId;
	imdbId?: string | null;
	titleSlug?: string;
	sortTitle?: string;
	originalTitle?: string;
	year?: number;
	runtime?: number;
	status?: string;
	overview?: string;
	genres?: string[];
	monitored?: boolean;
	minimumAvailability?: RadarrMinimumAvailability;
	images?: RadarrImage[];
	alternateTitles?: RadarrAlternateTitle[];
	folderName?: string;
	remotePoster?: string | null;
	hasFile?: boolean;
}

const OptionalStringSchema = v.optional(v.nullable(v.string()));
const OptionalNumberSchema = v.optional(v.nullable(v.number()));

const asRecord = (value: unknown): ProviderRecord =>
	value !== null && typeof value === "object"
		? (value as ProviderRecord)
		: {};

const trimmedString = (value: unknown): string | undefined =>
	typeof value === "string" ? value.trim() || undefined : undefined;

const numberValue = (value: unknown): number | undefined =>
	typeof value === "number" && Number.isFinite(value) ? value : undefined;

const booleanValue = (value: unknown): boolean | undefined =>
	typeof value === "boolean" ? value : undefined;

const stringArray = (value: unknown): string[] | undefined =>
	Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: undefined;

function ifDefined<K extends string, V>(
	key: K,
	value: V | undefined,
): Partial<Record<K, V>> {
	return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}

function tagIds(value: unknown): ProviderTagId[] {
	return Array.isArray(value)
		? value.map((item) => parseProviderTagId(item))
		: [];
}

function normalizeImages(value: unknown): RadarrImage[] | undefined {
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

function normalizeAlternateTitles(
	value: unknown,
): RadarrAlternateTitle[] | undefined {
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

function normalizeMovieFile(value: unknown): RadarrMovieFile | undefined {
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

function normalizeMinimumAvailability(
	value: unknown,
): RadarrMinimumAvailability | undefined {
	return v.is(RadarrMinimumAvailabilitySchema, value) ? value : undefined;
}

function normalizeRadarrMovie(resource: ProviderRecord): RadarrMovieResource {
	const id = parseRadarrMovieId(resource.id);
	const tmdbId = parseTmdbId(resource.tmdbId);
	const folderName =
		trimmedString(resource.folderName) ?? trimmedString(resource.folder);
	const addOptions = asRecord(resource.addOptions);

	return {
		...resource,
		id,
		title: trimmedString(resource.title) ?? `Radarr movie ${id}`,
		tmdbId,
		...ifDefined("imdbId", trimmedString(resource.imdbId)),
		...ifDefined("titleSlug", trimmedString(resource.titleSlug)),
		...ifDefined("sortTitle", trimmedString(resource.sortTitle)),
		...ifDefined("originalTitle", trimmedString(resource.originalTitle)),
		...ifDefined(
			"alternateTitles",
			normalizeAlternateTitles(resource.alternateTitles),
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
		...ifDefined(
			"minimumAvailability",
			normalizeMinimumAvailability(resource.minimumAvailability),
		),
		tags: tagIds(resource.tags),
		...ifDefined("hasFile", booleanValue(resource.hasFile)),
		...ifDefined("movieFileId", numberValue(resource.movieFileId)),
		...ifDefined("sizeOnDisk", numberValue(resource.sizeOnDisk)),
		...ifDefined("added", trimmedString(resource.added)),
		...ifDefined("inCinemas", trimmedString(resource.inCinemas)),
		...ifDefined("digitalRelease", trimmedString(resource.digitalRelease)),
		...ifDefined("physicalRelease", trimmedString(resource.physicalRelease)),
		...ifDefined("images", normalizeImages(resource.images)),
		...ifDefined("movieFile", normalizeMovieFile(resource.movieFile)),
		...(resource.addOptions === addOptions && Object.keys(addOptions).length > 0
			? { addOptions: addOptions as { searchForMovie?: boolean } }
			: {}),
	};
}

function normalizeRadarrLookupMovie(
	resource: ProviderRecord,
): RadarrLookupMovieResource {
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
		...ifDefined(
			"minimumAvailability",
			normalizeMinimumAvailability(resource.minimumAvailability),
		),
		...ifDefined("images", normalizeImages(resource.images)),
		...ifDefined(
			"alternateTitles",
			normalizeAlternateTitles(resource.alternateTitles),
		),
		...ifDefined("folderName", folderName),
		...ifDefined("remotePoster", trimmedString(resource.remotePoster)),
		...ifDefined("hasFile", booleanValue(resource.hasFile)),
	};
}

export const RadarrImageSchema = v.object({
	coverType: v.optional(v.string()),
	url: OptionalStringSchema,
	remoteUrl: OptionalStringSchema,
});

export const RadarrAlternateTitleSchema = v.object({
	title: OptionalStringSchema,
	sourceType: OptionalStringSchema,
	movieMetadataId: OptionalNumberSchema,
});

export const RadarrMovieFileSchema = v.object({
	id: v.optional(v.number()),
	path: v.optional(v.string()),
	relativePath: v.optional(v.string()),
	size: v.optional(v.number()),
	quality: v.optional(v.unknown()),
});

export const RadarrMovieSchema = v.pipe(
	v.looseObject({}),
	v.transform((resource) => normalizeRadarrMovie(resource)),
);

export const RadarrLookupMovieSchema = v.pipe(
	v.looseObject({}),
	v.transform((resource) => normalizeRadarrLookupMovie(resource)),
);

export const RadarrRootFolderSchema = v.object({
	id: v.number(),
	path: v.string(),
	freeSpace: v.optional(v.nullable(v.number())),
	accessible: v.optional(v.boolean()),
});

export const RadarrQualityProfileSchema = v.object({
	id: ProviderQualityProfileIdSchema,
	name: v.string(),
});

export const RadarrTagSchema = v.object({
	id: ProviderTagIdSchema,
	label: v.string(),
});

export const RadarrAddPayloadOptionsSchema = v.object({
	searchForMovie: v.boolean(),
});

export const RadarrMovieSnapshotSchema = v.object({
	tmdbId: TmdbIdSchema,
	id: RadarrMovieIdSchema,
	title: v.string(),
	titleSlug: v.optional(v.string()),
	sortTitle: v.optional(v.string()),
	originalTitle: v.optional(v.string()),
	folderName: v.optional(v.string()),
	imdbId: OptionalStringSchema,
	year: v.optional(v.number()),
	alternateTitles: v.optional(v.array(v.string())),
	monitored: v.optional(v.boolean()),
	minimumAvailability: v.optional(RadarrMinimumAvailabilitySchema),
	hasFile: v.optional(v.boolean()),
	sizeOnDisk: v.optional(v.number()),
	status: v.optional(v.string()),
});
