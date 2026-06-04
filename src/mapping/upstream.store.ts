/** Downloads and stores normalized AniBridge mappings. */
// src/mapping/upstream.store.ts

import { storage } from "@wxt-dev/storage";
import { parseAniListIdOrNull, type AniListId } from "@/anilist/types";
import {
	parseTmdbIdOrNull,
	parseTvdbIdOrNull,
} from "@/providers/schemas";
import type { Provider } from "@/providers/types";
import type { UpstreamTarget } from "./types";

const ANIBRIDGE_URL =
	"https://github.com/anibridge/anibridge-mappings/releases/download/v3/mappings.min.json";
const UPSTREAM_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

type UpstreamMappings = Record<number, UpstreamTarget[]>;

type UpstreamSnapshot = {
	mappings: UpstreamMappings;
	fetchedAt: number;
	etag?: string;
};

export type UpstreamRecord = {
	anilistId: AniListId;
	targets: UpstreamTarget[];
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

export async function refreshUpstreamMappings(): Promise<void> {
	const next = writes
		.catch(() => {})
		.then(async () => {
			const previous = await upstreamMappings.getValue();
			if (
				previous?.mappings &&
				Date.now() - previous.fetchedAt < UPSTREAM_REFRESH_INTERVAL_MS
			) {
				return;
			}

			const response = await fetch(ANIBRIDGE_URL, {
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

			const mappings = parseAniBridgeMappings(
				(await response.json()) as unknown,
			);
			const etag = response.headers.get("ETag");

			await upstreamMappings.setValue({
				mappings,
				fetchedAt: Date.now(),
				...(etag ? { etag } : {}),
			});
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
	const mappings: UpstreamMappings = {};

	if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
		return mappings;
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

		for (const rawTarget of Object.keys(rawTargets)) {
			const target = parseTarget(rawTarget);

			if (target) {
				addTarget(mappings, anilistId, target);
			}
		}
	}

	return mappings;
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
