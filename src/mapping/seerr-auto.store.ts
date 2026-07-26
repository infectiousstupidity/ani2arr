/** Stores source-keyed automatic Seerr targets with success and attempt TTLs. */

import { storage } from "wxt/utils/storage";
import { parseAniListIdOrNull, type AniListId } from "@/anilist/types";
import {
	parseSourceIdentityKey,
	sourceIdentityKey,
	storageIdentity,
	type SourceIdentity,
} from "./source-identity";
import {
	normalizeSeerrTarget,
	type SeerrTarget,
} from "./seerr-target";

const MAPPED_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const UNMAPPED_TTL_MS = 48 * 60 * 60 * 1000;

export type SeerrAutoResult =
	| {
			kind: "mapped";
			target: SeerrTarget;
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

function normalizeResult(result: SeerrAutoResult): SeerrAutoResult | null {
	if (result.kind === "unmapped") return result;

	const target = normalizeSeerrTarget(result.target);
	if (target === null) return null;
	const matchedTitle = result.matchedTitle?.trim();
	return {
		kind: "mapped",
		target,
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
	anilistId?: AniListId,
): Promise<SeerrAutoResult | null> {
	const results = await getStoredResults();
	const stored = results[sourceIdentityKey(storageIdentity(identity, anilistId))];
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
	anilistId?: AniListId,
): Promise<void> {
	const normalized = normalizeResult(result);
	if (normalized === null) throw new Error("Invalid automatic Seerr target.");

	await updateResults((results) => {
		results[sourceIdentityKey(storageIdentity(identity, anilistId))] = {
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
