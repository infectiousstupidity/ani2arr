/** Downloads and stores normalized AniBridge mappings. */
// src/mapping/upstream.store.ts

import { storage } from "@wxt-dev/storage";
import { parseAniListIdOrNull, type AniListId } from "@/anilist/types";
import { parseMyAnimeListIdOrNull } from "@/myanimelist/types";
import { parseTmdbIdOrNull, parseTvdbIdOrNull } from "@/providers/schemas";
import type { Provider } from "@/providers/types";
import {
	parseSourceIdentityKey,
	sourceIdentityKey,
	type SeerrUpstreamTarget,
	type SourceIdentity,
	type UpstreamTarget,
} from "./types";

const ANIBRIDGE_URL =
	"https://github.com/anibridge/anibridge-mappings/releases/download/v3/mappings.min.json";
const ANIBRIDGE_TIMEOUT_MS = 15_000;
const MAX_ANIBRIDGE_BYTES = 10 * 1024 * 1024;
const UPSTREAM_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

type UpstreamMappings = Record<string, UpstreamTarget[]>;
type SeerrUpstreamMappings = Record<string, SeerrUpstreamTarget>;
type AniListCrosswalkMappings = Record<string, AniListId>;

type UpstreamSnapshot = {
	mappings: UpstreamMappings;
	seerrTargets?: SeerrUpstreamMappings;
	aniListCrosswalks?: AniListCrosswalkMappings;
	fetchedAt: number;
	etag?: string;
};

export type SourceUpstreamRecord = {
	source: SourceIdentity;
	targets: UpstreamTarget[];
};

export type SeerrUpstreamRecord = {
	anilistId: AniListId;
	target: SeerrUpstreamTarget;
};

const upstreamMappings = storage.defineItem<UpstreamSnapshot | null>(
	"local:mapping:upstream",
	{
		fallback: null,
	},
);

let writes: Promise<void> = Promise.resolve();

export async function getUpstreamTargets(
	provider: Provider,
	source: SourceIdentity | AniListId,
): Promise<UpstreamTarget[]> {
	const snapshot = await getSnapshot();
	const sourceKey = sourceIdentityKey(toSourceIdentity(source));

	return (snapshot?.mappings[sourceKey] ?? []).filter(
		(target) => target.provider === provider,
	);
}

export async function listSourceUpstreamMappings(): Promise<
	SourceUpstreamRecord[]
> {
	const snapshot = await getSnapshot();
	const records: SourceUpstreamRecord[] = [];

	for (const [rawSourceKey, targets] of Object.entries(
		snapshot?.mappings ?? {},
	)) {
		const source = parseSourceIdentityKey(rawSourceKey);

		if (source !== null) {
			records.push({ source, targets });
		}
	}

	return records;
}

export async function getUniqueAniListIdForSource(
	source: SourceIdentity,
): Promise<AniListId | null> {
	if (source.source === "anilist") return source.id;

	const snapshot = await getSnapshot();
	return snapshot?.aniListCrosswalks?.[sourceIdentityKey(source)] ?? null;
}

export async function listSeerrUpstreamTargets(
	ids: readonly AniListId[],
): Promise<SeerrUpstreamRecord[]> {
	const requestedIds = new Set(ids);
	if (requestedIds.size === 0) return [];

	const snapshot = await getSnapshot();
	const records: SeerrUpstreamRecord[] = [];

	for (const [rawSourceKey, target] of Object.entries(
		snapshot?.seerrTargets ?? {},
	)) {
		const source = parseSourceIdentityKey(rawSourceKey);

		if (source?.source === "anilist" && requestedIds.has(source.id)) {
			records.push({ anilistId: source.id, target });
		}
	}

	return records.toSorted((left, right) => left.anilistId - right.anilistId);
}

export async function listAllSeerrUpstreamTargets(): Promise<
	SeerrUpstreamRecord[]
> {
	const snapshot = await getSnapshot();
	const records: SeerrUpstreamRecord[] = [];

	for (const [rawSourceKey, target] of Object.entries(
		snapshot?.seerrTargets ?? {},
	)) {
		const source = parseSourceIdentityKey(rawSourceKey);

		if (source?.source === "anilist") {
			records.push({ anilistId: source.id, target });
		}
	}

	return records.toSorted((left, right) => left.anilistId - right.anilistId);
}

