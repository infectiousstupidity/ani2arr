/** RPC handlers for provider-library status, add, and update flows. */
// src/rpc/handlers/library.handlers.ts

import * as v from "valibot";
import {
	addRadarrMovie,
	updateRadarrMovie,
} from "@/providers/library/radarr-mutations";
import { addSonarrSeries } from "@/providers/sonarr/add";
import { updateSonarrSeries } from "@/providers/sonarr/edit";
import {
	toSonarrSeriesSnapshot,
	type SonarrSeriesLibraryStatus,
} from "@/providers/sonarr/library";
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
import type { CheckSeriesStatusResponse } from "@/rpc/types";
import { buildSeriesStatusResponseFromLibraryStatus } from "@/rpc/status-response-adapter";
import type { AutoMappingOptions } from "@/mapping/auto-mapping/types";
import { ErrorCode, logError, normalizeError } from "@/shared/errors";
import type { RequestPriority } from "@/shared/utils/request-priority";
import type { AniListId } from "@/anilist";
import type { TvdbId } from "@/providers";
import type { ApiHandlerDeps } from "./handler-deps";

type SonarrStatusPayload = Pick<
	StatusInput,
	"anilistId" | "title" | "metadata"
>;

type ProviderStatusOptions = {
	force_verify?: boolean;
	network?: "never";
	priority?: RequestPriority;
};

