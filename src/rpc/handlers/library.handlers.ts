/** RPC handlers for provider-library status, add, and update flows. */
// src/rpc/handlers/library.handlers.ts

import * as v from "valibot";
import {
	addRadarrMovie,
	updateRadarrMovie,
} from "@/providers/library/radarr-mutations";
import {
	addSonarrSeries,
	updateSonarrSeries,
} from "@/providers/library/sonarr-mutations";
import type { Ani2arrApi } from "@/rpc";
import {
	AddRadarrInputSchema,
	AddSonarrInputSchema,
	MovieLibraryStatusInputSchema,
	SeriesLibraryStatusInputSchema,
	StatusInputSchema,
	UpdateRadarrInputSchema,
	UpdateSonarrInputSchema,
	type StatusInput,
} from "@/rpc/schemas";
import { normalizeError } from "@/shared/errors";
import type { RequestPriority } from "@/shared/utils/request-priority";
import type { ApiHandlerDeps } from "./handler-deps";

export function createLibraryHandlers(
	deps: ApiHandlerDeps,
): Pick<
	Ani2arrApi,
	| "getSeriesStatus"
	| "getMovieStatus"
	| "getSeriesLibraryStatus"
	| "getMovieLibraryStatus"
	| "addToSonarr"
	| "addToRadarr"
	| "updateSonarrSeries"
	| "updateRadarrMovie"
> {
	const {
		SonarrClient,
		RadarrClient,
		manualMappingService,
		sonarrLibrary,
		radarrLibrary,
		manualMappingsReady,
		providerConfig,
		scheduleLibraryRefresh,
		bumpLibraryRevision,
	} = deps;

	const handlers = {
		async getSeriesStatus(input) {
			const parsedInput = v.parse(StatusInputSchema, input);
			await manualMappingsReady;

			const payload: Pick<StatusInput, "anilistId" | "title" | "metadata"> = {
				anilistId: parsedInput.anilistId,
			};
			if (parsedInput.title !== undefined) payload.title = parsedInput.title;
			if (parsedInput.metadata !== undefined)
				payload.metadata = parsedInput.metadata;

				const requestOptions: {
					force_verify?: boolean;
					network?: "never";
					priority?: RequestPriority;
				} = {};
				if (parsedInput.force_verify) requestOptions.force_verify = true;
				if (parsedInput.network) requestOptions.network = parsedInput.network;
				if (parsedInput.priority) requestOptions.priority = parsedInput.priority;

			const status = await sonarrLibrary.getSeriesStatus(
				payload,
				requestOptions,
			);
			return {
				...status,
				manualMappingActive: manualMappingService.has("sonarr", parsedInput.anilistId),
			};
		},

		async getMovieStatus(input) {
			const parsedInput = v.parse(StatusInputSchema, input);
			await manualMappingsReady;

			const payload: Pick<StatusInput, "anilistId" | "title" | "metadata"> = {
				anilistId: parsedInput.anilistId,
			};
			if (parsedInput.title !== undefined) payload.title = parsedInput.title;
			if (parsedInput.metadata !== undefined)
				payload.metadata = parsedInput.metadata;

				const requestOptions: {
					force_verify?: boolean;
					network?: "never";
					priority?: RequestPriority;
				} = {};
				if (parsedInput.force_verify) requestOptions.force_verify = true;
				if (parsedInput.network) requestOptions.network = parsedInput.network;
				if (parsedInput.priority) requestOptions.priority = parsedInput.priority;

			const status = await radarrLibrary.getMovieStatus(
				payload,
				requestOptions,
			);
			return {
				...status,
				manualMappingActive: manualMappingService.has("radarr", parsedInput.anilistId),
			};
		},

		async getSeriesLibraryStatus(input) {
			const parsedInput = v.parse(SeriesLibraryStatusInputSchema, input);
			return sonarrLibrary.getSeriesLibraryStatus({
				anilistId: parsedInput.anilistId,
				providerId: parsedInput.providerId,
				forceVerify: parsedInput.forceVerify === true,
			});
		},

		async getMovieLibraryStatus(input) {
			const parsedInput = v.parse(MovieLibraryStatusInputSchema, input);
			return radarrLibrary.getMovieLibraryStatus({
				anilistId: parsedInput.anilistId,
				providerId: parsedInput.providerId,
				forceVerify: parsedInput.forceVerify === true,
			});
		},

		async addToSonarr(input) {
			const parsedInput = v.parse(AddSonarrInputSchema, input);
			const { credentials, options } = await providerConfig.require("sonarr");
			await manualMappingsReady;
			const created = await addSonarrSeries(
				{
					tvdbId: parsedInput.tvdbId,
					title: parsedInput.title,
					form: parsedInput.form,
					defaults: options.providers.sonarr.defaults,
					credentials,
				},
				{
					client: SonarrClient,
					cache: sonarrLibrary,
				},
			);
			scheduleLibraryRefresh("sonarr", options);
			await bumpLibraryRevision("sonarr");
			return created;
		},

		async addToRadarr(input) {
			const parsedInput = v.parse(AddRadarrInputSchema, input);
			const { credentials, options } = await providerConfig.require("radarr");
			await manualMappingsReady;
			const created = await addRadarrMovie(
				{
					tmdbId: parsedInput.tmdbId,
					title: parsedInput.title,
					form: parsedInput.form,
					defaults: options.providers.radarr.defaults,
					credentials,
					...(parsedInput.metadata === undefined
						? {}
						: { metadata: parsedInput.metadata }),
				},
				{
					client: RadarrClient,
					cache: radarrLibrary,
				},
			);
			scheduleLibraryRefresh("radarr", options);
			await bumpLibraryRevision("radarr");
			return created;
		},

		async updateSonarrSeries(input) {
			const parsedInput = v.parse(UpdateSonarrInputSchema, input);
			const credentials = await providerConfig.requireCredentials("sonarr");
			try {
				const updated = await updateSonarrSeries(
					{
						tvdbId: parsedInput.tvdbId,
						title: parsedInput.title,
						form: parsedInput.form,
						credentials,
						...(parsedInput.monitoringAction === undefined
							? {}
							: { monitoringAction: parsedInput.monitoringAction }),
					},
					{
						client: SonarrClient,
						cache: sonarrLibrary,
					},
				);
				scheduleLibraryRefresh("sonarr");
				await bumpLibraryRevision("sonarr");
				return updated;
			} catch (error) {
				const normalized = normalizeError(error);
				if (normalized.details?.partialSuccess === true) {
					scheduleLibraryRefresh("sonarr");
					await bumpLibraryRevision("sonarr");
				}
				throw normalized;
			}
		},

		async updateRadarrMovie(input) {
			const parsedInput = v.parse(UpdateRadarrInputSchema, input);
			const credentials = await providerConfig.requireCredentials("radarr");
			const updated = await updateRadarrMovie(
				{
					tmdbId: parsedInput.tmdbId,
					title: parsedInput.title,
					form: parsedInput.form,
					credentials,
				},
				{
					client: RadarrClient,
					cache: radarrLibrary,
				},
			);
			scheduleLibraryRefresh("radarr");
			await bumpLibraryRevision("radarr");
			return updated;
		},
	} satisfies Pick<
		Ani2arrApi,
		| "getSeriesStatus"
		| "getMovieStatus"
		| "getSeriesLibraryStatus"
		| "getMovieLibraryStatus"
		| "addToSonarr"
		| "addToRadarr"
		| "updateSonarrSeries"
		| "updateRadarrMovie"
	>;

	return handlers;
}
