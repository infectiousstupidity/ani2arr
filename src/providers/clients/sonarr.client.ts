/** Sonarr transport client for raw Arr API requests and mutations. */
// src/providers/clients/sonarr.client.ts

import { BaseProviderClient } from "./base-provider.client";
import { createError, ErrorCode } from "@/shared/errors";
import type {
	SonarrMonitorOption,
	SonarrSeriesType,
} from "@/providers/settings/provider-settings.schema";
import {
	parseProviderQualityProfileId,
	parseProviderTagId,
	parseSonarrSeriesId,
	parseSonarrSeriesIdOrNull,
	parseTvdbId,
	type ProviderCredentials,
	type ProviderTag,
	type ProviderQualityProfile,
	type ProviderRootFolder,
	type SonarrLookupSeries,
	type SonarrSeries,
	type ProviderQualityProfileId,
	type ProviderTagId,
	type SonarrSeriesId,
	type TvdbId,
} from "@/providers";

export interface AddSonarrSeriesPayload {
	title: string;
	tvdbId: TvdbId;
	qualityProfileId: ProviderQualityProfileId;
	rootFolderPath: string;
	seasonFolder: boolean;
	monitored: boolean;
	seriesType: SonarrSeriesType;
	tags: ProviderTagId[];
	addOptions: {
		monitor: SonarrMonitorOption;
		searchForMissingEpisodes: boolean;
		searchForCutoffUnmetEpisodes: boolean;
	};
}

export interface UpdateSonarrSeriesPatch {
	qualityProfileId: ProviderQualityProfileId;
	rootFolderPath: string;
	path: string;
	tags: ProviderTagId[];
	monitored?: boolean;
	seasonFolder?: boolean;
	seriesType?: SonarrSeriesType;
}

export class SonarrClient extends BaseProviderClient {
	public constructor(options: {
		hasUrlPermission: (url: string) => Promise<boolean>;
	}) {
		super({
			providerName: "Sonarr",
			logScope: "SonarrClient",
			hasUrlPermission: options.hasUrlPermission,
		});
	}

	public getAllSeries = async (
		credentials: ProviderCredentials,
	): Promise<SonarrSeries[]> => {
		const json = await this.requestJson("series", credentials);
		return Array.isArray(json)
			? json.map((element) => readSonarrSeriesResource(element))
			: [];
	};

	public getSeriesByTvdbId = async (
		tvdbId: TvdbId,
		credentials: ProviderCredentials,
	): Promise<SonarrSeries | null> => {
		const qs = new URLSearchParams({ tvdbId: String(tvdbId) }).toString();
		const json = await this.requestJson(`series?${qs}`, credentials);
		const match = Array.isArray(json) ? json[0] : json;
		return match ? readSonarrSeriesResource(match) : null;
	};

	public lookupSeriesByTvdbId = async (
		tvdbId: TvdbId,
		credentials: ProviderCredentials,
	): Promise<SonarrLookupSeries | null> => {
		const hits = await this.lookupSeriesByTerm(`tvdb:${tvdbId}`, credentials);
		return hits.find((hit) => hit.tvdbId === tvdbId) ?? null;
	};

	public getSeriesById = async (
		seriesId: SonarrSeriesId,
		credentials: ProviderCredentials,
	): Promise<SonarrSeries> => {
		const json = await this.requestJson(`series/${seriesId}`, credentials);
		return readSonarrSeriesResource(json);
	};

	public lookupSeriesByTerm = async (
		term: string,
		credentials: ProviderCredentials,
	): Promise<SonarrLookupSeries[]> => {
		const qs = new URLSearchParams({ term }).toString();
		const json = await this.requestJson(`series/lookup?${qs}`, credentials);
		return Array.isArray(json)
			? json.map((element) => readSonarrLookupSeriesResource(element))
			: [];
	};

	public addSeries = async (
		payload: AddSonarrSeriesPayload,
		credentials: ProviderCredentials,
	): Promise<SonarrSeries> => {
		this.log.debug("Sending addSeries payload to Sonarr:", payload);
		const json = await this.requestJson("series", credentials, {
			method: "POST",
			body: JSON.stringify(payload),
		});
		return readSonarrSeriesResource(json);
	};

