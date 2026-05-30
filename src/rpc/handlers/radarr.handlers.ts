/** RPC handlers for Radarr form resources, search, and validation flows. */
// src/rpc/handlers/radarr.handlers.ts

import * as v from "valibot";
import {
	anibridgeMappingStore,
	bumpLibraryRevision,
	manualMappingService,
	manualMappingsReady,
	mappingService,
	radarrClient,
	radarrLibrary,
	scheduleLibraryRefresh,
} from "@/background/api-services";
import {
	getProviderConfig,
	requireProviderConfig,
	requireProviderCredentials,
} from "@/background/provider-config";
import type { AniListId } from "@/anilist";
import { addRadarrMovie } from "@/providers/radarr/add";
import { updateRadarrMovie as updateRadarrMovieProvider } from "@/providers/radarr/edit";
import {
	toRadarrMovieSnapshot,
	type RadarrMovieLibraryStatus,
} from "@/providers/radarr/library";
import {
	parseTmdbIdOrNull,
	type ProviderCredentials,
	type ProviderFormResources,
	type TmdbId,
} from "@/providers";
import {
	AddRadarrInputSchema,
	GetProviderFormResourcesInputSchema,
	MovieLibraryStatusInputSchema,
	RadarrLookupInputSchema,
	StatusInputSchema,
	UpdateRadarrInputSchema,
	ValidateTmdbInputSchema,
} from "@/rpc/schemas";
import type { CheckMovieStatusResponse } from "@/rpc/types";
import { buildRadarrTargetSummary } from "@/rpc/provider-target-summary";
import { buildMovieStatusResponseFromLibraryStatus } from "@/rpc/status-response-adapter";
import { ErrorCode, logError, normalizeError } from "@/shared/errors";
import { normalizeInputCredentials } from "./provider-credentials";
import {
	buildMappingOptions,
	buildStatusOptions,
	buildStatusPayload,
	resolveMappingSource,
	type ProviderStatusOptions,
	type ProviderStatusPayload,
} from "./provider-status.helpers";

type RadarrMappingResult =
	| {
			kind: "mapped";
			tmdbId: TmdbId;
			successfulSynonym?: string;
			mappingReason?: CheckMovieStatusResponse["mappingReason"];
			mappingSource?: CheckMovieStatusResponse["mappingSource"];
	  }
	| { kind: "unmapped" }
	| { kind: "failed"; response: CheckMovieStatusResponse };

const getLinkedRadarrAniListIds = (tmdbId: TmdbId): number[] => {
	const ids = new Set<number>(
		manualMappingService.getLinkedAniListIds("radarr", tmdbId),
	);
	for (const id of anibridgeMappingStore.getAniListIdsForTmdb(tmdbId)) {
		ids.add(id);
	}
	return [...ids];
};

