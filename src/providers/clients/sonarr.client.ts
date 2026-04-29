/** Sonarr transport client for raw Arr API requests and mutations. */
// src/providers/clients/sonarr.client.ts

import { BaseProviderClient } from "./base-provider.client";
import {
	toProviderQualityProfiles,
	toProviderRootFolders,
	toProviderTags,
} from "@/providers/adapters/provider-metadata.adapter";
import {
	toSonarrLookupSeries,
	toSonarrSeries,
} from "@/providers/adapters/sonarr.adapter";
import {
	ProviderQualityProfileApiArraySchema,
	ProviderRootFolderApiArraySchema,
	ProviderTagApiArraySchema,
	ProviderTagApiSchema,
} from "@/providers/schemas/provider-shared.schemas";
import {
	SonarrLookupSeriesApiArraySchema,
	SonarrSeriesApiArraySchema,
	SonarrSeriesApiSchema,
} from "@/providers/schemas/sonarr.schemas";
import type {
	SonarrMonitorOption,
	SonarrSeriesType,
} from "@/providers/settings/provider-settings.schema";
import type {
	ProviderTag,
	ProviderCredentials,
	ProviderQualityProfile,
	ProviderRootFolder,
	SonarrLookupSeries,
	SonarrSeries,
	ProviderQualityProfileId,
	ProviderTagId,
	SonarrSeriesId,
	TvdbId,
} from "@/providers";
import { createError, ErrorCode } from "@/shared/errors";

type SonarrClientOptions = {
	hasUrlPermission: (url: string) => Promise<boolean>;
};

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

export class SonarrClient extends BaseProviderClient {
	public constructor(options: SonarrClientOptions) {
		super({
			providerName: "Sonarr",
			logScope: "SonarrClient",
			cacheableEndpoints: ["series", "qualityprofile", "rootfolder", "tag"],
			hasUrlPermission: options.hasUrlPermission,
		});
	}

	public getAllSeries = async (
		credentials: ProviderCredentials,
	): Promise<SonarrSeries[]> => {
		const series = await this.requestParsed(
			"series",
			credentials,
			SonarrSeriesApiArraySchema,
		);
		return series.map((item) => toSonarrSeries(item));
	};

	public getSeriesByTvdbId = async (
		tvdbId: TvdbId,
		credentials: ProviderCredentials,
	): Promise<SonarrSeries | null> => {
		const qs = new URLSearchParams({ tvdbId: String(tvdbId) }).toString();
		const seriesArray = await this.requestParsed(
			`series?${qs}`,
			credentials,
			SonarrSeriesApiArraySchema,
		);
		const series = seriesArray[0];
		return series ? toSonarrSeries(series) : null;
	};

	public lookupSeriesByTvdbId = async (
		tvdbId: TvdbId,
		credentials: ProviderCredentials,
	): Promise<SonarrLookupSeries | null> => {
		const hits = await this.lookupSeriesByTerm(`tvdb:${tvdbId}`, credentials);
		return hits.find((hit) => hit?.tvdbId === tvdbId) ?? null;
	};

	public getSeriesById = async (
		seriesId: SonarrSeriesId,
		credentials: ProviderCredentials,
	): Promise<SonarrSeries> => {
		const series = await this.requestParsed(
			`series/${seriesId}`,
			credentials,
			SonarrSeriesApiSchema,
		);
		return toSonarrSeries(series);
	};

	public lookupSeriesByTerm = async (
		term: string,
		credentials: ProviderCredentials,
	): Promise<SonarrLookupSeries[]> => {
		const qs = new URLSearchParams({ term }).toString();
		const series = await this.requestParsed(
			`series/lookup?${qs}`,
			credentials,
			SonarrLookupSeriesApiArraySchema,
		);
		return series.map((item) => toSonarrLookupSeries(item));
	};

