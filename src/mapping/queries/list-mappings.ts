/** Bulk read model for the mappings page. */
// src/mapping/queries/list-mappings.ts

import type { AniListId } from "@/anilist";
import type { AutoMappingRecord } from "@/mapping/auto-mapping/types";
import { buildEffectiveMapping } from "@/mapping/effective-mapping";
import type { ProviderExternalId } from "@/mapping/types";
import {
	PROVIDERS,
	type Provider,
	type RadarrMovieSnapshot,
	type TmdbId,
	type TvdbId,
} from "@/providers";
import type { SonarrSeriesSnapshot } from "@/providers/sonarr/types";
import {
	filterMappingGroups,
	normalizeListMappingsInput,
} from "./list-mapping-filtering";
import { getMappingRowStatus } from "./mapping-row-status";
import type {
	ListMappingsInput,
	MappingListGroup,
	MappingListRow,
} from "./list-mapping-types";

export * from "./list-mapping-types";

type ManualEntry = {
	anilistId: AniListId;
	provider: Provider;
	providerId: ProviderExternalId;
	updatedAt: number;
};

type IgnoreEntry = {
	anilistId: AniListId;
	provider: Provider;
	updatedAt: number;
};

type UpstreamEntry =
	| { provider: "sonarr"; anilistId: AniListId; providerId: TvdbId }
	| { provider: "radarr"; anilistId: AniListId; providerId: TmdbId };

type AutoEntry = AutoMappingRecord & {
	anilistId: AniListId;
	provider: Provider;
};

type LibraryResult<T> = {
	ok: boolean;
	items: T[];
};

type ProviderMeta = NonNullable<MappingListRow["providerMeta"]>;

export interface ListMappingsDeps {
	manualMappingService: {
		listIgnores(): IgnoreEntry[];
		listRejectedCandidates(): ManualEntry[];
		list(): ManualEntry[];
	};
	anibridgeMappingStore: {
		listAllProviderPairs(): UpstreamEntry[];
	};
	sonarrLibrary: {
		getLeanSeriesList(): Promise<SonarrSeriesSnapshot[]>;
	};
	radarrLibrary: {
		getLeanMovieList(): Promise<RadarrMovieSnapshot[]>;
	};
	autoMappingStore: {
		list(provider?: Provider): Promise<AutoEntry[]>;
	};
	projectionCacheKey?: string;
}

let cachedKey: string | null = null;
let cachedGroups: MappingListGroup[] | null = null;

export function clearMappingListCache(): void {
	cachedKey = null;
	cachedGroups = null;
}

const rowKey = (provider: Provider, anilistId: AniListId): string =>
	`${provider}:${anilistId}`;

const groupKey = (
	provider: Provider,
	providerId: ProviderExternalId | null,
	anilistId: AniListId,
): string =>
	providerId === null
		? rowKey(provider, anilistId)
		: `${provider}:${providerId}`;

function latestByKey<T extends { updatedAt: number }>(
	items: readonly T[],
	getKey: (item: T) => string,
): Map<string, T> {
	const result = new Map<string, T>();

	for (const item of items) {
		const key = getKey(item);
		const current = result.get(key);

		if (!current || item.updatedAt > current.updatedAt) {
			result.set(key, item);
		}
	}

	return result;
}

function addTarget(
	targets: Map<string, { provider: Provider; anilistId: AniListId }>,
	provider: Provider,
	anilistId: AniListId,
): void {
	targets.set(rowKey(provider, anilistId), { provider, anilistId });
}

function buildProviderMeta(
	sonarr: readonly SonarrSeriesSnapshot[],
	radarr: readonly RadarrMovieSnapshot[],
): Map<string, ProviderMeta> {
	const result = new Map<string, ProviderMeta>();

	for (const series of sonarr) {
		result.set(`sonarr:${series.tvdbId}`, {
			title: series.title,
			type: "series",
			...(series.status ? { statusLabel: series.status } : {}),
		});
	}

	for (const movie of radarr) {
		result.set(`radarr:${movie.tmdbId}`, {
			title: movie.title,
			type: "movie",
			...(movie.status ? { statusLabel: movie.status } : {}),
		});
	}

	return result;
}