	public updateSeries = async (
		seriesId: SonarrSeriesId,
		patch: UpdateSonarrSeriesPatch,
		credentials: ProviderCredentials,
		options?: { moveFiles?: boolean },
	): Promise<SonarrSeries> => {
		const currentRaw = await this.requestJson(`series/${seriesId}`, credentials);
		if (!isProviderRecord(currentRaw)) {
			throw createError(
				ErrorCode.API_ERROR,
				`Sonarr returned an invalid series resource for ${seriesId}.`,
				"Sonarr returned an invalid series response.",
			);
		}

		const payload = { ...currentRaw, ...patch };
		const qs = new URLSearchParams();
		if (options?.moveFiles) qs.set("moveFiles", "true");
		const endpoint =
			qs.size > 0
				? `series/${seriesId}?${qs.toString()}`
				: `series/${seriesId}`;

		this.log.debug("Sending updateSeries payload to Sonarr:", {
			seriesId,
			moveFiles: options?.moveFiles,
			payload,
		});
		const json = await this.requestJson(endpoint, credentials, {
			method: "PUT",
			body: JSON.stringify(payload),
		});
		return readSonarrSeriesResource(json);
	};

	public applyMonitoringAction = async (
		seriesId: SonarrSeriesId,
		monitor: SonarrMonitorOption,
		credentials: ProviderCredentials,
	): Promise<void> => {
		this.log.debug("Sending Sonarr monitoring action:", { seriesId, monitor });
		await this.requestVoid("seasonpass", credentials, {
			method: "POST",
			body: JSON.stringify({
				series: [{ id: seriesId }],
				monitoringOptions: { monitor },
			}),
		});
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
}

// --- Private Resource Readers ---

type ProviderRecord = Record<string, unknown>;
type SonarrAddOptions = NonNullable<SonarrSeries["addOptions"]>;
type SonarrSeriesStatus = NonNullable<SonarrSeries["status"]>;
type SonarrLookupStatus = NonNullable<SonarrLookupSeries["status"]>;
type SonarrSeriesTypeValue = NonNullable<SonarrSeries["seriesType"]>;
type SonarrLookupSeriesTypeValue = NonNullable<
	SonarrLookupSeries["seriesType"]
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

function readMediaCovers(value: unknown): SonarrSeries["images"] {
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

function readStatistics(value: unknown): SonarrSeries["statistics"] {
	const statistics = asRecord(value);
	const result = {
		...ifDefined("seasonCount", numberValue(statistics.seasonCount)),
		...ifDefined("episodeCount", numberValue(statistics.episodeCount)),
		...ifDefined("episodeFileCount", numberValue(statistics.episodeFileCount)),
		...ifDefined(
			"totalEpisodeCount",
			numberValue(statistics.totalEpisodeCount),
		),
		...ifDefined("sizeOnDisk", numberValue(statistics.sizeOnDisk)),
	};
	return Object.keys(result).length > 0 ? result : undefined;
}

function readSonarrSeriesResource(raw: unknown): SonarrSeries {
	const resource = asRecord(raw);
	const id = parseSonarrSeriesId(resource.id);
	const tvdbId = parseTvdbId(resource.tvdbId);
	const statistics = readStatistics(resource.statistics);
	const title = trimmedString(resource.title) ?? `Sonarr series ${id}`;
	const seasonCount =
		numberValue(resource.seasonCount) ?? statistics?.seasonCount;
	const episodeCount =
		numberValue(resource.episodeCount) ?? statistics?.episodeCount;
	const episodeFileCount =
		numberValue(resource.episodeFileCount) ?? statistics?.episodeFileCount;
	const sizeOnDisk = numberValue(resource.sizeOnDisk) ?? statistics?.sizeOnDisk;
	const addOptions = asRecord(resource.addOptions);

	return {
		id,
		title,
		tvdbId,
		titleSlug: trimmedString(resource.titleSlug) ?? `tvdb-${tvdbId}`,
		...(Array.isArray(resource.alternateTitles)
			? {
					alternateTitles: resource.alternateTitles.map((item) => {
						const alternateTitle = asRecord(item);
						const sourceType =
							trimmedString(alternateTitle.sourceType) ??
							trimmedString(alternateTitle.sceneOrigin);
						return {
							...ifDefined("title", trimmedString(alternateTitle.title)),
							...ifDefined(
								"sceneSeasonNumber",
								numberValue(alternateTitle.sceneSeasonNumber),
							),
							...ifDefined(
								"seasonNumber",
								numberValue(alternateTitle.seasonNumber),
							),
							...ifDefined("sourceType", sourceType),
						};
					}),
				}
			: {}),
		...ifDefined("monitored", booleanValue(resource.monitored)),
		...ifDefined("year", numberValue(resource.year)),
		...ifDefined("genres", stringArray(resource.genres)),
		...ifDefined("seasonCount", seasonCount),
		...ifDefined("episodeCount", episodeCount),
		...ifDefined("episodeFileCount", episodeFileCount),
		...ifDefined("sizeOnDisk", sizeOnDisk),
		...ifDefined("path", trimmedString(resource.path)),
		...ifDefined("rootFolderPath", trimmedString(resource.rootFolderPath)),
		...ifDefined("folder", trimmedString(resource.folder)),
		...(resource.qualityProfileId === undefined
			? {}
			: {
					qualityProfileId: parseProviderQualityProfileId(
						resource.qualityProfileId,
					),
				}),
		...ifDefined("languageProfileId", numberValue(resource.languageProfileId)),
		...(Array.isArray(resource.seasons) ? { seasons: resource.seasons } : {}),
		...ifDefined("seasonFolder", booleanValue(resource.seasonFolder)),
		...(resource.monitorNewItems === "all" ||
		resource.monitorNewItems === "none"
			? { monitorNewItems: resource.monitorNewItems }
			: {}),
		...(resource.addOptions === addOptions && Object.keys(addOptions).length > 0
			? { addOptions: addOptions as SonarrAddOptions }
			: {}),
		...(typeof resource.seriesType === "string"
			? { seriesType: resource.seriesType as SonarrSeriesTypeValue }
			: {}),
		tags: tagIds(resource.tags),
		...ifDefined("added", trimmedString(resource.added)),
		...ifDefined("overview", trimmedString(resource.overview)),
		...ifDefined("previousAiring", trimmedString(resource.previousAiring)),
		...ifDefined("network", trimmedString(resource.network)),
		...ifDefined("images", readMediaCovers(resource.images)),
		...ifDefined("remotePoster", trimmedString(resource.remotePoster)),
		...(typeof resource.status === "string"
			? { status: resource.status as SonarrSeriesStatus }
			: {}),
		...ifDefined("statistics", statistics),
	};
}

function readSonarrLookupSeriesResource(raw: unknown): SonarrLookupSeries {
	const resource = asRecord(raw);
	const tvdbId = parseTvdbId(resource.tvdbId);
	const id = parseSonarrSeriesIdOrNull(resource.id);
	const statistics = readStatistics(resource.statistics);

	return {
		title: trimmedString(resource.title) ?? `Sonarr series ${tvdbId}`,
		tvdbId,
		...(id === null ? {} : { id }),
		...ifDefined("titleSlug", trimmedString(resource.titleSlug)),
		...ifDefined("year", numberValue(resource.year)),
		...ifDefined("genres", stringArray(resource.genres)),
		...ifDefined("network", trimmedString(resource.network)),
		...(typeof resource.seriesType === "string"
			? { seriesType: resource.seriesType as SonarrLookupSeriesTypeValue }
			: {}),
		...(typeof resource.status === "string"
			? { status: resource.status as SonarrLookupStatus }
			: {}),
		...ifDefined("images", readMediaCovers(resource.images)),
		...ifDefined("remotePoster", trimmedString(resource.remotePoster)),
		...ifDefined("statistics", statistics),
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