	public addSeries = async (
		payload: AddSonarrSeriesPayload,
		credentials: ProviderCredentials,
	): Promise<SonarrSeries> => {
		this.log.debug("Sending addSeries payload to Sonarr:", payload);
		const created = await this.requestParsed(
			"series",
			credentials,
			SonarrSeriesApiSchema,
			{
				method: "POST",
				body: JSON.stringify(payload),
			},
		);

		this.invalidateCachedEndpoint("series");

		return toSonarrSeries(created);
	};

	public updateSeries = async (
		seriesId: SonarrSeriesId,
		payload: SonarrSeries,
		credentials: ProviderCredentials,
		options?: { moveFiles?: boolean },
	): Promise<SonarrSeries> => {
		const qs = new URLSearchParams();
		if (options?.moveFiles) {
			qs.set("moveFiles", "true");
		}
		const endpoint =
			qs.size > 0
				? `series/${seriesId}?${qs.toString()}`
				: `series/${seriesId}`;

		this.log.debug("Sending updateSeries payload to Sonarr:", {
			seriesId,
			moveFiles: options?.moveFiles,
			payload,
		});
		const updated = await this.requestParsed(
			endpoint,
			credentials,
			SonarrSeriesApiSchema,
			{
				method: "PUT",
				body: JSON.stringify(payload),
			},
		);

		this.invalidateCachedEndpoint("series");

		return toSonarrSeries(updated);
	};

	public applyMonitoringAction = async (
		seriesId: SonarrSeriesId,
		monitor: SonarrMonitorOption,
		credentials: ProviderCredentials,
	): Promise<void> => {
		this.log.debug("Sending Sonarr monitoring action:", {
			seriesId,
			monitor,
		});

		await this.requestVoid("seasonpass", credentials, {
			method: "POST",
			body: JSON.stringify({
				series: [{ id: seriesId }],
				monitoringOptions: { monitor },
			}),
		});

		this.invalidateCachedEndpoint("series");
	};

	public getRootFolders = async (
		credentials: ProviderCredentials,
	): Promise<ProviderRootFolder[]> => {
		const rootFolders = await this.requestParsed(
			"rootfolder",
			credentials,
			ProviderRootFolderApiArraySchema,
		);
		return toProviderRootFolders(rootFolders);
	};

	public getQualityProfiles = async (
		credentials: ProviderCredentials,
	): Promise<ProviderQualityProfile[]> => {
		const qualityProfiles = await this.requestParsed(
			"qualityprofile",
			credentials,
			ProviderQualityProfileApiArraySchema,
		);
		return toProviderQualityProfiles(qualityProfiles);
	};

	public getTags = async (
		credentials: ProviderCredentials,
	): Promise<ProviderTag[]> => {
		const tags = await this.requestParsed(
			"tag",
			credentials,
			ProviderTagApiArraySchema,
		);
		return toProviderTags(tags);
	};

	/**
	 * Creates a new tag in Sonarr with the given label.
	 * Returns the created provider tag (including its numeric id).
	 */
	public createTag = async (
		credentials: ProviderCredentials,
		label: string,
	): Promise<ProviderTag> => {
		const trimmed = label.trim();
		if (!trimmed) {
			throw createError(
				ErrorCode.VALIDATION_ERROR,
				"Tag label is empty.",
				"Tag label cannot be empty.",
			);
		}

		const created = await this.requestParsed(
			"tag",
			credentials,
			ProviderTagApiSchema,
			{
				method: "POST",
				body: JSON.stringify({ label: trimmed }),
			},
		);

		// Tag list has changed; drop cached /tag response so the next getTags sees it.
		this.invalidateCachedEndpoint("tag");

		const [tag] = toProviderTags([created]);
		if (!tag) {
			throw createError(
				ErrorCode.API_ERROR,
				"Sonarr returned an invalid tag after creation.",
				"Sonarr returned an invalid tag response.",
			);
		}

		return tag;
	};
}