type SonarrMappingResult =
	| {
			kind: "mapped";
			tvdbId: TvdbId;
			successfulSynonym?: string;
			mappingReason?: CheckSeriesStatusResponse["mappingReason"];
			mappingSource?: CheckSeriesStatusResponse["mappingSource"];
	  }
	| { kind: "unmapped" }
	| { kind: "failed"; response: CheckSeriesStatusResponse };

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
		sonarrClient,
		RadarrClient,
		mappingService,
		manualMappingService,
		anibridgeMappingStore,
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

			const requestOptions = buildStatusOptions(parsedInput);
			const status = await getSeriesStatusFromMappingAndLibrary(
				payload,
				requestOptions,
				{
					mappingService,
					manualMappingService,
					anibridgeMappingStore,
					sonarrLibrary,
					providerConfig,
					bumpLibraryRevision,
				},
			);
			return {
				...status,
				manualMappingActive: manualMappingService.has(
					"sonarr",
					parsedInput.anilistId,
				),
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

			const requestOptions = buildStatusOptions(parsedInput);

			const status = await radarrLibrary.getMovieStatus(
				payload,
				requestOptions,
			);
			return {
				...status,
				manualMappingActive: manualMappingService.has(
					"radarr",
					parsedInput.anilistId,
				),
			};
		},

		async getSeriesLibraryStatus(input) {
			const parsedInput = v.parse(SeriesLibraryStatusInputSchema, input);
			return getSonarrLibraryStatusForRpc({
				tvdbId: parsedInput.tvdbId,
				forceVerify: parsedInput.forceVerify === true,
				sonarrLibrary,
				providerConfig,
				bumpLibraryRevision,
			});
		},

		async getMovieLibraryStatus(input) {
			const parsedInput = v.parse(MovieLibraryStatusInputSchema, input);
			return radarrLibrary.getMovieLibraryStatus({
				tmdbId: parsedInput.tmdbId,
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
					client: sonarrClient,
				},
			);
			await sonarrLibrary.upsertSeriesSnapshot(
				toSonarrSeriesSnapshot(created),
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
						client: sonarrClient,
					},
				);
				await sonarrLibrary.upsertSeriesSnapshot(
					toSonarrSeriesSnapshot(updated),
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

function buildStatusOptions(input: StatusInput): ProviderStatusOptions {
	const options: ProviderStatusOptions = {};
	if (input.force_verify) options.force_verify = true;
	if (input.network) options.network = input.network;
	if (input.priority) options.priority = input.priority;
	return options;
}

async function getSonarrLibraryStatusForRpc(input: {
	tvdbId: TvdbId;
	forceVerify?: boolean;
	sonarrLibrary: ApiHandlerDeps["sonarrLibrary"];
	providerConfig: ApiHandlerDeps["providerConfig"];
	bumpLibraryRevision: ApiHandlerDeps["bumpLibraryRevision"];
}): Promise<SonarrSeriesLibraryStatus> {
	const credentials = await input.providerConfig.get("sonarr");
	if (!credentials) {
		await input.sonarrLibrary.clearSeriesSnapshotCache();
		return {
			provider: "sonarr",
			providerId: input.tvdbId,
			isInLibrary: false,
		};
	}

	const status = await input.sonarrLibrary.getSeriesLibraryStatusByTvdbId({
		tvdbId: input.tvdbId,
		credentials,
		...(input.forceVerify === undefined
			? {}
			: { forceVerify: input.forceVerify }),
		onCacheChanged: () => input.bumpLibraryRevision("sonarr"),
	});
	return status;
}

async function getSeriesStatusFromMappingAndLibrary(
	payload: SonarrStatusPayload,
	options: ProviderStatusOptions,
	deps: Pick<
		ApiHandlerDeps,
		| "mappingService"
		| "manualMappingService"
		| "anibridgeMappingStore"
		| "sonarrLibrary"
		| "providerConfig"
		| "bumpLibraryRevision"
	>,
): Promise<CheckSeriesStatusResponse> {
	logSeriesStatusStart(payload, options);

	const credentials = await deps.providerConfig.get("sonarr");
	if (!credentials) {
		return {
			providerId: null,
			providerMappingState: "unknown",
			isInLibrary: null,
			mappingUnknownReason: "provider-not-configured",
		};
	}

	if (options.network === "never") {
		return {
			providerId: null,
			providerMappingState: "unknown",
			isInLibrary: null,
			mappingUnknownReason: "network-disabled",
		};
	}

	const mapping = await resolveSeriesMapping(
		payload,
		payload.title?.trim(),
		options,
		deps,
	);
	if (mapping.kind === "failed") return mapping.response;
	if (mapping.kind === "unmapped") return resolveUnmappedSeries(payload, deps);

	return buildMappedSeriesStatus(payload.anilistId, mapping, options, deps);
}

async function resolveUnmappedSeries(
	payload: SonarrStatusPayload,
	deps: Pick<ApiHandlerDeps, "mappingService">,
): Promise<CheckSeriesStatusResponse> {
	const unresolved = await resolveUnknownSeriesOutcome(
		payload.anilistId,
		deps,
	);
	if (import.meta.env.DEV) {
		console.debug(
			`[ani2arr | SonarrStatus] result anilistId=${payload.anilistId} outcome=unresolved`,
		);
	}
	return {
		providerId: null,
		isInLibrary: null,
		...unresolved,
	};
}

async function buildMappedSeriesStatus(
	anilistId: AniListId,
	mapping: Extract<SonarrMappingResult, { kind: "mapped" }>,
	options: ProviderStatusOptions,
	deps: Pick<
		ApiHandlerDeps,
		| "sonarrLibrary"
		| "providerConfig"
		| "manualMappingService"
		| "anibridgeMappingStore"
		| "bumpLibraryRevision"
	>,
): Promise<CheckSeriesStatusResponse> {
	const libraryStatus = await getSonarrLibraryStatusForRpc({
		tvdbId: mapping.tvdbId,
		forceVerify: options.force_verify === true,
		sonarrLibrary: deps.sonarrLibrary,
		providerConfig: deps.providerConfig,
		bumpLibraryRevision: deps.bumpLibraryRevision,
	});
	const status = buildSeriesStatusResponseFromLibraryStatus({
		providerId: mapping.tvdbId,
		...(mapping.mappingSource ? { mappingSource: mapping.mappingSource } : {}),
		...(mapping.mappingReason ? { mappingReason: mapping.mappingReason } : {}),
		libraryStatus,
	});
	const linkedAniListIds = getLinkedAniListIds(mapping.tvdbId, deps);

	return {
		...status,
		...(mapping.successfulSynonym
			? { successfulSynonym: mapping.successfulSynonym }
			: {}),
		...(linkedAniListIds ? { linkedAniListIds } : {}),
	};
}

function logSeriesStatusStart(
	payload: SonarrStatusPayload,
	options: ProviderStatusOptions,
): void {
	if (!import.meta.env.DEV) return;

	const priority = options.priority ?? "normal";
	const network = options.network ?? "allow";
	console.debug(
		`[ani2arr | SonarrStatus] start anilistId=${payload.anilistId} priority=${priority} network=${network} force_verify=${String(options.force_verify === true)}`,
	);
}

async function resolveSeriesMapping(
	payload: SonarrStatusPayload,
	normalizedTitle: string | undefined,
	options: ProviderStatusOptions,
	deps: Pick<ApiHandlerDeps, "mappingService">,
): Promise<SonarrMappingResult> {
	if (options.priority === "high") {
		try {
			deps.mappingService.prioritizeAniListMedia?.(payload.anilistId, {
				schedule: false,
			});
		} catch {
			// best-effort
		}
	}

	try {
		logSeriesLookupStart(payload, options);
		const mapping = await deps.mappingService.resolveProviderId(
			"sonarr",
			payload.anilistId,
			buildMappingOptions(payload, normalizedTitle, options),
		);
		if (!mapping) return { kind: "unmapped" };

		return {
			kind: "mapped",
			tvdbId: mapping.providerId,
			...(mapping.successfulSynonym
				? { successfulSynonym: mapping.successfulSynonym }
				: {}),
			mappingReason: mapping.reason,
			mappingSource: resolveMappingSource(mapping.reason),
		};
	} catch (error) {
		const response = toSeriesMappingErrorResponse(error, payload);
		return { kind: "failed", response };
	}
}

function buildMappingOptions(
	payload: SonarrStatusPayload,
	normalizedTitle: string | undefined,
	options: ProviderStatusOptions,
): AutoMappingOptions {
	const mappingOptions: AutoMappingOptions = {};
	if (options.priority) mappingOptions.priority = options.priority;
	if (options.force_verify) mappingOptions.forceLookupNetwork = true;

	const hints: NonNullable<AutoMappingOptions["hints"]> = {};
	if (normalizedTitle) hints.primaryTitle = normalizedTitle;
	if (payload.metadata) hints.domMedia = payload.metadata;
	if (Object.keys(hints).length > 0) mappingOptions.hints = hints;
	return mappingOptions;
}

function logSeriesLookupStart(
	payload: SonarrStatusPayload,
	options: ProviderStatusOptions,
): void {
	if (!import.meta.env.DEV) return;

	console.debug(
		`[ani2arr | SonarrStatus] lookup-start anilistId=${payload.anilistId} priority=${options.priority ?? "normal"} network=${options.network ?? "allow"} force_verify=${String(options.force_verify === true)}`,
	);
}

function toSeriesMappingErrorResponse(
	error: unknown,
	payload: SonarrStatusPayload,
): CheckSeriesStatusResponse {
	const normalized = normalizeError(error);
	if (
		normalized.code === ErrorCode.CONFIGURATION_ERROR ||
		normalized.code === ErrorCode.SONARR_NOT_CONFIGURED ||
		(normalized.code === ErrorCode.VALIDATION_ERROR &&
			normalized.details?.reason === "network-disabled")
	) {
		return {
			providerId: null,
			providerMappingState: "unknown",
			isInLibrary: null,
			mappingUnknownReason:
				normalized.details?.reason === "network-disabled"
					? "network-disabled"
					: "provider-not-configured",
		};
	}

	logError(normalized, `SonarrStatus:getSeriesStatus:${payload.anilistId}`);
	return {
		providerId: null,
		providerMappingState: "unknown",
		isInLibrary: null,
		mappingUnknownReason: "lookup-failed",
	};
}

function resolveMappingSource(
	reason: NonNullable<CheckSeriesStatusResponse["mappingReason"]>,
): NonNullable<CheckSeriesStatusResponse["mappingSource"]> {
	switch (reason) {
		case "manual-override": {
			return "manual";
		}
		case "exact-upstream": {
			return "upstream";
		}
		default: {
			return "auto";
		}
	}
}

async function resolveUnknownSeriesOutcome(
	anilistId: AniListId,
	deps: Pick<ApiHandlerDeps, "mappingService">,
): Promise<
	Pick<
		CheckSeriesStatusResponse,
		"providerMappingState" | "mappingUnknownReason" | "resolverOutcome"
	>
> {
	const resolverState = await deps.mappingService.getAutoMapping(
		"sonarr",
		anilistId,
	);
	if (resolverState?.state === "ambiguous") {
		return {
			providerMappingState: "unknown",
			mappingUnknownReason: "ambiguous",
			resolverOutcome: "ambiguous",
		};
	}
	return {
		providerMappingState: "unmapped",
		...(resolverState?.state === "unresolved"
			? { resolverOutcome: "unresolved" as const }
			: {}),
	};
}

function getLinkedAniListIds(
	tvdbId: TvdbId,
	deps: Pick<
		ApiHandlerDeps,
		"manualMappingService" | "anibridgeMappingStore"
	>,
): number[] | undefined {
	const linked = new Set<number>(
		deps.manualMappingService.getLinkedAniListIds("sonarr", tvdbId),
	);
	for (const id of deps.anibridgeMappingStore.getAniListIdsForTvdb(tvdbId)) {
		linked.add(id);
	}
	return linked.size > 0 ? [...linked] : undefined;
}