export async function refreshUpstreamMappings(): Promise<void> {
	const next = writes
		.catch(() => {})
		.then(async () => {
			const previous = await getSnapshot();
			if (
				previous?.mappings &&
				previous.seerrTargets &&
				previous.aniListCrosswalks &&
				Date.now() - previous.fetchedAt < UPSTREAM_REFRESH_INTERVAL_MS
			) {
				return;
			}

			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), ANIBRIDGE_TIMEOUT_MS);

			try {
				const response = await fetch(ANIBRIDGE_URL, {
					signal: controller.signal,
					headers: previous?.etag
						? {
								"If-None-Match": previous.etag,
							}
						: {},
				});

				if (response.status === 304) {
					if (!previous) {
						throw new Error("AniBridge returned 304 without stored mappings.");
					}

					await upstreamMappings.setValue({
						...previous,
						fetchedAt: Date.now(),
					});

					return;
				}

				if (!response.ok) {
					throw new Error(
						`Unable to download AniBridge mappings (${response.status}).`,
					);
				}

				const contentLength = Number(response.headers.get("Content-Length") ?? 0);
				if (contentLength > MAX_ANIBRIDGE_BYTES) {
					throw new Error("AniBridge mappings payload is too large.");
				}

				const text = await response.text();
				if (new TextEncoder().encode(text).byteLength > MAX_ANIBRIDGE_BYTES) {
					throw new Error("AniBridge mappings payload is too large.");
				}

				let parsedJson: unknown;
				try {
					parsedJson = JSON.parse(text) as unknown;
				} catch {
					throw new Error("AniBridge mappings payload is not valid JSON.");
				}

				const parsed = parseAniBridgeMappingsPayload(parsedJson);
				if (Object.keys(parsed.mappings).length === 0) {
					throw new Error(
						"AniBridge mappings payload did not contain valid mappings.",
					);
				}
				const etag = response.headers.get("ETag");

				await upstreamMappings.setValue({
					mappings: parsed.mappings,
					seerrTargets: parsed.seerrTargets,
					aniListCrosswalks: parsed.aniListCrosswalks,
					fetchedAt: Date.now(),
					...(etag ? { etag } : {}),
				});
			} finally {
				clearTimeout(timeout);
			}
		});

	writes = next.then(
		() => {},
		() => {},
	);

	await next;
}

export async function clearUpstreamMappings(): Promise<void> {
	const next = writes
		.catch(() => {})
		.then(() => upstreamMappings.setValue(null));

	writes = next.then(
		() => {},
		() => {},
	);

	await next;
}

export function parseAniBridgeMappings(payload: unknown): UpstreamMappings {
	return parseAniBridgeMappingsPayload(payload).mappings;
}

export function parseAniBridgeSeerrTargets(
	payload: unknown,
): SeerrUpstreamMappings {
	return parseAniBridgeMappingsPayload(payload).seerrTargets;
}

export function parseAniBridgeAniListCrosswalks(
	payload: unknown,
): AniListCrosswalkMappings {
	return parseAniBridgeMappingsPayload(payload).aniListCrosswalks;
}

function parseAniBridgeMappingsPayload(payload: unknown): {
	mappings: UpstreamMappings;
	seerrTargets: SeerrUpstreamMappings;
	aniListCrosswalks: AniListCrosswalkMappings;
} {
	const mappings: UpstreamMappings = {};
	const seerrTargets: SeerrUpstreamMappings = {};
	const aniListCrosswalks: AniListCrosswalkMappings = {};

	if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
		return { mappings, seerrTargets, aniListCrosswalks };
	}

	for (const [rawSource, rawTargets] of Object.entries(
		payload as Record<string, unknown>,
	)) {
		const source = parseDescriptor(rawSource);
		const sourceIdentity = parseSourceDescriptor(source);

		if (
			sourceIdentity === null ||
			!rawTargets ||
			typeof rawTargets !== "object" ||
			Array.isArray(rawTargets)
		) {
			continue;
		}

		const sourceKey = sourceIdentityKey(sourceIdentity);

		const rawTargetKeys = Object.keys(rawTargets);
		for (const rawTarget of rawTargetKeys) {
			const target = parseTarget(rawTarget);

			if (target) {
				addTarget(mappings, sourceKey, target);
			}
		}

		const seerrTarget = parseSeerrTarget(rawTargetKeys);
		if (seerrTarget) {
			seerrTargets[sourceKey] = seerrTarget;
		}

		const aniListId = parseUniqueAniListTarget(rawTargetKeys);
		if (sourceIdentity.source === "mal" && aniListId !== null) {
			aniListCrosswalks[sourceKey] = aniListId;
		}
	}

	return { mappings, seerrTargets, aniListCrosswalks };
}

