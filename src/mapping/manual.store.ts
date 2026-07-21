/** Stores manual mappings, ignored entries, and rejected automatic candidates. */
// src/mapping/manual.store.ts

import { storage } from "wxt/utils/storage";
import { parseAniListIdOrNull, type AniListId } from "@/anilist/types";
import type { Provider } from "@/providers/types";
import { parseSourceIdentityKey } from "./source-identity";

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
	anilistId: AniListId,
): Promise<ManualFacts | null> {
	const mappings = await getManualMappings();

	return mappings[provider][anilistId] ?? null;
}

export async function listAniListManualFacts(
	provider: Provider,
): Promise<ManualRecord[]> {
	const mappings = await getManualMappings();
	const records: ManualRecord[] = [];

	for (const [rawAniListId, facts] of Object.entries(mappings[provider])) {
		const anilistId = parseAniListIdOrNull(Number(rawAniListId));

		if (anilistId !== null) {
			records.push({ anilistId, facts });
		}
	}

	return records;
}

export async function setManualMapping(
	provider: Provider,
	anilistId: AniListId,
	mapping: ManualMapping,
): Promise<void> {
	await updateManualMappings((mappings) => {
		const previous = mappings[provider][anilistId];
		const rejectedProviderIds = previous?.rejectedProviderIds?.filter(
			(providerId) => providerId !== mapping.providerId,
		);

		mappings[provider][anilistId] = {
			mapping,
			...(rejectedProviderIds?.length ? { rejectedProviderIds } : {}),
		};
	});
}

export async function clearManualMapping(
	provider: Provider,
	anilistId: AniListId,
): Promise<void> {
	await updateManualMappings((mappings) => {
		const previous = mappings[provider][anilistId];

		if (!previous || !("mapping" in previous)) {
			return;
		}

		if (previous.rejectedProviderIds?.length) {
			mappings[provider][anilistId] = {
				rejectedProviderIds: previous.rejectedProviderIds,
			};
			return;
		}

		delete mappings[provider][anilistId];
	});
}

export async function setIgnored(
	provider: Provider,
	anilistId: AniListId,
): Promise<void> {
	await updateManualMappings((mappings) => {
		const previous = mappings[provider][anilistId];

		mappings[provider][anilistId] = {
			ignored: true,
			...(previous?.rejectedProviderIds?.length
				? { rejectedProviderIds: previous.rejectedProviderIds }
				: {}),
		};
	});
}

export async function clearIgnored(
	provider: Provider,
	anilistId: AniListId,
): Promise<void> {
	await updateManualMappings((mappings) => {
		const previous = mappings[provider][anilistId];

		if (!previous || !("ignored" in previous)) {
			return;
		}

		if (previous.rejectedProviderIds?.length) {
			mappings[provider][anilistId] = {
				rejectedProviderIds: previous.rejectedProviderIds,
			};
			return;
		}

		delete mappings[provider][anilistId];
	});
}

export async function rejectAutoCandidate(
	provider: Provider,
	anilistId: AniListId,
	providerId: number,
): Promise<void> {
	await updateManualMappings((mappings) => {
		const previous = mappings[provider][anilistId];

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

		mappings[provider][anilistId] = {
			...previous,
			rejectedProviderIds: [...rejectedProviderIds, providerId],
		};
	});
}

export async function clearRejectedAutoCandidate(
	provider: Provider,
	anilistId: AniListId,
	providerId: number,
): Promise<void> {
	await updateManualMappings((mappings) => {
		const previous = mappings[provider][anilistId];

		if (!previous?.rejectedProviderIds?.includes(providerId)) {
			return;
		}

		const rejectedProviderIds = previous.rejectedProviderIds.filter(
			(rejectedId) => rejectedId !== providerId,
		);

		if ("mapping" in previous) {
			mappings[provider][anilistId] = {
				mapping: previous.mapping,
				...(rejectedProviderIds.length > 0 ? { rejectedProviderIds } : {}),
			};
			return;
		}

		if ("ignored" in previous) {
			mappings[provider][anilistId] = {
				ignored: true,
				...(rejectedProviderIds.length > 0 ? { rejectedProviderIds } : {}),
			};
			return;
		}

		if (rejectedProviderIds.length > 0) {
			mappings[provider][anilistId] = { rejectedProviderIds };
			return;
		}

		delete mappings[provider][anilistId];
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
		const anilistId = parseStoredAniListId(rawKey);

		if (
			anilistId !== null &&
			(rawKey === String(anilistId) || normalized[anilistId] === undefined)
		) {
			normalized[anilistId] = facts;
		}
	}

	return normalized;
}

function parseStoredAniListId(rawKey: string): AniListId | null {
	const direct = parseAniListIdOrNull(Number(rawKey));
	if (direct !== null && rawKey === String(direct)) return direct;

	/** LEGACY: remove after branch testers have rewritten pre-canonical AniList facts. */
	const source = parseSourceIdentityKey(rawKey);
	return source?.source === "anilist" ? source.id : null;
}
