/** Stores manual mappings, ignored entries, and rejected automatic candidates. */
// src/mapping/manual.store.ts

import { storage } from "@wxt-dev/storage";
import type { AniListId } from "@/anilist/types";
import type { Provider } from "@/providers/types";
import {
	normalizeStoredSourceKey,
	normalizeSourceIdentity,
	parseSourceIdentityKey,
	sourceIdentityKey,
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

export type SourceManualRecord = {
	source: SourceIdentity;
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
	source: SourceIdentity | AniListId,
): Promise<ManualFacts | null> {
	const mappings = await getManualMappings();

	return mappings[provider][sourceIdentityKey(normalizeSourceIdentity(source))] ?? null;
}

export async function listSourceManualFacts(
	provider: Provider,
): Promise<SourceManualRecord[]> {
	const mappings = await getManualMappings();
	const records: SourceManualRecord[] = [];

	for (const [rawSourceKey, facts] of Object.entries(mappings[provider])) {
		const source = parseSourceIdentityKey(rawSourceKey);

		if (source !== null) {
			records.push({ source, facts });
		}
	}

	return records;
}

export async function setManualMapping(
	provider: Provider,
	source: SourceIdentity | AniListId,
	mapping: ManualMapping,
): Promise<void> {
	await updateManualMappings((mappings) => {
		const sourceKey = sourceIdentityKey(normalizeSourceIdentity(source));
		const previous = mappings[provider][sourceKey];
		const rejectedProviderIds = previous?.rejectedProviderIds?.filter(
			(providerId) => providerId !== mapping.providerId,
		);

		mappings[provider][sourceKey] = {
			mapping,
			...(rejectedProviderIds?.length ? { rejectedProviderIds } : {}),
		};
	});
}

export async function clearManualMapping(
	provider: Provider,
	source: SourceIdentity | AniListId,
): Promise<void> {
	await updateManualMappings((mappings) => {
		const sourceKey = sourceIdentityKey(normalizeSourceIdentity(source));
		const previous = mappings[provider][sourceKey];

		if (!previous || !("mapping" in previous)) {
			return;
		}

		if (previous.rejectedProviderIds?.length) {
			mappings[provider][sourceKey] = {
				rejectedProviderIds: previous.rejectedProviderIds,
			};
			return;
		}

		delete mappings[provider][sourceKey];
	});
}

export async function setIgnored(
	provider: Provider,
	source: SourceIdentity | AniListId,
): Promise<void> {
	await updateManualMappings((mappings) => {
		const sourceKey = sourceIdentityKey(normalizeSourceIdentity(source));
		const previous = mappings[provider][sourceKey];

		mappings[provider][sourceKey] = {
			ignored: true,
			...(previous?.rejectedProviderIds?.length
				? { rejectedProviderIds: previous.rejectedProviderIds }
				: {}),
		};
	});
}

export async function clearIgnored(
	provider: Provider,
	source: SourceIdentity | AniListId,
): Promise<void> {
	await updateManualMappings((mappings) => {
		const sourceKey = sourceIdentityKey(normalizeSourceIdentity(source));
		const previous = mappings[provider][sourceKey];

		if (!previous || !("ignored" in previous)) {
			return;
		}

		if (previous.rejectedProviderIds?.length) {
			mappings[provider][sourceKey] = {
				rejectedProviderIds: previous.rejectedProviderIds,
			};
			return;
		}

		delete mappings[provider][sourceKey];
	});
}

export async function rejectAutoCandidate(
	provider: Provider,
	source: SourceIdentity | AniListId,
	providerId: number,
): Promise<void> {
	await updateManualMappings((mappings) => {
		const sourceKey = sourceIdentityKey(normalizeSourceIdentity(source));
		const previous = mappings[provider][sourceKey];

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

		mappings[provider][sourceKey] = {
			...previous,
			rejectedProviderIds: [...rejectedProviderIds, providerId],
		};
	});
}

export async function clearRejectedAutoCandidate(
	provider: Provider,
	source: SourceIdentity | AniListId,
	providerId: number,
): Promise<void> {
	await updateManualMappings((mappings) => {
		const sourceKey = sourceIdentityKey(normalizeSourceIdentity(source));
		const previous = mappings[provider][sourceKey];

		if (!previous?.rejectedProviderIds?.includes(providerId)) {
			return;
		}

		const rejectedProviderIds = previous.rejectedProviderIds.filter(
			(rejectedId) => rejectedId !== providerId,
		);

		if ("mapping" in previous) {
			mappings[provider][sourceKey] = {
				mapping: previous.mapping,
				...(rejectedProviderIds.length > 0 ? { rejectedProviderIds } : {}),
			};
			return;
		}

		if ("ignored" in previous) {
			mappings[provider][sourceKey] = {
				ignored: true,
				...(rejectedProviderIds.length > 0 ? { rejectedProviderIds } : {}),
			};
			return;
		}

		if (rejectedProviderIds.length > 0) {
			mappings[provider][sourceKey] = { rejectedProviderIds };
			return;
		}

		delete mappings[provider][sourceKey];
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
		const sourceKey = normalizeStoredSourceKey(rawKey);

		if (sourceKey !== null) {
			normalized[sourceKey] = facts;
		}
	}

	return normalized;
}