function parseSourceDescriptor(
	descriptor: Descriptor | null,
): SourceIdentity | null {
	if (descriptor?.scope !== undefined) return null;

	if (descriptor?.name === "anilist") {
		const id = parseAniListIdOrNull(descriptor.id);
		return id === null ? null : { source: "anilist", id };
	}

	if (descriptor?.name === "mal") {
		const id = parseMyAnimeListIdOrNull(descriptor.id);
		return id === null ? null : { source: "mal", id };
	}

	return null;
}

function parseUniqueAniListTarget(values: readonly string[]): AniListId | null {
	const aniListIds = values.flatMap((value) => {
		const target = parseDescriptor(value);
		if (target?.name !== "anilist" || target.scope !== undefined) return [];

		const id = parseAniListIdOrNull(target.id);
		return id === null ? [] : [id];
	});
	const uniqueIds = [...new Set(aniListIds)];

	return uniqueIds.length === 1 ? (uniqueIds[0] ?? null) : null;
}

function parseTarget(value: string): UpstreamTarget | null {
	const target = parseDescriptor(value);

	if (!target) {
		return null;
	}

	if (target.name === "tmdb_movie" && target.scope === undefined) {
		const providerId = parseTmdbIdOrNull(target.id);

		return providerId === null
			? null
			: {
					provider: "radarr",
					providerId,
				};
	}

	if (target.name !== "tvdb_show") {
		return null;
	}

	const providerId = parseTvdbIdOrNull(target.id);

	if (providerId === null) {
		return null;
	}

	if (target.scope === undefined) {
		return {
			provider: "sonarr",
			providerId,
		};
	}

	const match = /^s(\d+)$/.exec(target.scope);

	if (!match) {
		return null;
	}

	const season = Number(match[1]);

	if (!Number.isSafeInteger(season)) {
		return null;
	}

	return {
		provider: "sonarr",
		providerId,
		season,
	};
}

function normalizeSeasons(seasons: readonly number[]): number[] {
	return [...new Set(seasons)]
		.filter((season) => Number.isSafeInteger(season) && season >= 0)
		.toSorted((left, right) => left - right);
}

function parseSeerrTarget(
	values: readonly string[],
): SeerrUpstreamTarget | null {
	const descriptors = values.flatMap((value) => {
		const target = parseDescriptor(value);
		return target ? [target] : [];
	});
	const movieTmdbIds = descriptors.flatMap((target) => {
		if (target.name !== "tmdb_movie" || target.scope !== undefined) return [];

		const tmdbId = parseTmdbIdOrNull(target.id);
		return tmdbId === null ? [] : [tmdbId];
	});

	if (movieTmdbIds.length > 0) {
		const tmdbId = movieTmdbIds.toSorted((left, right) => left - right)[0];
		if (tmdbId === undefined) return null;

		return {
			mediaType: "movie",
			tmdbId,
		};
	}

	const tmdbTargets = descriptors.flatMap((target) => {
		if (target.name !== "tmdb_show") return [];

		const tmdbId = parseTmdbIdOrNull(target.id);
		const season = parseSeasonScope(target.scope);
		return tmdbId === null || season === null ? [] : [{ tmdbId, season }];
	});
	const tmdbIds = new Set(tmdbTargets.map((target) => target.tmdbId));
	if (tmdbIds.size !== 1) return null;

	const tmdbId = tmdbTargets[0]?.tmdbId;
	if (tmdbId === undefined) return null;

	const tmdbSeasons = normalizeSeasons(
		tmdbTargets.map((target) => target.season),
	);

	const tvdbTargets = descriptors.flatMap((target) => {
		if (target.name !== "tvdb_show") return [];

		const tvdbId = parseTvdbIdOrNull(target.id);
		const season = parseSeasonScope(target.scope);
		return tvdbId === null || season === null ? [] : [{ tvdbId, season }];
	});
	const tvdbIds = new Set(tvdbTargets.map((target) => target.tvdbId));
	const tvdbId = tvdbIds.size === 1 ? [...tvdbIds][0] : undefined;
	const tvdbSeasons =
		tvdbId === undefined
			? []
			: normalizeSeasons(
					tvdbTargets
						.filter((target) => target.tvdbId === tvdbId)
						.map((target) => target.season),
				);

	const seasons = normalizeSeasons([...tmdbSeasons, ...tvdbSeasons]);
	if (seasons.length === 0) return null;

	return {
		mediaType: "tv",
		tmdbId,
		seasons,
		...(tvdbId === undefined ? {} : { tvdbId }),
	};
}

