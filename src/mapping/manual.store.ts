/** Stores manual mappings, ignored entries, and rejected automatic candidates. */
// src/mapping/manual.store.ts

import { storage } from "wxt/utils/storage";
import { parseAniListIdOrNull, type AniListId } from "@/anilist/types";
import type { Provider } from "@/providers/types";
import {
	normalizeSourceIdentity,
	parseSourceIdentityKey,
	sourceIdentityKey,
	storageIdentity,
	type SourceIdentity,
} from "./source-identity";

export type ManualMapping = {
	providerId: number;
	season?: number;
};

export type ManualFacts =
	| {
			mapping: ManualMapping;
			rejectedProviderIds?: number[];
	  }
	| {
			ignored: true;
			rejectedProviderIds?: number[];
	  }
	| {
			rejectedProviderIds: number[];
	  };

export type ManualRecord = {
	anilistId: AniListId;
	facts: ManualFacts;
};

type ManualMappings = Record<Provider, Record<string, ManualFacts>>;

const manualMappings = storage.defineItem<ManualMappings>(
	"local:mapping:manual",
	{
		fallback: {
			sonarr: {},
			radarr: {},
		},
	},
);

let writes: Promise<void> = Promise.resolve();

export async function getManualFacts(
	provider: Provider,
	identity: SourceIdentity | AniListId,
	anilistId?: AniListId,
): Promise<ManualFacts | null> {
	const mappings = await getManualMappings();

	return mappings[provider][manualFactsKey(identity, anilistId)] ?? null;
}

export async function listAniListManualFacts(
	provider: Provider,
): Promise<ManualRecord[]> {
	const mappings = await getManualMappings();
	const records: ManualRecord[] = [];

	for (const [rawKey, facts] of Object.entries(mappings[provider])) {
		const identity = parseSourceIdentityKey(rawKey);
		if (identity?.source === "anilist") {
			records.push({ anilistId: identity.id, facts });
		}
	}

	return records;
}

export async function setManualMapping(
	provider: Provider,
	identity: SourceIdentity | AniListId,
	mapping: ManualMapping,
	anilistId?: AniListId,
): Promise<void> {
	await updateManualMappings((mappings) => {
		const key = manualFactsKey(identity, anilistId);
		const previous = mappings[provider][key];
		const rejectedProviderIds = previous?.rejectedProviderIds?.filter(
			(providerId) => providerId !== mapping.providerId,
		);

		mappings[provider][key] = {
			mapping,
			...(rejectedProviderIds?.length ? { rejectedProviderIds } : {}),
		};
	});
}

export async function clearManualMapping(
	provider: Provider,
	identity: SourceIdentity | AniListId,
	anilistId?: AniListId,
): Promise<void> {
	await updateManualMappings((mappings) => {
		const key = manualFactsKey(identity, anilistId);
		const previous = mappings[provider][key];

		if (!previous || !("mapping" in previous)) {
			return;
		}

		if (previous.rejectedProviderIds?.length) {
			mappings[provider][key] = {
				rejectedProviderIds: previous.rejectedProviderIds,
			};
			return;
		}

		delete mappings[provider][key];
	});
}

export async function setIgnored(
	provider: Provider,
	identity: SourceIdentity | AniListId,
	anilistId?: AniListId,
): Promise<void> {
	await updateManualMappings((mappings) => {
		const key = manualFactsKey(identity, anilistId);
		const previous = mappings[provider][key];

		mappings[provider][key] = {
			ignored: true,
			...(previous?.rejectedProviderIds?.length
				? { rejectedProviderIds: previous.rejectedProviderIds }
				: {}),
		};
	});
}

export async function clearIgnored(
	provider: Provider,
	identity: SourceIdentity | AniListId,
	anilistId?: AniListId,
): Promise<void> {
	await updateManualMappings((mappings) => {
		const key = manualFactsKey(identity, anilistId);
		const previous = mappings[provider][key];

		if (!previous || !("ignored" in previous)) {
			return;
		}

		if (previous.rejectedProviderIds?.length) {
			mappings[provider][key] = {
				rejectedProviderIds: previous.rejectedProviderIds,
			};
			return;
		}

		delete mappings[provider][key];
	});
}

