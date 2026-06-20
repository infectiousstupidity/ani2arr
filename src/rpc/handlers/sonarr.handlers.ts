/** RPC handlers for Sonarr form resources, search, and validation flows. */
// src/rpc/handlers/sonarr.handlers.ts

import {
	bumpLibraryRevision,
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
import type { MappingResult } from "@/mapping/types";
import { addSonarrSeries } from "@/providers/sonarr/add";
import { updateSonarrSeries as updateSonarrSeriesProvider } from "@/providers/sonarr/edit";
import {
	toSonarrSeriesSnapshot,
	type SonarrSeriesLibraryStatus,
} from "@/providers/sonarr/library";
import { parseTvdbIdOrNull } from "@/providers/schemas";
import type {
	ProviderCredentials,
	ProviderRootFolder,
} from "@/providers/types";
import type { TvdbId } from "@/providers/schemas";
import type { SonarrSeriesSnapshot } from "@/providers/sonarr/types";
import type {
	AddSonarrInput,
	GetSeriesStatusOutput,
	GetProviderFormResourcesInput,
	SonarrLookupInput,
	StatusInput,
	UpdateSonarrInput,
	ValidateTvdbInput,
} from "@/rpc/types";
import { sourceFromInput } from "@/rpc/source-input";
import { normalizeError } from "@/shared/errors/error-utils";
import { normalizeInputCredentials } from "./provider-credentials";

type SonarrMappingResult =
	| {
			kind: "mapped";
			mapping: Extract<MappingResult, { kind: "mapped" }>;
			tvdbId: TvdbId;
	  }
	| { kind: "unmapped"; mapping: MappingResult };

export const sonarrHandlers = {
	getSeriesStatus(input: StatusInput) {
		return getSeriesStatusFromMappingAndLibrary(input);
	},

	async addToSonarr(input: AddSonarrInput) {
		const { credentials, options } = await requireProviderConfig("sonarr");
		const created = await addSonarrSeries(
			{
				tvdbId: input.tvdbId,
				title: input.title,
				form: input.form,
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

	async updateSonarrSeries(input: UpdateSonarrInput) {
		const credentials = await requireProviderCredentials("sonarr");
		try {
			const updated = await updateSonarrSeriesProvider(
				{
					tvdbId: input.tvdbId,
					title: input.title,
					form: input.form,
					credentials,
					...(input.monitoringAction === undefined
						? {}
						: { monitoringAction: input.monitoringAction }),
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

	async getSonarrFormResources(input?: GetProviderFormResourcesInput) {
		const maybeCredentials = input?.credentials;
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

	async searchSonarr(input: SonarrLookupInput) {
		const credentials = await requireProviderCredentials("sonarr");

		const [results, library] = await Promise.all([
			sonarrClient.lookupSeries(input.term, credentials),
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

		const linkedAniListIds = await mappingService.getLinkedAniListIdsByProviderIds(
			"sonarr",
			uniqueTvdbIds,
		);
		for (const [tvdbId, linked] of linkedAniListIds) {
			linkedAniListIdsByTvdbId[tvdbId] = linked;
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

	async validateTvdbId(input: ValidateTvdbInput) {
		const credentials = await requireProviderCredentials("sonarr");
		const found = await sonarrClient.findSeriesByTvdbId(
			input.tvdbId,
			credentials,
		);
		let inCatalog = false;
		try {
			const lookup = await sonarrClient.lookupSeriesByTvdbId(
				input.tvdbId,
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
	});
}

async function getSeriesStatusFromMappingAndLibrary(
	input: StatusInput,
): Promise<GetSeriesStatusOutput> {
	const credentials = await getProviderConfig("sonarr");
	if (!credentials) {
		return {
			mapping: unmappedMapping(),
			isInLibrary: null,
		};
	}

	const mapping = await resolveSeriesMapping(input);
	if (mapping.kind === "unmapped") {
		return {
			mapping: mapping.mapping,
			isInLibrary: null,
		};
	}

	return buildMappedSeriesStatus(mapping, input);
}

async function resolveSeriesMapping(
	input: StatusInput,
): Promise<SonarrMappingResult> {
	const source = sourceFromInput(input);
	const mapping = await mappingService.resolveMapping("sonarr", source, {
		forceRetry: input.force_mapping_retry === true,
		...(input.title === undefined ? {} : { title: input.title }),
		...(input.metadata === undefined ? {} : { metadata: input.metadata }),
	});
	if (mapping.kind === "mapped") {
		const tvdbId = parseTvdbIdOrNull(mapping.providerId);
		if (tvdbId === null) return { kind: "unmapped", mapping };

		return {
			kind: "mapped",
			tvdbId,
			mapping,
		};
	}
	return { kind: "unmapped", mapping };
}

async function buildMappedSeriesStatus(
	mapping: Extract<SonarrMappingResult, { kind: "mapped" }>,
	input: StatusInput,
): Promise<GetSeriesStatusOutput> {
	const libraryStatus = await getSonarrLibraryStatusForRpc({
		tvdbId: mapping.tvdbId,
		forceVerify: input.force_verify === true,
	});

	return {
		mapping: mapping.mapping,
		isInLibrary: libraryStatus.isInLibrary,
		...(libraryStatus.series ? { series: libraryStatus.series } : {}),
	};
}

function unmappedMapping(): MappingResult {
	return { kind: "unmapped", hadResolveAttempt: false };
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
