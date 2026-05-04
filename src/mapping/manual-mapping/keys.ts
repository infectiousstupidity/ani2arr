/** Key helpers and normalizers for persisted manual mapping records. */
// src/mapping/manual-mapping/keys.ts

import { parseAniListIdOrNull, type AniListId } from "@/anilist";
import type { Provider } from "@/providers";
import {
	parseProviderExternalId,
	type ProviderExternalId,
} from "@/mapping/types";
import type { ManualMappingKey, StoredManualMapping } from "./types";

export const isMappingProvider = (value: unknown): value is Provider =>
	value === "sonarr" || value === "radarr";

const parseAniListIdFromKeyPart = (
	value: string | undefined,
): AniListId | null => {
	if (!value || !/^\d+$/.test(value)) return null;
	return parseAniListIdOrNull(Number(value));
};

export const createManualMappingKey = (
	provider: Provider,
	anilistId: AniListId,
): ManualMappingKey => `${provider}:${anilistId}`;

export const parseManualMappingKey = (
	key: string,
): { provider: Provider; anilistId: AniListId } | null => {
	const parts = key.split(":");
	if (parts.length !== 2) return null;
	const [provider, rawAniListId] = parts;
	const anilistId = parseAniListIdFromKeyPart(rawAniListId);
	if (!isMappingProvider(provider) || anilistId === null) return null;
	return { provider, anilistId };
};

export const createReverseLookupKey = (
	provider: Provider,
	providerId: ProviderExternalId,
): string => `${provider}:${providerId}`;

const finiteTimestampOrNull = (value: unknown): number | null =>
	typeof value === "number" && Number.isFinite(value) ? value : null;

const normalizeRejectedProviderIds = (
	input: unknown,
): Record<string, number> | undefined => {
	if (!input || typeof input !== "object" || Array.isArray(input)) {
		return undefined;
	}

	const rejectedProviderIds: Record<string, number> = {};
	for (const [rawProviderId, rawUpdatedAt] of Object.entries(
		input as Record<string, unknown>,
	)) {
		const numericProviderId = Number(rawProviderId);
		if (!Number.isSafeInteger(numericProviderId) || numericProviderId <= 0) {
			continue;
		}
		const updatedAt = finiteTimestampOrNull(rawUpdatedAt);
		if (updatedAt === null) {
			continue;
		}
		rejectedProviderIds[String(numericProviderId)] = updatedAt;
	}

	return Object.keys(rejectedProviderIds).length > 0
		? rejectedProviderIds
		: undefined;
};

export const normalizeStoredManualMapping = (
	provider: Provider,
	entry: unknown,
): StoredManualMapping | null => {
	if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
		return null;
	}

	const candidate = entry as Partial<StoredManualMapping>;
	if (candidate.v !== 2) {
		return null;
	}

	const updatedAt = finiteTimestampOrNull(candidate.updatedAt);
	if (updatedAt === null) {
		return null;
	}

	const providerId = parseProviderExternalId(provider, candidate.providerId);
	const mappedAt =
		providerId === null
			? null
			: (finiteTimestampOrNull(candidate.mappedAt) ?? updatedAt);
	const ignoredAt = finiteTimestampOrNull(candidate.ignoredAt);
	const rejectedProviderIds = normalizeRejectedProviderIds(
		candidate.rejectedProviderIds,
	);

	if (
		providerId === null &&
		ignoredAt === null &&
		rejectedProviderIds === undefined
	) {
		return null;
	}

	return {
		v: 2,
		...(providerId === null ? {} : { providerId, mappedAt: mappedAt! }),
		...(ignoredAt === null ? {} : { ignoredAt }),
		...(rejectedProviderIds === undefined ? {} : { rejectedProviderIds }),
		updatedAt,
	};
};
