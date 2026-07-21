/** RPC handlers for Radarr form resources, search, and validation flows. */
// src/rpc/handlers/radarr.handlers.ts

import {
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
import type { MappingResult } from "@/mapping/types";
import { addRadarrMovie } from "@/providers/radarr/add";
import { updateRadarrMovie as updateRadarrMovieProvider } from "@/providers/radarr/edit";
import {
	toRadarrMovieSnapshot,
	type RadarrMovieLibraryStatus,
} from "@/providers/radarr/library";
import { parseTmdbIdOrNull } from "@/providers/schemas";
import type {
	ProviderCredentials,
	ProviderFormResources,
} from "@/providers/types";
import type { TmdbId } from "@/providers/schemas";
import type {
	AddRadarrInput,
	GetMovieStatusOutput,
	GetProviderFormResourcesInput,
	RadarrLookupInput,
	StatusInput,
	UpdateRadarrInput,
	ValidateTmdbInput,
} from "@/rpc/types";
import { bumpProviderLibraryRevision } from "@/rpc/revision-signals";
import { resolveAniListIdFromInput } from "@/rpc/source-input";
import { normalizeInputCredentials } from "./provider-credentials";

type RadarrMappingResult =
	| {
			kind: "mapped";
			mapping: Extract<MappingResult, { kind: "mapped" }>;
			tmdbId: TmdbId;
	  }
	| { kind: "unmapped"; mapping: MappingResult };

export const radarrHandlers = {
	getMovieStatus(input: StatusInput) {
		return getRadarrStatusFromMappingAndLibrary(input);
	},

	async addToRadarr(input: AddRadarrInput) {
		const { credentials, options } = await requireProviderConfig("radarr");
		const created = await addRadarrMovie(
			{
				tmdbId: input.tmdbId,
				form: input.form,
				defaults: options.providers.radarr.defaults,
				credentials,
			},
			{ client: radarrClient },
		);
		const changed = await radarrLibrary.upsertMovieSnapshot(
			toRadarrMovieSnapshot(created),
			credentials,
		);
		scheduleLibraryRefresh("radarr");
		if (changed) await bumpProviderLibraryRevision("radarr");
		return created;
	},

	async updateRadarrMovie(input: UpdateRadarrInput) {
		const credentials = await requireProviderCredentials("radarr");
		const updated = await updateRadarrMovieProvider(
			{
				tmdbId: input.tmdbId,
				form: input.form,
				credentials,
			},
			{ client: radarrClient },
		);
		const changed = await radarrLibrary.upsertMovieSnapshot(
			toRadarrMovieSnapshot(updated),
			credentials,
		);
		scheduleLibraryRefresh("radarr");
		if (changed) await bumpProviderLibraryRevision("radarr");
		return updated;
	},

	async getRadarrFormResources(input?: GetProviderFormResourcesInput) {
		const maybeCredentials = input?.credentials;
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

	async searchRadarr(input: RadarrLookupInput) {
		const credentials = await requireProviderCredentials("radarr");

		const [results, library] = await Promise.all([
			radarrClient.lookupMovies(input.term, credentials),
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

		const linkedAniListIds = await mappingService.getLinkedAniListIdsByProviderIds(
			"radarr",
			uniqueTmdbIds,
		);
		for (const [tmdbId, linked] of linkedAniListIds) {
			linkedAniListIdsByTmdbId[tmdbId] = linked;
		}

		return {
			results,
			libraryTmdbIds,
			...(Object.keys(linkedAniListIdsByTmdbId).length > 0
				? { linkedAniListIdsByTmdbId }
				: {}),
		};
	},

	async validateTmdbId(input: ValidateTmdbInput) {
		const credentials = await requireProviderCredentials("radarr");
		const found = await radarrClient.findMovieByTmdbId(
			input.tmdbId,
			credentials,
		);
		let inCatalog = false;
		try {
			const lookup = await radarrClient.lookupMovieByTmdbId(
				input.tmdbId,
				credentials,
			);
			inCatalog = lookup?.tmdbId === input.tmdbId;
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
		return {
			provider: "radarr",
			providerId: input.tmdbId,
			isInLibrary: false,
		};
	}

	return radarrLibrary.getMovieLibraryStatusByTmdbId({
		tmdbId: input.tmdbId,
		credentials,
		onCacheChanged: async () => {
			await bumpProviderLibraryRevision("radarr");
		},
		...(input.forceVerify === undefined
			? {}
			: { forceVerify: input.forceVerify }),
	});
}

async function getRadarrStatusFromMappingAndLibrary(
	input: StatusInput,
): Promise<GetMovieStatusOutput> {
	const credentials = await getProviderConfig("radarr");
	if (!credentials) {
		return {
			mapping: unmappedMapping(),
			isInLibrary: null,
		};
	}

	const mapping = await resolveRadarrMapping(input);
	if (mapping.kind === "unmapped") {
		return {
			mapping: mapping.mapping,
			isInLibrary: null,
		};
	}

	return buildMappedRadarrStatus(mapping, input);
}

async function resolveRadarrMapping(
	input: StatusInput,
): Promise<RadarrMappingResult> {
	const anilistId = await resolveAniListIdFromInput(input);
	if (anilistId === null) {
		return { kind: "unmapped", mapping: unmappedMapping() };
	}

	const mapping = await mappingService.resolveMapping("radarr", anilistId, {
		forceRetry: input.force_mapping_retry === true,
		...(input.title === undefined ? {} : { title: input.title }),
		...(input.metadata === undefined ? {} : { metadata: input.metadata }),
	});
	if (mapping.kind === "mapped") {
		const tmdbId = parseTmdbIdOrNull(mapping.providerId);
		if (tmdbId === null) return { kind: "unmapped", mapping };

		return {
			kind: "mapped",
			tmdbId,
			mapping,
		};
	}
	return { kind: "unmapped", mapping };
}

async function buildMappedRadarrStatus(
	mapping: Extract<RadarrMappingResult, { kind: "mapped" }>,
	input: StatusInput,
): Promise<GetMovieStatusOutput> {
	const libraryStatus = await getRadarrLibraryStatusForRpc({
		tmdbId: mapping.tmdbId,
		forceVerify: input.force_verify === true,
	});

	return {
		mapping: mapping.mapping,
		isInLibrary: libraryStatus.isInLibrary,
		...(libraryStatus.movie ? { movie: libraryStatus.movie } : {}),
	};
}

function unmappedMapping(): MappingResult {
	return { kind: "unmapped", hadResolveAttempt: false };
}
