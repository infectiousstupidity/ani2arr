/** Stores manual Seerr targets and resolves effective target precedence. */
// src/mapping/seerr-target.store.ts

import { storage } from "wxt/utils/storage";
import { parseAniListIdOrNull, type AniListId } from "@/anilist/types";
import {
	parseSourceIdentityKey,
	sourceIdentityKey,
	storageIdentity,
	type SourceIdentity,
} from "@/mapping/source-identity";
import {
	getSeerrAutoResult,
	listAniListSeerrAutoResults,
	type AniListSeerrAutoRecord,
} from "./seerr-auto.store";
import {
	getSourceSeerrUpstreamMapping,
	listAllSeerrUpstreamTargets,
	listSeerrUpstreamTargets,
	type SeerrUpstreamRecord,
} from "./upstream.store";
import {
	normalizeSeerrTarget,
	type SeerrTarget,
} from "./seerr-target";
import type { SeerrUpstreamTarget } from "./types";

type AniListManualSeerrTarget = { anilistId: AniListId } & SeerrTarget;
type ManualSeerrTargets = Record<string, SeerrTarget>;

export type SeerrTargetIdentity = {
	identity: SourceIdentity;
	anilistId?: AniListId | undefined;
};

type SeerrTargetIdentityInput = SeerrTargetIdentity | AniListId;

export type EffectiveSeerrTarget =
	| ({
			anilistId?: AniListId | undefined;
			source: "manual";
	  } & SeerrTarget)
	| ({
			anilistId?: AniListId | undefined;
			source: "anibridge";
	  } & SeerrUpstreamTarget)
	| ({
			anilistId?: AniListId | undefined;
			source: "automatic";
	  } & SeerrTarget);

type AniListEffectiveSeerrTarget = EffectiveSeerrTarget & {
	anilistId: AniListId;
};

const manualSeerrTargets = storage.defineItem<ManualSeerrTargets>(
	"local:mapping:seerr-targets",
	{
		fallback: {},
	},
);

let writes: Promise<void> = Promise.resolve();

function normalizeManualSeerrTargets(
	targets: ManualSeerrTargets,
): ManualSeerrTargets {
	const normalizedTargets: ManualSeerrTargets = {};

	for (const [rawKey, target] of Object.entries(targets)) {
		const identity = parseSourceIdentityKey(rawKey);
		const normalized = normalizeSeerrTarget(target);
		if (identity !== null && normalized !== null) {
			normalizedTargets[sourceIdentityKey(identity)] = normalized;
			continue;
		}

		/** LEGACY: accept numeric AniList keys until all pre-source-key targets have been rewritten by a manual target mutation. */
		const legacyAniListId = parseAniListIdOrNull(Number(rawKey));
		if (legacyAniListId === null || normalized === null) continue;

		const legacyKey = sourceIdentityKey({
			source: "anilist",
			id: legacyAniListId,
		});
		if (normalizedTargets[legacyKey] === undefined) {
			normalizedTargets[legacyKey] = normalized;
		}
	}

	return normalizedTargets;
}

function getStoredManualTarget(
	targets: ManualSeerrTargets,
	identity: SourceIdentity,
): SeerrTarget | null {
	return targets[sourceIdentityKey(identity)] ?? null;
}

function normalizeIdentityInput(
	input: SeerrTargetIdentityInput,
): SeerrTargetIdentity {
	return typeof input === "number"
		? {
				identity: { source: "anilist", id: input },
				anilistId: input,
			}
		: input;
}

async function getManualSeerrTarget(input: SeerrTargetIdentityInput) {
	const normalizedInput = normalizeIdentityInput(input);
	const targets = normalizeManualSeerrTargets(
		await manualSeerrTargets.getValue(),
	);
	const target = getStoredManualTarget(
		targets,
		storageIdentity(normalizedInput.identity, normalizedInput.anilistId),
	);
	return target
		? {
				...target,
				...(normalizedInput.anilistId === undefined
					? {}
					: { anilistId: normalizedInput.anilistId }),
				source: "manual" as const,
			}
		: null;
}

async function listManualSeerrTargets(
	ids: readonly AniListId[],
): Promise<AniListManualSeerrTarget[]> {
	const requestedIds = new Set(ids);
	if (requestedIds.size === 0) return [];

	const targets = normalizeManualSeerrTargets(
		await manualSeerrTargets.getValue(),
	);
	const records: AniListManualSeerrTarget[] = [];

	for (const anilistId of requestedIds) {
		const target = getStoredManualTarget(targets, {
			source: "anilist",
			id: anilistId,
		});
		if (target) records.push({ anilistId, ...target });
	}

	return records.toSorted((left, right) => left.anilistId - right.anilistId);
}

async function listAllManualSeerrTargets(): Promise<
	AniListManualSeerrTarget[]
> {
	const targets = normalizeManualSeerrTargets(
		await manualSeerrTargets.getValue(),
	);
	const records: AniListManualSeerrTarget[] = [];

	for (const [rawKey, target] of Object.entries(targets)) {
		const identity = parseSourceIdentityKey(rawKey);
		if (identity?.source !== "anilist") continue;
		records.push({ anilistId: identity.id, ...target });
	}

	return records.toSorted((left, right) => left.anilistId - right.anilistId);
}

