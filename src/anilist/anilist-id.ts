/** Canonical AniList ID brand, validators, and schema. */
// src/anilist/anilist-id.ts

import * as v from "valibot";
import type { Brand } from "@/shared/types/brand";

export type AniListId = Brand<number, "AniListId">;

export function isAniListId(value: unknown): value is AniListId {
	return (
		typeof value === "number" &&
		Number.isFinite(value) &&
		Number.isInteger(value) &&
		value > 0
	);
}

export function parseAniListId(value: unknown): AniListId {
	if (!isAniListId(value)) {
		throw new Error("Invalid AniList ID");
	}
	return value;
}

export function parseAniListIdOrNull(value: unknown): AniListId | null {
	return isAniListId(value) ? value : null;
}

export const AniListIdSchema = v.pipe(
	v.number(),
	v.finite(),
	v.integer(),
	v.minValue(1),
	v.transform((value): AniListId => value as AniListId),
);
