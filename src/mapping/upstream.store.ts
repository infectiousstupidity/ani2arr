/** Downloads and stores normalized AniBridge mappings. */
// src/mapping/upstream.store.ts

import { storage } from "@wxt-dev/storage";
import { parseAniListIdOrNull, type AniListId } from "@/anilist/types";
import { parseTmdbIdOrNull, parseTvdbIdOrNull } from "@/providers/schemas";
import type { Provider } from "@/providers/types";
import type { SeerrUpstreamTarget, UpstreamTarget } from "./types";

const ANIBRIDGE_URL =
	"https://github.com/anibridge/anibridge-mappings/releases/download/v3/mappings.min.json";
const ANIBRIDGE_TIMEOUT_MS = 15_000;
const MAX_ANIBRIDGE_BYTES = 10 * 1024 * 1024;
const UPSTREAM_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

type UpstreamMappings = Record<number, UpstreamTarget[]>;
type SeerrUpstreamMappings = Record<number, SeerrUpstreamTarget>;

type UpstreamSnapshot = {
	mappings: UpstreamMappings;
	seerrTargets?: SeerrUpstreamMappings;
	fetchedAt: number;
	etag?: string;
};

export type UpstreamRecord = {
	anilistId: AniListId;
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
	anilistId: AniListId,
): Promise<UpstreamTarget[]> {
	const snapshot = await upstreamMappings.getValue();

	return (snapshot?.mappings[anilistId] ?? []).filter(
		(target) => target.provider === provider,
	);
}

export async function listUpstreamMappings(): Promise<UpstreamRecord[]> {
	const snapshot = await upstreamMappings.getValue();
	const records: UpstreamRecord[] = [];

	for (const [rawAniListId, targets] of Object.entries(
		snapshot?.mappings ?? {},
	)) {
		const anilistId = parseAniListIdOrNull(Number(rawAniListId));

		if (anilistId !== null) {
			records.push({ anilistId, targets });
		}
	}

	return records;
}

export async function listSeerrUpstreamTargets(
	ids: readonly AniListId[],
): Promise<SeerrUpstreamRecord[]> {
	const requestedIds = new Set(ids);
	if (requestedIds.size === 0) return [];

	const snapshot = await upstreamMappings.getValue();
	const records: SeerrUpstreamRecord[] = [];

	for (const [rawAniListId, target] of Object.entries(
		snapshot?.seerrTargets ?? {},
	)) {
		const anilistId = parseAniListIdOrNull(Number(rawAniListId));

		if (anilistId !== null && requestedIds.has(anilistId)) {
			records.push({ anilistId, target });
		}
	}

	return records.toSorted((left, right) => left.anilistId - right.anilistId);
}

export async function listAllSeerrUpstreamTargets(): Promise<
	SeerrUpstreamRecord[]
> {
	const snapshot = await upstreamMappings.getValue();
	const records: SeerrUpstreamRecord[] = [];

	for (const [rawAniListId, target] of Object.entries(
		snapshot?.seerrTargets ?? {},
	)) {
		const anilistId = parseAniListIdOrNull(Number(rawAniListId));

		if (anilistId !== null) {
			records.push({ anilistId, target });
		}
	}

	return records.toSorted((left, right) => left.anilistId - right.anilistId);
}

export async function refreshUpstreamMappings(): Promise<void> {
	const next = writes
		.catch(() => {})
		.then(async () => {
			const previous = await upstreamMappings.getValue();
			if (
				previous?.mappings &&
				previous.seerrTargets &&
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

function parseAniBridgeMappingsPayload(payload: unknown): {
	mappings: UpstreamMappings;
	seerrTargets: SeerrUpstreamMappings;
} {
	const mappings: UpstreamMappings = {};
	const seerrTargets: SeerrUpstreamMappings = {};

	if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
		return { mappings, seerrTargets };
	}

	for (const [rawSource, rawTargets] of Object.entries(
		payload as Record<string, unknown>,
	)) {
		const source = parseDescriptor(rawSource);

		if (
			source?.name !== "anilist" ||
			source.scope !== undefined ||
			!rawTargets ||
			typeof rawTargets !== "object" ||
			Array.isArray(rawTargets)
		) {
			continue;
		}

		const anilistId = parseAniListIdOrNull(source.id);

		if (anilistId === null) {
			continue;
		}

		const rawTargetKeys = Object.keys(rawTargets);
		for (const rawTarget of rawTargetKeys) {
			const target = parseTarget(rawTarget);

			if (target) {
				addTarget(mappings, anilistId, target);
			}
		}

		const seerrTarget = parseSeerrTarget(rawTargetKeys);
		if (seerrTarget) {
			seerrTargets[anilistId] = seerrTarget;
		}
	}

	return { mappings, seerrTargets };
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

function parseDescriptor(
	value: string,
): { name: string; id: number; scope?: string } | null {
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
	anilistId: AniListId,
	target: UpstreamTarget,
): void {
	const targets = mappings[anilistId] ?? [];

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
		mappings[anilistId] = [...targets, target];
	}
}
