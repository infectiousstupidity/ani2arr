/** RPC handlers for Sonarr form resources, search, and validation flows. */
// src/rpc/handlers/sonarr.handlers.ts

import * as v from "valibot";
import {
	anibridgeMappingStore,
	bumpLibraryRevision,
	manualMappingService,
	manualMappingsReady,
	mappingService,
	scheduleLibraryRefresh,
	sonarrClient,
	sonarrLibrary,
} from "@/background/api-services";
import {
	getProviderConfig,
	requireProviderConfig,
	requireProviderCredentials,
} from "@/background/provider-config";
import type { AniListId } from "@/anilist";
import { addSonarrSeries } from "@/providers/sonarr/add";
import { updateSonarrSeries as updateSonarrSeriesProvider } from "@/providers/sonarr/edit";
import {
	toSonarrSeriesSnapshot,
	type SonarrSeriesLibraryStatus,
} from "@/providers/sonarr/library";
import {
	parseTvdbIdOrNull,
	type ProviderCredentials,
	type ProviderRootFolder,
	type TvdbId,
} from "@/providers";
import type { SonarrSeriesSnapshot } from "@/providers/sonarr/types";
import {
	AddSonarrInputSchema,
	GetProviderFormResourcesInputSchema,
	SeriesLibraryStatusInputSchema,
	SonarrLookupInputSchema,
	StatusInputSchema,
	UpdateSonarrInputSchema,
	ValidateTvdbInputSchema,
} from "@/rpc/schemas";
import type { CheckSeriesStatusResponse } from "@/rpc/types";
import { buildSeriesStatusResponseFromLibraryStatus } from "@/rpc/status-response-adapter";
import { buildSonarrTargetSummary } from "@/rpc/provider-target-summary";
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

const getLinkedSonarrAniListIds = (tvdbId: TvdbId): number[] => {
	const ids = new Set<number>(
		manualMappingService.getLinkedAniListIds("sonarr", tvdbId),
	);
	for (const id of anibridgeMappingStore.getAniListIdsForTvdb(tvdbId)) {
		ids.add(id);
	}
	return [...ids];
};

export const sonarrHandlers = {
	async getSeriesStatus(input: unknown) {
		const parsedInput = v.parse(StatusInputSchema, input);
		await manualMappingsReady;

		const payload = buildStatusPayload(parsedInput);
		const status = await getSeriesStatusFromMappingAndLibrary(
			payload,
			buildStatusOptions(parsedInput),
		);
		return {
			...status,
			manualMappingActive: manualMappingService.has(
				"sonarr",
				parsedInput.anilistId,
			),
		};
	},

	async getSeriesLibraryStatus(input: unknown) {
		const parsedInput = v.parse(SeriesLibraryStatusInputSchema, input);
		return getSonarrLibraryStatusForRpc({
			tvdbId: parsedInput.tvdbId,
			forceVerify: parsedInput.forceVerify === true,
		});
	},

	async addToSonarr(input: unknown) {
		const parsedInput = v.parse(AddSonarrInputSchema, input);
		const { credentials, options } = await requireProviderConfig("sonarr");
		await manualMappingsReady;
		const created = await addSonarrSeries(
			{
				tvdbId: parsedInput.tvdbId,
				title: parsedInput.title,
				form: parsedInput.form,
				defaults: options.providers.sonarr.defaults,
				credentials,
			},
			{ client: sonarrClient },
		);
		await sonarrLibrary.upsertSeriesSnapshot(toSonarrSeriesSnapshot(created));
		scheduleLibraryRefresh("sonarr");
		await bumpLibraryRevision("sonarr");
		return created;
	},

	async updateSonarrSeries(input: unknown) {
		const parsedInput = v.parse(UpdateSonarrInputSchema, input);
		const credentials = await requireProviderCredentials("sonarr");
		try {
			const updated = await updateSonarrSeriesProvider(
				{
					tvdbId: parsedInput.tvdbId,
					title: parsedInput.title,
					form: parsedInput.form,
					credentials,
					...(parsedInput.monitoringAction === undefined
						? {}
						: { monitoringAction: parsedInput.monitoringAction }),
				},
				{ client: sonarrClient },
			);
			await sonarrLibrary.upsertSeriesSnapshot(toSonarrSeriesSnapshot(updated));
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

	async getSonarrFormResources(input?: unknown) {
		const parsedInput = v.parse(GetProviderFormResourcesInputSchema, input);
		const maybeCredentials = parsedInput?.credentials;
		const credentials: ProviderCredentials =
			maybeCredentials?.url && maybeCredentials.apiKey
				? normalizeInputCredentials("sonarr", maybeCredentials)
				: await requireProviderCredentials("sonarr");

		const [qualityProfiles, rootFolders, tags] = await Promise.all([
			sonarrClient.getQualityProfiles(credentials),
			sonarrClient.getRootFolders(credentials),
			sonarrClient.getTags(credentials),
		]);

		return {
			qualityProfiles,
			rootFolders: rootFolders.map((rootFolder) =>
				toProviderRootFolder(rootFolder),
			),
			tags,
		};
	},

	async searchSonarr(input: unknown) {
		const parsedInput = v.parse(SonarrLookupInputSchema, input);
		const credentials = await requireProviderCredentials("sonarr");
		await manualMappingsReady;

		const [results, library] = await Promise.all([
			sonarrClient.lookupSeries(parsedInput.term, credentials),
			sonarrLibrary.getSeriesSnapshots(credentials),
		]);

		const libraryTvdbIds = library.map((s) => s.tvdbId);
		const statsMap: Record<
			number,
			NonNullable<SonarrSeriesSnapshot["statistics"]>
		> = {};
		for (const s of library) {
			if (s.statistics) {
				statsMap[s.tvdbId] = s.statistics;
			}
		}

		const linkedAniListIdsByTvdbId: Record<number, number[]> = {};
		const uniqueTvdbIds = new Set<TvdbId>();
		for (const series of results) {
			const tvdbId = parseTvdbIdOrNull(series?.tvdbId);
			if (tvdbId !== null) {
				uniqueTvdbIds.add(tvdbId);
			}
		}
		for (const tvdbId of uniqueTvdbIds) {
			const linked = getLinkedSonarrAniListIds(tvdbId);
			if (linked.length > 0) {
				linkedAniListIdsByTvdbId[tvdbId] = linked;
			}
		}

		return {
			results,
			libraryTvdbIds,
			...(Object.keys(statsMap).length > 0 ? { statsMap } : {}),
			...(Object.keys(linkedAniListIdsByTvdbId).length > 0
				? { linkedAniListIdsByTvdbId }
				: {}),
		};
	},

	async validateTvdbId(input: unknown) {
		const parsedInput = v.parse(ValidateTvdbInputSchema, input);
		const credentials = await requireProviderCredentials("sonarr");
		const found = await sonarrClient.findSeriesByTvdbId(
			parsedInput.tvdbId,
			credentials,
		);
		let inCatalog = false;
		try {
			const lookup = await sonarrClient.lookupSeriesByTvdbId(
				parsedInput.tvdbId,
				credentials,
			);
			inCatalog = lookup !== null;
		} catch {
			// ignore
		}
		return { isInLibrary: !!found, inCatalog };
	},
};

async function getSonarrLibraryStatusForRpc(input: {
	tvdbId: TvdbId;
	forceVerify?: boolean;
}): Promise<SonarrSeriesLibraryStatus> {
	const credentials = await getProviderConfig("sonarr");
	if (!credentials) {
		await sonarrLibrary.clearSeriesSnapshotCache();
		return {
			provider: "sonarr",
			providerId: input.tvdbId,
			isInLibrary: false,
		};
	}

	return sonarrLibrary.getSeriesLibraryStatusByTvdbId({
		tvdbId: input.tvdbId,
		credentials,
		...(input.forceVerify === undefined
			? {}
			: { forceVerify: input.forceVerify }),
		onCacheChanged: () => bumpLibraryRevision("sonarr"),
	});
}

async function getSeriesStatusFromMappingAndLibrary(
	payload: ProviderStatusPayload,
	options: ProviderStatusOptions,
): Promise<CheckSeriesStatusResponse> {
	const credentials = await getProviderConfig("sonarr");
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
	);
	if (mapping.kind === "failed") return mapping.response;
	if (mapping.kind === "unmapped") return resolveUnmappedSeries(payload);

	return buildMappedSeriesStatus(mapping, options, credentials.url);
}

async function resolveSeriesMapping(
	payload: ProviderStatusPayload,
	normalizedTitle: string | undefined,
	options: ProviderStatusOptions,
): Promise<SonarrMappingResult> {
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
		return {
			kind: "failed",
			response: toSeriesMappingErrorResponse(error, payload),
		};
	}
}