export async function rejectAutoCandidate(
	provider: Provider,
	identity: SourceIdentity | AniListId,
	providerId: number,
	anilistId?: AniListId,
): Promise<void> {
	await updateManualMappings((mappings) => {
		const key = manualFactsKey(identity, anilistId);
		const previous = mappings[provider][key];

		if (
			previous &&
			"mapping" in previous &&
			previous.mapping.providerId === providerId
		) {
			return;
		}

		const rejectedProviderIds = previous?.rejectedProviderIds ?? [];

		if (rejectedProviderIds.includes(providerId)) {
			return;
		}

		mappings[provider][key] = {
			...previous,
			rejectedProviderIds: [...rejectedProviderIds, providerId],
		};
	});
}

export async function clearRejectedAutoCandidate(
	provider: Provider,
	identity: SourceIdentity | AniListId,
	providerId: number,
	anilistId?: AniListId,
): Promise<void> {
	await updateManualMappings((mappings) => {
		const key = manualFactsKey(identity, anilistId);
		const previous = mappings[provider][key];

		if (!previous?.rejectedProviderIds?.includes(providerId)) {
			return;
		}

		const rejectedProviderIds = previous.rejectedProviderIds.filter(
			(rejectedId) => rejectedId !== providerId,
		);

		if ("mapping" in previous) {
			mappings[provider][key] = {
				mapping: previous.mapping,
				...(rejectedProviderIds.length > 0 ? { rejectedProviderIds } : {}),
			};
			return;
		}

		if ("ignored" in previous) {
			mappings[provider][key] = {
				ignored: true,
				...(rejectedProviderIds.length > 0 ? { rejectedProviderIds } : {}),
			};
			return;
		}

		if (rejectedProviderIds.length > 0) {
			mappings[provider][key] = { rejectedProviderIds };
			return;
		}

		delete mappings[provider][key];
	});
}

export async function clearManualFacts(): Promise<void> {
	await updateManualMappings((mappings) => {
		mappings.sonarr = {};
		mappings.radarr = {};
	});
}

async function updateManualMappings(
	update: (mappings: ManualMappings) => void,
): Promise<void> {
	const next = writes
		.catch(() => {})
		.then(async () => {
			const mappings = await getManualMappings();

			update(mappings);

			await manualMappings.setValue(mappings);
		});

	writes = next.then(
		() => {},
		() => {},
	);

	await next;
}

async function getManualMappings(): Promise<ManualMappings> {
	return normalizeManualMappings(await manualMappings.getValue());
}

function normalizeManualMappings(mappings: ManualMappings): ManualMappings {
	return {
		sonarr: normalizeManualProviderMappings(mappings.sonarr),
		radarr: normalizeManualProviderMappings(mappings.radarr),
	};
}

function normalizeManualProviderMappings(
	mappings: Record<string, ManualFacts>,
): Record<string, ManualFacts> {
	const normalized: Record<string, ManualFacts> = {};

	for (const [rawKey, facts] of Object.entries(mappings)) {
		const key = normalizeStoredManualFactsKey(rawKey);

		if (
			key !== null &&
			(rawKey === key || normalized[key] === undefined)
		) {
			normalized[key] = facts;
		}
	}

	return normalized;
}

function normalizeStoredManualFactsKey(rawKey: string): string | null {
	const source = parseSourceIdentityKey(rawKey);
	if (source !== null) return sourceIdentityKey(source);

	/** LEGACY: accept released numeric AniList keys until they are rewritten by a mutation. */
	const anilistId = parseAniListIdOrNull(Number(rawKey));
	return anilistId !== null && rawKey === String(anilistId)
		? sourceIdentityKey({ source: "anilist", id: anilistId })
		: null;
}

function manualFactsKey(
	identity: SourceIdentity | AniListId,
	anilistId?: AniListId,
): string {
	const source = normalizeSourceIdentity(identity);
	return sourceIdentityKey(storageIdentity(source, anilistId));
}