function parseSeasonScope(scope: string | undefined): number | null {
	const match = /^s(\d+)$/.exec(scope ?? "");
	if (!match) return null;

	const season = Number(match[1]);
	return Number.isSafeInteger(season) ? season : null;
}

type Descriptor = { name: string; id: number; scope?: string };

function parseDescriptor(value: string): Descriptor | null {
	const parts = value.split(":");

	if (parts.length !== 2 && parts.length !== 3) {
		return null;
	}

	const [name, rawId, scope] = parts;
	const id = Number(rawId);

	if (!name || !Number.isSafeInteger(id) || id <= 0) {
		return null;
	}

	return {
		name,
		id,
		...(scope === undefined ? {} : { scope }),
	};
}

function addTarget(
	mappings: UpstreamMappings,
	sourceKey: string,
	target: UpstreamTarget,
): void {
	const targets = mappings[sourceKey] ?? [];

	const alreadyExists = targets.some((existing) => {
		if (
			existing.provider !== target.provider ||
			existing.providerId !== target.providerId
		) {
			return false;
		}

		if (existing.provider === "sonarr" && target.provider === "sonarr") {
			return existing.season === target.season;
		}

		return true;
	});

	if (!alreadyExists) {
		mappings[sourceKey] = [...targets, target];
	}
}

function toSourceIdentity(source: SourceIdentity | AniListId): SourceIdentity {
	if (typeof source === "number") {
		return { source: "anilist", id: source };
	}

	return source;
}

async function getSnapshot(): Promise<UpstreamSnapshot | null> {
	const snapshot = await upstreamMappings.getValue();
	return snapshot ? normalizeSnapshot(snapshot) : null;
}

function normalizeSnapshot(snapshot: UpstreamSnapshot): UpstreamSnapshot {
	return {
		...snapshot,
		mappings: normalizeMappingKeys(snapshot.mappings),
		...(snapshot.seerrTargets === undefined
			? {}
			: { seerrTargets: normalizeSeerrTargetKeys(snapshot.seerrTargets) }),
		...(snapshot.aniListCrosswalks === undefined
			? {}
			: {
					aniListCrosswalks: normalizeAniListCrosswalkKeys(
						snapshot.aniListCrosswalks,
					),
				}),
	};
}

function normalizeMappingKeys(mappings: UpstreamMappings): UpstreamMappings {
	const normalized: UpstreamMappings = {};

	for (const [rawKey, targets] of Object.entries(mappings)) {
		const key = normalizeStoredSourceKey(rawKey);
		if (key !== null) {
			normalized[key] = targets;
		}
	}

	return normalized;
}

function normalizeSeerrTargetKeys(
	targets: SeerrUpstreamMappings,
): SeerrUpstreamMappings {
	const normalized: SeerrUpstreamMappings = {};

	for (const [rawKey, target] of Object.entries(targets)) {
		const key = normalizeStoredSourceKey(rawKey);
		if (key !== null) {
			normalized[key] = target;
		}
	}

	return normalized;
}

function normalizeAniListCrosswalkKeys(
	crosswalks: AniListCrosswalkMappings,
): AniListCrosswalkMappings {
	const normalized: AniListCrosswalkMappings = {};

	for (const [rawKey, anilistId] of Object.entries(crosswalks)) {
		const key = normalizeStoredSourceKey(rawKey);
		if (key !== null) {
			normalized[key] = anilistId;
		}
	}

	return normalized;
}

function normalizeStoredSourceKey(rawKey: string): string | null {
	const source = parseSourceIdentityKey(rawKey);
	if (source !== null) return sourceIdentityKey(source);

	/** LEGACY: pre-MAL snapshots used raw AniList ID object keys. */
	const anilistId = parseAniListIdOrNull(Number(rawKey));
	return anilistId === null
		? null
		: sourceIdentityKey({ source: "anilist", id: anilistId });
}
