/** Stores automatic mapping results with expiry. */
// src/mapping/auto.store.ts

import { storage } from "@wxt-dev/storage";
import { parseAniListIdOrNull, type AniListId } from "@/anilist/types";
import type { Provider } from "@/providers/types";
import { bumpMappingsRevision } from "@/shared/sync/revisions";
import {
	parseSourceIdentityKey,
	sourceIdentityKey,
	type AutoResult,
	type SourceIdentity,
} from "./types";

const MAPPED_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ATTEMPT_TTL_MS = 48 * 60 * 60 * 1000;

export type AutoRecord = {
	anilistId: AniListId;
	result: AutoResult;
};

export type SourceAutoRecord = {
	source: SourceIdentity;
	result: AutoResult;
};

type StoredAutoResult = AutoResult & {
	expiresAt: number;
};

type AutoMappings = Record<Provider, Record<string, StoredAutoResult>>;

const autoMappings = storage.defineItem<AutoMappings>("local:mapping:auto", {
	fallback: {
		sonarr: {},
		radarr: {},
	},
});

let writes: Promise<void> = Promise.resolve();

export async function getAutoResult(
	provider: Provider,
	source: SourceIdentity | AniListId,
): Promise<AutoResult | null> {
	const mappings = await getAutoMappings();
	const result = mappings[provider][sourceIdentityKey(toSourceIdentity(source))];

	if (!result || result.expiresAt <= Date.now()) {
		return null;
	}

	return withoutExpiry(result);
}

export async function listSourceAutoResults(
	provider: Provider,
): Promise<SourceAutoRecord[]> {
	const mappings = await getAutoMappings();
	const records: SourceAutoRecord[] = [];

	for (const [rawSourceKey, result] of Object.entries(mappings[provider])) {
		if (result.expiresAt <= Date.now()) {
			continue;
		}

		const source = parseSourceIdentityKey(rawSourceKey);

		if (source !== null) {
			records.push({
				source,
				result: withoutExpiry(result),
			});
		}
	}

	return records;
}

/** LEGACY: AniList-only callers migrate to listSourceAutoResults in later MAL phases. */
export async function listAutoResults(
	provider: Provider,
): Promise<AutoRecord[]> {
	const records = await listSourceAutoResults(provider);
	const anilistRecords: AutoRecord[] = [];

	for (const record of records) {
		if (record.source.source === "anilist") {
			anilistRecords.push({
				anilistId: record.source.id,
				result: record.result,
			});
		}
	}

	return anilistRecords;
}

export async function setAutoResult(
	provider: Provider,
	source: SourceIdentity | AniListId,
	result: AutoResult,
): Promise<void> {
	await updateAutoMappings((mappings) => {
		mappings[provider][sourceIdentityKey(toSourceIdentity(source))] = {
			...result,
			expiresAt:
				Date.now() +
				(result.kind === "mapped" ? MAPPED_TTL_MS : ATTEMPT_TTL_MS),
		};
	});
	await bumpMappingsRevision();
}

export async function clearAutoResults(provider: Provider): Promise<void> {
	await updateAutoMappings((mappings) => {
		mappings[provider] = {};
	});
}

function withoutExpiry(result: StoredAutoResult): AutoResult {
	switch (result.kind) {
		case "mapped": {
			return {
				kind: "mapped",
				providerId: result.providerId,
				...(result.season === undefined ? {} : { season: result.season }),
				...(result.matchedTitle === undefined
					? {}
					: { matchedTitle: result.matchedTitle }),
			};
		}

		case "ambiguous": {
			return {
				kind: "ambiguous",
				targets: result.targets,
			};
		}

		case "unmapped": {
			return {
				kind: "unmapped",
			};
		}
	}
}

async function updateAutoMappings(
	update: (mappings: AutoMappings) => void,
): Promise<void> {
	const next = writes
		.catch(() => {})
		.then(async () => {
			const mappings = await getAutoMappings();

			update(mappings);

			await autoMappings.setValue(mappings);
		});

	writes = next.then(
		() => {},
		() => {},
	);

	await next;
}

async function getAutoMappings(): Promise<AutoMappings> {
	return normalizeAutoMappings(await autoMappings.getValue());
}

function normalizeAutoMappings(mappings: AutoMappings): AutoMappings {
	return {
		sonarr: normalizeAutoProviderMappings(mappings.sonarr),
		radarr: normalizeAutoProviderMappings(mappings.radarr),
	};
}

function normalizeAutoProviderMappings(
	mappings: Record<string, StoredAutoResult>,
): Record<string, StoredAutoResult> {
	const normalized: Record<string, StoredAutoResult> = {};

	for (const [rawKey, result] of Object.entries(mappings)) {
		const sourceKey = normalizeStoredSourceKey(rawKey);

		if (sourceKey !== null) {
			normalized[sourceKey] = result;
		}
	}

	return normalized;
}

function normalizeStoredSourceKey(rawKey: string): string | null {
	const source = parseSourceIdentityKey(rawKey);
	if (source !== null) return sourceIdentityKey(source);

	/** LEGACY: pre-MAL auto mappings used raw AniList ID object keys. */
	const anilistId = parseAniListIdOrNull(Number(rawKey));
	return anilistId === null
		? null
		: sourceIdentityKey({ source: "anilist", id: anilistId });
}

function toSourceIdentity(source: SourceIdentity | AniListId): SourceIdentity {
	if (typeof source === "number") {
		return { source: "anilist", id: source };
	}

	return source;
}
