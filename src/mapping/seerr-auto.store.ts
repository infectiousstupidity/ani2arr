/** Stores source-keyed automatic Seerr targets with success and attempt TTLs. */

import { storage } from "wxt/utils/storage";
import { parseAniListIdOrNull, type AniListId } from "@/anilist/types";
import {
	parseTmdbIdOrNull,
	parseTvdbIdOrNull,
	type TmdbId,
	type TvdbId,
} from "@/providers/schemas";
import {
	parseSourceIdentityKey,
	sourceIdentityKey,
	type SourceIdentity,
} from "./source-identity";

const MAPPED_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const UNMAPPED_TTL_MS = 48 * 60 * 60 * 1000;

export type SeerrAutoResult =
	| {
			kind: "mapped";
			target:
				| { mediaType: "movie"; tmdbId: TmdbId }
				| {
						mediaType: "tv";
						tmdbId: TmdbId;
						tvdbId?: TvdbId;
						seasons?: number[];
				  };
			matchedTitle?: string;
	  }
	| { kind: "unmapped" };

export type AniListSeerrAutoRecord = {
	anilistId: AniListId;
	result: Extract<SeerrAutoResult, { kind: "mapped" }>;
};

type StoredSeerrAutoResult = SeerrAutoResult & { expiresAt: number };
type SeerrAutoResults = Record<string, StoredSeerrAutoResult>;

const seerrAutoResults = storage.defineItem<SeerrAutoResults>(
	"local:mapping:seerr-auto",
	{ fallback: {} },
);

let writes: Promise<void> = Promise.resolve();

function normalizeSeasons(seasons: readonly number[]): number[] {
	return [...new Set(seasons)]
		.filter((season) => Number.isSafeInteger(season) && season >= 0)
		.toSorted((left, right) => left - right);
}

function normalizeResult(result: SeerrAutoResult): SeerrAutoResult | null {
	if (result.kind === "unmapped") return result;

	const tmdbId = parseTmdbIdOrNull(result.target.tmdbId);
	if (tmdbId === null) return null;

	const matchedTitle = result.matchedTitle?.trim();
	if (result.target.mediaType === "movie") {
		return {
			kind: "mapped",
			target: { mediaType: "movie", tmdbId },
			...(matchedTitle ? { matchedTitle } : {}),
		};
	}

	const tvdbId = parseTvdbIdOrNull(result.target.tvdbId);
	const seasons = normalizeSeasons(result.target.seasons ?? []);
	return {
		kind: "mapped",
		target: {
			mediaType: "tv",
			tmdbId,
			...(tvdbId === null ? {} : { tvdbId }),
			...(seasons.length === 0 ? {} : { seasons }),
		},
		...(matchedTitle ? { matchedTitle } : {}),
	};
}

function withoutExpiry(result: StoredSeerrAutoResult): SeerrAutoResult | null {
	return normalizeResult(result);
}

async function getStoredResults(): Promise<SeerrAutoResults> {
	return seerrAutoResults.getValue();
}

export async function getSeerrAutoResult(
	identity: SourceIdentity,
): Promise<SeerrAutoResult | null> {
	const results = await getStoredResults();
	const stored = results[sourceIdentityKey(identity)];
	if (!stored || stored.expiresAt <= Date.now()) return null;
	return withoutExpiry(stored);
}

export async function listAniListSeerrAutoResults(): Promise<
	AniListSeerrAutoRecord[]
> {
	const records: AniListSeerrAutoRecord[] = [];

	for (const [rawKey, stored] of Object.entries(await getStoredResults())) {
		if (stored.expiresAt <= Date.now()) continue;
		const identity = parseSourceIdentityKey(rawKey);
		if (identity?.source !== "anilist") continue;
		const result = withoutExpiry(stored);
		const anilistId = parseAniListIdOrNull(identity.id);
		if (anilistId !== null && result?.kind === "mapped") {
			records.push({ anilistId, result });
		}
	}

	return records.toSorted((left, right) => left.anilistId - right.anilistId);
}

export async function setSeerrAutoResult(
	identity: SourceIdentity,
	result: SeerrAutoResult,
): Promise<void> {
	const normalized = normalizeResult(result);
	if (normalized === null) throw new Error("Invalid automatic Seerr target.");

	await updateResults((results) => {
		results[sourceIdentityKey(identity)] = {
			...normalized,
			expiresAt:
				Date.now() +
				(normalized.kind === "mapped" ? MAPPED_TTL_MS : UNMAPPED_TTL_MS),
		};
	});
}

export async function clearSeerrAutoResults(): Promise<void> {
	await updateResults((results) => {
		for (const key of Object.keys(results)) delete results[key];
	});
}

async function updateResults(
	update: (results: SeerrAutoResults) => void,
): Promise<void> {
	const next = writes
		.catch(() => {})
		.then(async () => {
			const results = await getStoredResults();
			update(results);
			await seerrAutoResults.setValue(results);
		});

	writes = next.then(
		() => {},
		() => {},
	);
	await next;
}