async function resolveUnmappedSeries(
	payload: ProviderStatusPayload,
): Promise<CheckSeriesStatusResponse> {
	const unresolved = await resolveUnknownSeriesOutcome(payload.anilistId);
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
	mapping: Extract<SonarrMappingResult, { kind: "mapped" }>,
	options: ProviderStatusOptions,
	baseUrl: string,
): Promise<CheckSeriesStatusResponse> {
	const libraryStatus = await getSonarrLibraryStatusForRpc({
		tvdbId: mapping.tvdbId,
		forceVerify: options.force_verify === true,
	});
	const status = buildSeriesStatusResponseFromLibraryStatus({
		providerId: mapping.tvdbId,
		...(mapping.mappingSource ? { mappingSource: mapping.mappingSource } : {}),
		...(mapping.mappingReason ? { mappingReason: mapping.mappingReason } : {}),
		libraryStatus,
	});
	const linkedAniListIds = getLinkedSonarrAniListIdsOrUndefined(mapping.tvdbId);
	const targetSummary = buildSonarrTargetSummary({
		tvdbId: mapping.tvdbId,
		series: status.series,
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

function toSeriesMappingErrorResponse(
	error: unknown,
	payload: ProviderStatusPayload,
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

async function resolveUnknownSeriesOutcome(
	anilistId: AniListId,
): Promise<
	Pick<
		CheckSeriesStatusResponse,
		"providerMappingState" | "mappingUnknownReason" | "resolverOutcome"
	>
> {
	const resolverState = await mappingService.getAutoMapping(
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

function getLinkedSonarrAniListIdsOrUndefined(
	tvdbId: TvdbId,
): number[] | undefined {
	const linked = getLinkedSonarrAniListIds(tvdbId);
	return linked.length > 0 ? linked : undefined;
}

function toProviderRootFolder(rootFolder: {
	id: number;
	path: string;
	freeSpace?: number | null | undefined;
}): ProviderRootFolder {
	return rootFolder.freeSpace === undefined
		? { id: rootFolder.id, path: rootFolder.path }
		: {
				id: rootFolder.id,
				path: rootFolder.path,
				freeSpace: rootFolder.freeSpace,
			};
}
