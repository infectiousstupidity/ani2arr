/** Pure Seerr request payload builders and status readers. */
// src/providers/seerr/request.ts

import { normalizeSeasonNumbers } from "@/mapping/season-numbers";
import {
	parseTmdbId,
	parseTmdbIdOrNull,
	parseTvdbIdOrNull,
} from "@/providers/schemas";
import type {
	SeerrMediaDetails,
	SeerrMediaStatus,
	SeerrMediaStatusInput,
	SeerrPublicSettings,
	SeerrRequestInput,
	SeerrRequestPayload,
	SeerrSearchResult,
	SeerrSeasonStatus,
} from "./types";

const SEERR_STATUS_UNKNOWN = 1;
const SEERR_STATUS_PENDING = 2;
const SEERR_STATUS_PROCESSING = 3;
const SEERR_STATUS_PARTIAL = 4;
const SEERR_STATUS_AVAILABLE = 5;
const SEERR_STATUS_DELETED_OR_BLOCKED = 6;
const SEERR_STATUS_DELETED = 7;

const SEERR_REQUEST_PENDING = 1;
const SEERR_REQUEST_APPROVED = 2;

export function buildSeerrRequestPayload(
	input: SeerrRequestInput,
): SeerrRequestPayload {
	const mediaId = parseTmdbId(input.tmdbId);

	if (input.mediaType === "tv") {
		if (input.seasons === "all") {
			return {
				mediaType: "tv",
				mediaId,
				seasons: "all",
				...(input.tvdbId === undefined ? {} : { tvdbId: input.tvdbId }),
			};
		}

		if (!Array.isArray(input.seasons)) {
			throw new TypeError("TV Seerr requests require explicit seasons.");
		}
		const seasons = normalizeSeasonNumbers(input.seasons);
		if (seasons.length === 0) {
			throw new RangeError("TV Seerr requests require explicit seasons.");
		}

		return {
			mediaType: "tv",
			mediaId,
			seasons,
			...(input.tvdbId === undefined ? {} : { tvdbId: input.tvdbId }),
		};
	}

	return {
		mediaType: "movie",
		mediaId,
	};
}

export function readSeerrStatus(value: unknown): SeerrMediaStatus {
	switch (value) {
		case SEERR_STATUS_UNKNOWN: {
			return "unknown";
		}
		case SEERR_STATUS_PENDING: {
			return "pending";
		}
		case SEERR_STATUS_PROCESSING: {
			return "processing";
		}
		case SEERR_STATUS_PARTIAL: {
			return "partial";
		}
		case SEERR_STATUS_AVAILABLE: {
			return "available";
		}
		case SEERR_STATUS_DELETED_OR_BLOCKED: {
			return "deleted-or-blocked";
		}
		case SEERR_STATUS_DELETED: {
			return "deleted";
		}
		default: {
			return "unknown";
		}
	}
}

export function isRequestableSeerrStatus(status: SeerrMediaStatus): boolean {
	return ["unknown", "deleted", "not-requested"].includes(status);
}

function hasActiveRequestForSeason(
	mediaInfo: object,
	seasonNumber: number,
): boolean {
	const requests = (mediaInfo as { requests?: unknown }).requests;
	if (!Array.isArray(requests)) return false;

	return requests.some((request) => {
		if (!request || typeof request !== "object") return false;

		const status = (request as { status?: unknown }).status;
		if (status !== SEERR_REQUEST_PENDING && status !== SEERR_REQUEST_APPROVED) {
			return false;
		}

		const seasons = (request as { seasons?: unknown }).seasons;
		if (!Array.isArray(seasons)) return false;

		return seasons.some((season) => {
			if (!season || typeof season !== "object") return false;
			return (
				(season as { seasonNumber?: unknown }).seasonNumber === seasonNumber
			);
		});
	});
}