export const radarrHandlers = {
	async getMovieStatus(input: unknown) {
		const parsedInput = v.parse(StatusInputSchema, input);
		await manualMappingsReady;

		const payload = buildStatusPayload(parsedInput);
		const status = await getRadarrStatusFromMappingAndLibrary(
			payload,
			buildStatusOptions(parsedInput),
		);
		return {
			...status,
			manualMappingActive: manualMappingService.has(
				"radarr",
				parsedInput.anilistId,
			),
		};
	},

	async getMovieLibraryStatus(input: unknown) {
		const parsedInput = v.parse(MovieLibraryStatusInputSchema, input);
		return getRadarrLibraryStatusForRpc({
			tmdbId: parsedInput.tmdbId,
			forceVerify: parsedInput.forceVerify === true,
		});
	},

	async addToRadarr(input: unknown) {
		const parsedInput = v.parse(AddRadarrInputSchema, input);
		const { credentials, options } = await requireProviderConfig("radarr");
		await manualMappingsReady;
		const created = await addRadarrMovie(
			{
				tmdbId: parsedInput.tmdbId,
				form: parsedInput.form,
				defaults: options.providers.radarr.defaults,
				credentials,
			},
			{ client: radarrClient },
		);
		await radarrLibrary.upsertMovieSnapshot(toRadarrMovieSnapshot(created));
		scheduleLibraryRefresh("radarr");
		await bumpLibraryRevision("radarr");
		return created;
	},

	async updateRadarrMovie(input: unknown) {
		const parsedInput = v.parse(UpdateRadarrInputSchema, input);
		const credentials = await requireProviderCredentials("radarr");
		const updated = await updateRadarrMovieProvider(
			{
				tmdbId: parsedInput.tmdbId,
				form: parsedInput.form,
				credentials,
			},
			{ client: radarrClient },
		);
		await radarrLibrary.upsertMovieSnapshot(toRadarrMovieSnapshot(updated));
		scheduleLibraryRefresh("radarr");
		await bumpLibraryRevision("radarr");
		return updated;
	},

	async getRadarrFormResources(input?: unknown) {
		const parsedInput = v.parse(GetProviderFormResourcesInputSchema, input);
		const maybeCredentials = parsedInput?.credentials;
		const credentials: ProviderCredentials =
			maybeCredentials?.url && maybeCredentials.apiKey
				? normalizeInputCredentials("radarr", maybeCredentials)
				: await requireProviderCredentials("radarr");

		const [qualityProfiles, rootFolders, tags] = await Promise.all([
			radarrClient.getQualityProfiles(credentials),
			radarrClient.getRootFolders(credentials),
			radarrClient.getTags(credentials),
		]);

		const formResources: ProviderFormResources = {
			qualityProfiles,
			rootFolders: rootFolders.map((folder) => ({
				id: folder.id,
				path: folder.path,
				...(folder.freeSpace === undefined
					? {}
					: { freeSpace: folder.freeSpace }),
			})),
			tags,
		};

		return formResources;
	},

	async searchRadarr(input: unknown) {
		const parsedInput = v.parse(RadarrLookupInputSchema, input);
		const credentials = await requireProviderCredentials("radarr");
		await manualMappingsReady;

		const [results, library] = await Promise.all([
			radarrClient.lookupMovies(parsedInput.term, credentials),
			radarrLibrary.getMovieSnapshots(credentials),
		]);

		const libraryTmdbIds = library.map((movie) => movie.tmdbId);
		const linkedAniListIdsByTmdbId: Record<number, number[]> = {};
		const uniqueTmdbIds = new Set<TmdbId>();

		for (const movie of results) {
			const tmdbId = parseTmdbIdOrNull(movie?.tmdbId);
			if (tmdbId !== null) {
				uniqueTmdbIds.add(tmdbId);
			}
		}

		for (const tmdbId of uniqueTmdbIds) {
			const linked = getLinkedRadarrAniListIds(tmdbId);
			if (linked.length > 0) {
				linkedAniListIdsByTmdbId[tmdbId] = linked;
			}
		}

		return {
			results,
			libraryTmdbIds,
			...(Object.keys(linkedAniListIdsByTmdbId).length > 0
				? { linkedAniListIdsByTmdbId }
				: {}),
		};
	},

	async validateTmdbId(input: unknown) {
		const parsedInput = v.parse(ValidateTmdbInputSchema, input);
		const credentials = await requireProviderCredentials("radarr");
		const found = await radarrClient.findMovieByTmdbId(
			parsedInput.tmdbId,
			credentials,
		);
		let inCatalog = false;
		try {
			const lookup = await radarrClient.lookupMovieByTmdbId(
				parsedInput.tmdbId,
				credentials,
			);
			inCatalog = lookup?.tmdbId === parsedInput.tmdbId;
		} catch {
			// ignore
		}
		return { isInLibrary: !!found, inCatalog };
	},
};

async function getRadarrLibraryStatusForRpc(input: {
	tmdbId: TmdbId;
	forceVerify?: boolean;
}): Promise<RadarrMovieLibraryStatus> {
	const credentials = await getProviderConfig("radarr");
	if (!credentials) {
		await radarrLibrary.clearMovieSnapshotCache();
		return {
			provider: "radarr",
			providerId: input.tmdbId,
			isInLibrary: false,
		};
	}

	return radarrLibrary.getMovieLibraryStatusByTmdbId({
		tmdbId: input.tmdbId,
		credentials,
		...(input.forceVerify === undefined
			? {}
			: { forceVerify: input.forceVerify }),
		onCacheChanged: () => bumpLibraryRevision("radarr"),
	});
}

