/** Seerr API client for connection checks, media status, and request creation. */
// src/providers/seerr/client.ts

import { ProviderApiClient } from "@/providers/shared.client";
import type { ProviderCredentials } from "@/providers/types";
import {
	readSeerrMediaDetails,
	readSeerrMediaStatus,
	readSeerrSearchResults,
} from "./request";
import type {
	SeerrMediaDetails,
	SeerrMediaStatusInput,
	SeerrMediaRequest,
	SeerrMediaStatus,
	SeerrRequestPayload,
	SeerrSearchResult,
} from "./types";

export class SeerrClient extends ProviderApiClient {
	public constructor(options: {
		hasUrlPermission: (url: string) => Promise<boolean>;
	}) {
		super({
			providerName: "Seerr",
			apiBasePath: "/api/v1",
			hasUrlPermission: options.hasUrlPermission,
		});
	}

	public async validateConnection(
		credentials: ProviderCredentials,
	): Promise<{ ok: true }> {
		await this.requestJson("auth/me", credentials);
		return { ok: true };
	}

	public async requestMedia(
		payload: SeerrRequestPayload,
		credentials: ProviderCredentials,
	): Promise<SeerrMediaRequest> {
		return this.requestJson("request", credentials, {
			method: "POST",
			json: payload,
		}) as Promise<SeerrMediaRequest>;
	}

	public async searchMedia(
		query: string,
		credentials: ProviderCredentials,
	): Promise<SeerrSearchResult[]> {
		const trimmed = query.trim();
		if (!trimmed) return [];

		const qs = new URLSearchParams({ query: trimmed })
			.toString()
			.replaceAll("+", "%20")
			.replaceAll("*", "%2A");
		const json = await this.requestJson(`search?${qs}`, credentials);
		return readSeerrSearchResults(json);
	}

	public async getMediaDetails(
		input: Pick<SeerrMediaStatusInput, "mediaType" | "tmdbId">,
		credentials: ProviderCredentials,
	): Promise<SeerrMediaDetails> {
		const route = input.mediaType === "movie" ? "movie" : "tv";
		const details = await this.requestJson(`${route}/${input.tmdbId}`, credentials);
		return readSeerrMediaDetails(details, input.mediaType);
	}

	public async getMediaStatus(
		input: SeerrMediaStatusInput,
		credentials: ProviderCredentials,
	): Promise<SeerrMediaStatus> {
		const route = input.mediaType === "movie" ? "movie" : "tv";
		const details = await this.requestJson(`${route}/${input.tmdbId}`, credentials);
		return readSeerrMediaStatus(details, input);
	}
}