function readSeerrTvSeasonStatus(
	mediaInfo: object,
	targetSeasons: readonly number[],
	fallbackStatus: SeerrMediaStatus,
): SeerrMediaStatus {
	if (fallbackStatus === "available") return "available";

	const seasons = (mediaInfo as { seasons?: unknown }).seasons;
	const seasonStatus = new Map<number, SeerrMediaStatus>();

	if (Array.isArray(seasons)) {
		for (const season of seasons) {
			if (!season || typeof season !== "object") continue;

			const seasonNumber = (season as { seasonNumber?: unknown }).seasonNumber;
			if (typeof seasonNumber !== "number") continue;

			seasonStatus.set(
				seasonNumber,
				readSeerrStatus((season as { status?: unknown }).status),
			);
		}
	}

	const hasAnyTargetSeasonStatus = targetSeasons.some((seasonNumber) =>
		seasonStatus.has(seasonNumber),
	);
	if (!hasAnyTargetSeasonStatus) return fallbackStatus;

	const statuses: SeerrMediaStatus[] = [];
	for (const seasonNumber of targetSeasons) {
		const status = seasonStatus.get(seasonNumber);
		if (status === undefined) {
			return "not-requested";
		}

		if (["available", "partial", "processing", "pending"].includes(status)) {
			statuses.push(status);
			continue;
		}

		if (hasActiveRequestForSeason(mediaInfo, seasonNumber)) {
			statuses.push("pending");
			continue;
		}

		if (status === "deleted-or-blocked") {
			return "deleted-or-blocked";
		}

		return "not-requested";
	}

	if (statuses.every((status) => status === "available")) return "available";
	if (statuses.some((status) => ["available", "partial"].includes(status))) {
		return "partial";
	}
	if (statuses.includes("processing")) return "processing";
	return "pending";
}

export function readSeerrMediaStatus(
	value: unknown,
	input?: Pick<SeerrMediaStatusInput, "mediaType" | "seasons">,
): SeerrMediaStatus {
	if (!value || typeof value !== "object") return "unknown";

	const mediaInfo = (value as { mediaInfo?: unknown }).mediaInfo;
	if (!mediaInfo || typeof mediaInfo !== "object") return "not-requested";

	const status = readSeerrStatus((mediaInfo as { status?: unknown }).status);
	const targetSeasons =
		input?.mediaType === "tv" && Array.isArray(input.seasons)
			? normalizeSeasonNumbers(input.seasons)
			: [];
	if (targetSeasons.length > 0) {
		return readSeerrTvSeasonStatus(mediaInfo, targetSeasons, status);
	}

	return status;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim().length > 0
		? value.trim()
		: undefined;
}

function readNullableString(value: unknown): string | null | undefined {
	if (value === null) return null;
	return readString(value);
}

function readYear(value: unknown): number | undefined {
	const text = readString(value);
	if (!text) return undefined;

	const match = /^(\d{4})/.exec(text);
	if (!match) return undefined;

	const year = Number(match[1]);
	return Number.isSafeInteger(year) ? year : undefined;
}

function readTitle(
	value: Record<string, unknown>,
	mediaType: "movie" | "tv",
): string {
	return mediaType === "movie"
		? (readString(value.title) ?? "Untitled movie")
		: (readString(value.name) ?? "Untitled TV show");
}

function readAlternateTitles(
	primaryTitle: string,
	values: readonly unknown[],
): string[] {
	return [...new Set(values.flatMap((value) => readString(value) ?? []))].filter(
		(title) => title !== primaryTitle,
	);
}

function getSearchResultsPayload(value: unknown): unknown[] {
	if (Array.isArray(value)) return value;
	if (!isRecord(value) || !Array.isArray(value.results)) return [];
	return value.results;
}

export function readSeerrSearchResults(value: unknown): SeerrSearchResult[] {
	const results: SeerrSearchResult[] = [];

	for (const item of getSearchResultsPayload(value)) {
		if (!isRecord(item)) continue;
		if (item.mediaType !== "movie" && item.mediaType !== "tv") continue;

		const tmdbId = parseTmdbIdOrNull(item.id ?? item.tmdbId);
		if (tmdbId === null) continue;

		const title = readTitle(item, item.mediaType);
		const alternateTitles = readAlternateTitles(title, [
			item.mediaType === "movie" ? item.originalTitle : item.originalName,
		]);

		const year = readYear(
			item.mediaType === "movie" ? item.releaseDate : item.firstAirDate,
		);
		const posterPath = readNullableString(item.posterPath);
		const overview = readNullableString(item.overview);

		results.push({
			mediaType: item.mediaType,
			tmdbId,
			title,
			...(alternateTitles.length === 0 ? {} : { alternateTitles }),
			...(year === undefined ? {} : { year }),
			...(posterPath === undefined ? {} : { posterPath }),
			...(overview === undefined ? {} : { overview }),
		});
	}

	return results;
}

