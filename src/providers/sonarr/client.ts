/** Small Sonarr API client for the /api/v3 endpoints ani2arr uses. */
// src/providers/sonarr/client.ts

import * as v from "valibot";

import { createError } from "@/shared/errors/error-utils";
import { ErrorCode } from "@/shared/errors/error.types";
import type { SonarrSeriesId, TvdbId } from "../schemas";
import { ProviderApiClient } from "../shared.client";
import type { ProviderCredentials } from "../types";
import {
	SonarrGeneratedFolderSchema,
	SonarrLookupSeriesSchema,
	SonarrQualityProfileSchema,
	SonarrRootFolderSchema,
	SonarrSeriesSchema,
	SonarrTagSchema,
} from "./schemas";
import type { SonarrMonitorOption } from "./schemas";
import type {
	SonarrAddSeriesPayload,
	SonarrGeneratedFolder,
	SonarrLookupSeries,
	SonarrQualityProfile,
	SonarrRootFolder,
	SonarrSeries,
	SonarrTag,
} from "./types";

const SONARR_API_BASE_PATH = "/api/v3";

export class SonarrClient extends ProviderApiClient {
	public constructor(options: {
		hasUrlPermission: (url: string) => Promise<boolean>;
	}) {
		super({
			providerName: "Sonarr",
			apiBasePath: SONARR_API_BASE_PATH,
			hasUrlPermission: options.hasUrlPermission,
		});
	}

	public async getAllSeries(
		credentials: ProviderCredentials,
	): Promise<SonarrSeries[]> {
		const json = await this.requestJson("series", credentials);
		return v.parse(v.array(SonarrSeriesSchema), json);
	}

	public async findSeriesByTvdbId(
		tvdbId: TvdbId,
		credentials: ProviderCredentials,
	): Promise<SonarrSeries | null> {
		const qs = new URLSearchParams({ tvdbId: String(tvdbId) }).toString();
		const json = await this.requestJson(`series?${qs}`, credentials);
		const series = v.parse(v.array(SonarrSeriesSchema), json);
		return series[0] ?? null;
	}

	public async getSeriesById(
		seriesId: SonarrSeriesId,
		credentials: ProviderCredentials,
	): Promise<SonarrSeries> {
		const json = await this.requestJson(`series/${seriesId}`, credentials);
		return v.parse(SonarrSeriesSchema, json);
	}

	public async getSeriesFolderName(
		seriesId: SonarrSeriesId,
		credentials: ProviderCredentials,
	): Promise<SonarrGeneratedFolder> {
		const json = await this.requestJson(`series/${seriesId}/folder`, credentials);
		return v.parse(SonarrGeneratedFolderSchema, json);
	}

	public async lookupSeries(
		term: string,
		credentials: ProviderCredentials,
	): Promise<SonarrLookupSeries[]> {
		const qs = new URLSearchParams({ term }).toString();
		const json = await this.requestJson(`series/lookup?${qs}`, credentials);
		return v.parse(v.array(SonarrLookupSeriesSchema), json);
	}

	public async lookupSeriesByTvdbId(
		tvdbId: TvdbId,
		credentials: ProviderCredentials,
	): Promise<SonarrLookupSeries | null> {
		const hits = await this.lookupSeries(`tvdb:${tvdbId}`, credentials);
		return hits.find((series) => series.tvdbId === tvdbId) ?? null;
	}

	public async addSeries(
		payload: SonarrAddSeriesPayload,
		credentials: ProviderCredentials,
	): Promise<SonarrSeries> {
		const json = await this.requestJson("series", credentials, {
			method: "POST",
			json: payload,
		});
		return v.parse(SonarrSeriesSchema, json);
	}

	public async updateSeries(
		seriesId: SonarrSeriesId,
		payload: SonarrSeries,
		credentials: ProviderCredentials,
		options?: { moveFiles?: boolean },
	): Promise<SonarrSeries> {
		const qs = new URLSearchParams();
		if (options?.moveFiles !== undefined) {
			qs.set("moveFiles", String(options.moveFiles));
		}

		const endpoint =
			qs.size > 0
				? `series/${seriesId}?${qs.toString()}`
				: `series/${seriesId}`;

		const json = await this.requestJson(endpoint, credentials, {
			method: "PUT",
			json: payload,
		});
		return v.parse(SonarrSeriesSchema, json);
	}

	public async setSeriesMonitorMode(
		seriesId: SonarrSeriesId,
		monitor: SonarrMonitorOption,
		credentials: ProviderCredentials,
		options?: { monitored?: boolean },
	): Promise<void> {
		const series =
			options?.monitored === undefined
				? [{ id: seriesId }]
				: [{ id: seriesId, monitored: options.monitored }];

		await this.requestVoid("seasonpass", credentials, {
			method: "POST",
			json: {
				series,
				monitoringOptions: { monitor },
			},
		});
	}

	public async getRootFolders(
		credentials: ProviderCredentials,
	): Promise<SonarrRootFolder[]> {
		const json = await this.requestJson("rootfolder", credentials);
		return v.parse(v.array(SonarrRootFolderSchema), json);
	}

	public async getQualityProfiles(
		credentials: ProviderCredentials,
	): Promise<SonarrQualityProfile[]> {
		const json = await this.requestJson("qualityprofile", credentials);
		return v.parse(v.array(SonarrQualityProfileSchema), json);
	}

	public async getTags(credentials: ProviderCredentials): Promise<SonarrTag[]> {
		const json = await this.requestJson("tag", credentials);
		return v.parse(v.array(SonarrTagSchema), json);
	}

	public async createTag(
		label: string,
		credentials: ProviderCredentials,
	): Promise<SonarrTag> {
		const trimmed = label.trim();
		if (!trimmed) {
			throw createError(
				ErrorCode.VALIDATION_ERROR,
				"Tag label is empty.",
				"Tag label cannot be empty.",
			);
		}

		const json = await this.requestJson("tag", credentials, {
			method: "POST",
			json: { label: trimmed },
		});
		return v.parse(SonarrTagSchema, json);
	}
}