//eslint-disable-next-line max-params
function getLibraryData(
	provider: Provider,
	providerId: ProviderExternalId | null,
	sonarrOk: boolean,
	radarrOk: boolean,
	providerMetaById: Map<string, ProviderMeta>,
): {
	isInLibrary: boolean | null;
	providerMeta?: ProviderMeta;
} {
	if (providerId === null) {
		return { isInLibrary: false };
	}

	const libraryOk = provider === "sonarr" ? sonarrOk : radarrOk;
	if (!libraryOk) {
		return { isInLibrary: null };
	}

	const providerMeta = providerMetaById.get(`${provider}:${providerId}`);

	return {
		isInLibrary: providerMeta !== undefined,
		...(providerMeta ? { providerMeta } : {}),
	};
}
// eslint-disable-next-line complexity
async function buildGroups(
	providers: Set<Provider>,
	deps: ListMappingsDeps,
): Promise<MappingListGroup[]> {
	const autoProvider = providers.size === 1 ? [...providers][0] : undefined;

	const [sonarr, radarr, autoEntries] = await Promise.all([
		providers.has("sonarr")
			? deps.sonarrLibrary
					.getLeanSeriesList()
					.then(
						(items): LibraryResult<SonarrSeriesSnapshot> => ({
							ok: true,
							items,
						}),
					)
					.catch(
						(): LibraryResult<SonarrSeriesSnapshot> => ({
							ok: false,
							items: [],
						}),
					)
			: Promise.resolve({ ok: true, items: [] as SonarrSeriesSnapshot[] }),
		providers.has("radarr")
			? deps.radarrLibrary
					.getLeanMovieList()
					.then(
						(items): LibraryResult<RadarrMovieSnapshot> => ({
							ok: true,
							items,
						}),
					)
					.catch(
						(): LibraryResult<RadarrMovieSnapshot> => ({
							ok: false,
							items: [],
						}),
					)
			: Promise.resolve({ ok: true, items: [] as RadarrMovieSnapshot[] }),
		deps.autoMappingStore.list(autoProvider),
	]);

	const manualEntries = deps.manualMappingService
		.list()
		.filter((entry) => providers.has(entry.provider));
	const ignoreEntries = deps.manualMappingService
		.listIgnores()
		.filter((entry) => providers.has(entry.provider));
	const rejectedEntries = deps.manualMappingService
		.listRejectedCandidates()
		.filter((entry) => providers.has(entry.provider));
	const upstreamEntries = deps.anibridgeMappingStore
		.listAllProviderPairs()
		.filter((entry) => providers.has(entry.provider));
	const filteredAutoEntries = autoEntries.filter((entry) =>
		providers.has(entry.provider),
	);

	const manual = latestByKey(manualEntries, (entry) =>
		rowKey(entry.provider, entry.anilistId),
	);
	const ignored = latestByKey(ignoreEntries, (entry) =>
		rowKey(entry.provider, entry.anilistId),
	);
	const rejected = latestByKey(rejectedEntries, (entry) =>
		rowKey(entry.provider, entry.anilistId),
	);
	const auto = new Map(
		filteredAutoEntries.map(
			(entry) => [rowKey(entry.provider, entry.anilistId), entry] as const,
		),
	);
	const upstream = new Map<string, Set<ProviderExternalId>>();
	const targets = new Map<
		string,
		{ provider: Provider; anilistId: AniListId }
	>();

	for (const entry of manualEntries) {
		addTarget(targets, entry.provider, entry.anilistId);
	}

	for (const entry of ignoreEntries) {
		addTarget(targets, entry.provider, entry.anilistId);
	}

	for (const entry of rejectedEntries) {
		addTarget(targets, entry.provider, entry.anilistId);
	}

	for (const entry of filteredAutoEntries) {
		addTarget(targets, entry.provider, entry.anilistId);
	}

	for (const entry of upstreamEntries) {
		const key = rowKey(entry.provider, entry.anilistId);
		const providerIds = upstream.get(key) ?? new Set<ProviderExternalId>();

		providerIds.add(entry.providerId);
		upstream.set(key, providerIds);
		addTarget(targets, entry.provider, entry.anilistId);
	}

	const providerMetaById = buildProviderMeta(sonarr.items, radarr.items);
	const groups = new Map<string, MappingListGroup>();

	for (const target of targets.values()) {
		const key = rowKey(target.provider, target.anilistId);
		const mapping = buildEffectiveMapping({
			provider: target.provider,
			anilistId: target.anilistId,
			manual: manual.get(key) ?? null,
			ignored: ignored.get(key) ?? null,
			upstreamProviderIds: [...(upstream.get(key) ?? [])],
			rejectedCandidate: rejected.get(key) ?? null,
			autoMappingRecord: auto.get(key) ?? null,
		});
		const library = getLibraryData(
			mapping.provider,
			mapping.providerId,
			sonarr.ok,
			radarr.ok,
			providerMetaById,
		);
		const row: MappingListRow = {
			anilistId: mapping.anilistId,
			provider: mapping.provider,
			providerId: mapping.providerId,
			providerMappingState: mapping.providerMappingState,
			mappingEntryKind: mapping.mappingEntryKind,
			...(mapping.mappingSource
				? { mappingSource: mapping.mappingSource }
				: {}),
			...(mapping.mappingReason
				? { mappingReason: mapping.mappingReason }
				: {}),
			...(mapping.suppressedProviderId === undefined
				? {}
				: { suppressedProviderId: mapping.suppressedProviderId }),
			...(mapping.suppressionKind
				? { suppressionKind: mapping.suppressionKind }
				: {}),
			...(mapping.mappingUnknownReason
				? { mappingUnknownReason: mapping.mappingUnknownReason }
				: {}),
			...(mapping.hadResolveAttempt === undefined
				? {}
				: { hadResolveAttempt: mapping.hadResolveAttempt }),
			isInLibrary: library.isInLibrary,
			mappingRowStatus: getMappingRowStatus({
				providerId: mapping.providerId,
				providerMappingState: mapping.providerMappingState,
				mappingEntryKind: mapping.mappingEntryKind,
				isInLibrary: library.isInLibrary,
			}),
			updatedAt: mapping.updatedAt,
			...(library.providerMeta ? { providerMeta: library.providerMeta } : {}),
		};

		const keyForGroup = groupKey(row.provider, row.providerId, row.anilistId);
		const current = groups.get(keyForGroup);

		if (current) {
			current.rows.push(row);
			current.linkedAniListIds = [...current.linkedAniListIds, row.anilistId];
			current.linkedCount = current.linkedAniListIds.length;
			current.updatedAt = Math.max(current.updatedAt, row.updatedAt);
			continue;
		}

		groups.set(keyForGroup, {
			key: keyForGroup,
			provider: row.provider,
			providerId: row.providerId,
			rows: [row],
			linkedAniListIds: [row.anilistId],
			linkedCount: 1,
			isInLibrary: row.isInLibrary,
			updatedAt: row.updatedAt,
			...(row.providerMeta ? { providerMeta: row.providerMeta } : {}),
		});
	}

	return [...groups.values()];
}

export async function listMappings(
	input: ListMappingsInput | undefined,
	deps: ListMappingsDeps,
): Promise<{
	groups: MappingListGroup[];
	total: number;
}> {
	const normalized = normalizeListMappingsInput(input);
	const providers = new Set(
		input?.providers?.length ? input.providers : PROVIDERS,
	);
	const key = deps.projectionCacheKey
		? `${deps.projectionCacheKey}|${[...providers].toSorted().join(",")}`
		: null;

	let groups =
		key !== null && key === cachedKey && cachedGroups !== null
			? cachedGroups
			: null;

	if (groups === null) {
		groups = await buildGroups(providers, deps);

		if (key !== null) {
			cachedKey = key;
			cachedGroups = groups;
		}
	}

	return filterMappingGroups(groups, normalized);
}