export function readSeerrPublicSettings(value: unknown): SeerrPublicSettings {
	const settings = isRecord(value) ? value : {};

	return {
		partialRequestsEnabled:
			typeof settings.partialRequestsEnabled === "boolean"
				? settings.partialRequestsEnabled
				: true,
		enableSpecialEpisodes:
			typeof settings.enableSpecialEpisodes === "boolean"
				? settings.enableSpecialEpisodes
				: false,
	};
}

function readSeerrSeason(value: unknown): SeerrSeasonStatus | null {
	if (!isRecord(value)) return null;

	const seasonNumber = value.seasonNumber;
	if (typeof seasonNumber !== "number" || !Number.isSafeInteger(seasonNumber)) {
		return null;
	}

	const episodeCount = value.episodeCount;

	if (
		typeof episodeCount === "number" &&
		Number.isSafeInteger(episodeCount) &&
		episodeCount <= 0
	) {
		return null;
	}

	const name = readString(value.name);
	const status =
		value.status === undefined
			? "not-requested"
			: readSeerrStatus(value.status);

	return {
		seasonNumber,
		...(name === undefined ? {} : { name }),
		...(typeof episodeCount === "number" && Number.isSafeInteger(episodeCount)
			? { episodeCount }
			: {}),
		status,
		requestable: isRequestableSeerrStatus(status),
	};
}

function readSeerrSeasons(value: Record<string, unknown>): SeerrSeasonStatus[] {
	const mediaInfo = isRecord(value.mediaInfo) ? value.mediaInfo : {};
	const seasonRows = new Map<number, Record<string, unknown>>();
	const addSeasonRow = (season: unknown): void => {
		if (!isRecord(season)) return;

		const seasonNumber = season.seasonNumber;
		if (
			typeof seasonNumber !== "number" ||
			!Number.isSafeInteger(seasonNumber)
		) {
			return;
		}

		seasonRows.set(seasonNumber, {
			...seasonRows.get(seasonNumber),
			...season,
		});
	};

	if (Array.isArray(value.seasons)) {
		for (const season of value.seasons) {
			addSeasonRow(season);
		}
	}

	if (Array.isArray(mediaInfo.seasons)) {
		for (const season of mediaInfo.seasons) {
			addSeasonRow(season);
		}
	}

	return [...seasonRows.values()]
		.map((season) => readSeerrSeason(season))
		.filter((season): season is SeerrSeasonStatus => season !== null)
		.toSorted((left, right) => left.seasonNumber - right.seasonNumber);
}

export function readSeerrMediaDetails(
	value: unknown,
	mediaType: "movie" | "tv",
): SeerrMediaDetails {
	if (!isRecord(value)) {
		throw new Error("Invalid Seerr media details.");
	}

	const tmdbId = parseTmdbId(value.id ?? value.tmdbId);
	const externalIds = isRecord(value.externalIds) ? value.externalIds : {};
	const tvdbId =
		parseTvdbIdOrNull(externalIds.tvdbId) ?? parseTvdbIdOrNull(value.tvdbId);
	const title = readTitle(value, mediaType);
	const alternateTitles = readAlternateTitles(title, [
		mediaType === "movie" ? value.originalTitle : value.originalName,
	]);

	const year = readYear(
		mediaType === "movie" ? value.releaseDate : value.firstAirDate,
	);
	const seasons = mediaType === "tv" ? readSeerrSeasons(value) : undefined;
	const posterPath = readNullableString(value.posterPath);
	const backdropPath = readNullableString(value.backdropPath);
	const overview = readNullableString(value.overview);

	return {
		mediaType,
		tmdbId,
		...(tvdbId === null ? {} : { tvdbId }),
		title,
		...(alternateTitles.length === 0 ? {} : { alternateTitles }),
		...(year === undefined ? {} : { year }),
		...(posterPath === undefined ? {} : { posterPath }),
		...(backdropPath === undefined ? {} : { backdropPath }),
		...(overview === undefined ? {} : { overview }),
		status: readSeerrMediaStatus(value, { mediaType }),
		...(seasons === undefined ? {} : { seasons }),
	};
}