async function getRadarrStatusFromMappingAndLibrary(
	payload: ProviderStatusPayload,
	options: ProviderStatusOptions,
): Promise<CheckMovieStatusResponse> {
	const credentials = await getProviderConfig("radarr");
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

	const mapping = await resolveRadarrMapping(
		payload,
		payload.title?.trim(),
		options,
	);
	if (mapping.kind === "failed") return mapping.response;
	if (mapping.kind === "unmapped") return resolveUnmappedRadarr(payload);

	return buildMappedRadarrStatus(mapping, options, credentials.url);
}

async function resolveRadarrMapping(
	payload: ProviderStatusPayload,
	normalizedTitle: string | undefined,
	options: ProviderStatusOptions,
): Promise<RadarrMappingResult> {
	if (options.priority === "high") {
		try {
			mappingService.prioritizeAniListMedia?.(payload.anilistId, {
				schedule: false,
			});
		} catch {
			// best-effort
		}
	}

	try {
		const mapping = await mappingService.resolveProviderId(
			"radarr",
			payload.anilistId,
			buildMappingOptions(payload, normalizedTitle, options),
		);
		if (!mapping) return { kind: "unmapped" };

		return {
			kind: "mapped",
			tmdbId: mapping.providerId,
			...(mapping.successfulSynonym
				? { successfulSynonym: mapping.successfulSynonym }
				: {}),
			mappingReason: mapping.reason,
			mappingSource: resolveMappingSource(mapping.reason),
		};
	} catch (error) {
		return {
			kind: "failed",
			response: toRadarrMappingErrorResponse(error, payload),
		};
	}
}

async function resolveUnmappedRadarr(
	payload: ProviderStatusPayload,
): Promise<CheckMovieStatusResponse> {
	const unresolved = await resolveUnknownRadarrOutcome(payload.anilistId);
	if (import.meta.env.DEV) {
		console.debug(
			`[ani2arr | RadarrStatus] result anilistId=${payload.anilistId} outcome=unresolved`,
		);
	}
	return {
		providerId: null,
		isInLibrary: null,
		...unresolved,
	};
}

async function buildMappedRadarrStatus(
	mapping: Extract<RadarrMappingResult, { kind: "mapped" }>,
	options: ProviderStatusOptions,
	baseUrl: string,
): Promise<CheckMovieStatusResponse> {
	const libraryStatus = await getRadarrLibraryStatusForRpc({
		tmdbId: mapping.tmdbId,
		forceVerify: options.force_verify === true,
	});
	const status = buildMovieStatusResponseFromLibraryStatus({
		providerId: mapping.tmdbId,
		...(mapping.mappingSource ? { mappingSource: mapping.mappingSource } : {}),
		...(mapping.mappingReason ? { mappingReason: mapping.mappingReason } : {}),
		libraryStatus,
	});
	const linkedAniListIds = getLinkedRadarrAniListIdsOrUndefined(mapping.tmdbId);
	const targetSummary = buildRadarrTargetSummary({
		tmdbId: mapping.tmdbId,
		movie: status.movie,
		isInLibrary: status.isInLibrary,
		baseUrl,
		linkedAniListIds,
	});

	return {
		...status,
		...(mapping.successfulSynonym
			? { successfulSynonym: mapping.successfulSynonym }
			: {}),
		...(linkedAniListIds ? { linkedAniListIds } : {}),
		...(targetSummary === null ? {} : { targetSummary }),
	};
}

function toRadarrMappingErrorResponse(
	error: unknown,
	payload: ProviderStatusPayload,
): CheckMovieStatusResponse {
	const normalized = normalizeError(error);
	if (
		normalized.code === ErrorCode.CONFIGURATION_ERROR ||
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

	logError(normalized, `RadarrStatus:getMovieStatus:${payload.anilistId}`);
	return {
		providerId: null,
		providerMappingState: "unknown",
		isInLibrary: null,
		mappingUnknownReason: "lookup-failed",
	};
}

async function resolveUnknownRadarrOutcome(
	anilistId: AniListId,
): Promise<
	Pick<
		CheckMovieStatusResponse,
		"providerMappingState" | "mappingUnknownReason" | "resolverOutcome"
	>
> {
	const resolverState = await mappingService.getAutoMapping(
		"radarr",
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

function getLinkedRadarrAniListIdsOrUndefined(
	tmdbId: TmdbId,
): number[] | undefined {
	const linked = getLinkedRadarrAniListIds(tmdbId);
	return linked.length > 0 ? linked : undefined;
}