export async function getEffectiveSeerrTarget(
	input: SeerrTargetIdentityInput,
): Promise<EffectiveSeerrTarget | null> {
	const normalizedInput = normalizeIdentityInput(input);
	const manual = await getManualSeerrTarget(normalizedInput);
	if (manual) return manual;

	let upstream;
	if (normalizedInput.identity.source === "anilist") {
		const records = await listSeerrUpstreamTargets([
			normalizedInput.identity.id,
		]);
		upstream = records[0] ?? {
			anilistId: normalizedInput.identity.id,
			kind: "missing" as const,
		};
	} else {
		upstream = await getSourceSeerrUpstreamMapping(normalizedInput.identity);
	}
	const anilistId =
		normalizedInput.anilistId ?? upstream.anilistId ?? undefined;
	if (upstream.kind === "target") {
		return {
			...(anilistId === undefined ? {} : { anilistId }),
			source: "anibridge",
			...upstream.target,
		};
	}

	const automatic = await getSeerrAutoResult(
		normalizedInput.identity,
		anilistId,
	);
	if (automatic?.kind !== "mapped") return null;
	return {
		...(anilistId === undefined ? {} : { anilistId }),
		source: "automatic",
		...automatic.target,
	};
}

export async function listEffectiveSeerrTargets(
	ids: readonly AniListId[],
): Promise<AniListEffectiveSeerrTarget[]> {
	if (new Set(ids).size === 0) return [];

	const [manualTargets, upstreamTargets, automaticTargets] = await Promise.all([
		listManualSeerrTargets(ids),
		listSeerrUpstreamTargets(ids),
		listAniListSeerrAutoResults(),
	]);
	const requestedIds = new Set(ids);
	return mergeSeerrTargets(
		manualTargets,
		upstreamTargets,
		automaticTargets.filter((target) => requestedIds.has(target.anilistId)),
	);
}

export async function listAllEffectiveSeerrTargets(): Promise<
	AniListEffectiveSeerrTarget[]
> {
	const [manualTargets, upstreamTargets, automaticTargets] = await Promise.all([
		listAllManualSeerrTargets(),
		listAllSeerrUpstreamTargets(),
		listAniListSeerrAutoResults(),
	]);
	return mergeSeerrTargets(manualTargets, upstreamTargets, automaticTargets);
}

export async function setManualSeerrTarget(
	input: (SeerrTargetIdentity & SeerrTarget) | AniListManualSeerrTarget,
): Promise<void> {
	const identity =
		"identity" in input
			? input.identity
			: ({ source: "anilist", id: input.anilistId } as const);
	const anilistId = input.anilistId;
	const normalized = normalizeSeerrTarget(input);
	if (normalized === null) {
		throw new Error("Invalid Seerr target.");
	}
	await updateManualSeerrTargets((targets) => {
		const selected = storageIdentity(identity, anilistId);
		targets[sourceIdentityKey(selected)] = normalized;
	});
}

export async function clearManualSeerrTarget(
	input: SeerrTargetIdentityInput,
): Promise<void> {
	const normalizedInput = normalizeIdentityInput(input);
	await updateManualSeerrTargets((targets) => {
		const selected = storageIdentity(
			normalizedInput.identity,
			normalizedInput.anilistId,
		);
		delete targets[sourceIdentityKey(selected)];
	});
}

export async function clearManualSeerrTargets(): Promise<void> {
	await updateManualSeerrTargets((targets) => {
		for (const key of Object.keys(targets)) {
			delete targets[key];
		}
	});
}

function mergeSeerrTargets(
	manualTargets: readonly AniListManualSeerrTarget[],
	upstreamTargets: readonly SeerrUpstreamRecord[],
	automaticTargets: readonly AniListSeerrAutoRecord[],
): AniListEffectiveSeerrTarget[] {
	const targetsById = new Map<AniListId, AniListEffectiveSeerrTarget>(
		automaticTargets.map(({ anilistId, result }) => [
			anilistId,
			{ anilistId, source: "automatic", ...result.target },
		]),
	);

	for (const record of upstreamTargets) {
		if (record.kind === "conflict") continue;
		targetsById.set(record.anilistId, {
			anilistId: record.anilistId,
			source: "anibridge",
			...record.target,
		});
	}

	for (const target of manualTargets) {
		targetsById.set(target.anilistId, { ...target, source: "manual" });
	}

	return [...targetsById.values()].toSorted(
		(left, right) => left.anilistId - right.anilistId,
	);
}

async function updateManualSeerrTargets(
	update: (targets: ManualSeerrTargets) => void,
): Promise<void> {
	const next = writes
		.catch(() => {})
		.then(async () => {
			const targets = normalizeManualSeerrTargets(
				await manualSeerrTargets.getValue(),
			);
			update(targets);
			await manualSeerrTargets.setValue(targets);
		});

	writes = next.then(
		() => {},
		() => {},
	);

	await next;
}
