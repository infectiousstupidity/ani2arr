/** Stores automatic mapping results with expiry. */
// src/mapping/auto.store.ts

import { storage } from "@wxt-dev/storage";
import { parseAniListIdOrNull, type AniListId } from "@/anilist/types";
import type { Provider } from "@/providers/types";
import { bumpMappingsRevision } from "@/shared/sync/revisions";
import type { AutoResult } from "./types";

const MAPPED_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ATTEMPT_TTL_MS = 48 * 60 * 60 * 1000;

export type AutoRecord = {
	anilistId: AniListId;
	result: AutoResult;
};

type StoredAutoResult = AutoResult & {
	expiresAt: number;
};

type AutoMappings = Record<Provider, Record<number, StoredAutoResult>>;

const autoMappings = storage.defineItem<AutoMappings>("local:mapping:auto", {
	fallback: {
		sonarr: {},
		radarr: {},
	},
});

let writes: Promise<void> = Promise.resolve();

export async function getAutoResult(
	provider: Provider,
	anilistId: AniListId,
): Promise<AutoResult | null> {
	const mappings = await autoMappings.getValue();
	const result = mappings[provider][anilistId];

	if (!result || result.expiresAt <= Date.now()) {
		return null;
	}

	return withoutExpiry(result);
}

export async function listAutoResults(
	provider: Provider,
): Promise<AutoRecord[]> {
	const mappings = await autoMappings.getValue();
	const records: AutoRecord[] = [];

	for (const [rawAniListId, result] of Object.entries(mappings[provider])) {
		if (result.expiresAt <= Date.now()) {
			continue;
		}

		const anilistId = parseAniListIdOrNull(Number(rawAniListId));

		if (anilistId !== null) {
			records.push({
				anilistId,
				result: withoutExpiry(result),
			});
		}
	}

	return records;
}

export async function setAutoResult(
	provider: Provider,
	anilistId: AniListId,
	result: AutoResult,
): Promise<void> {
	await updateAutoMappings((mappings) => {
		mappings[provider][anilistId] = {
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
			const mappings = await autoMappings.getValue();

			update(mappings);

			await autoMappings.setValue(mappings);
		});

	writes = next.then(
		() => {},
		() => {},
	);

	await next;
}
