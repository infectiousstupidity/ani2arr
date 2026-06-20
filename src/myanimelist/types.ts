/** MyAnimeList domain identifiers and strict parser helpers. */
// src/myanimelist/types.ts

import type { Brand } from "@/shared/types/brand";

export type MyAnimeListId = Brand<number, "MyAnimeListId">;

export const isMyAnimeListId = (value: unknown): value is MyAnimeListId =>
	typeof value === "number" &&
	Number.isFinite(value) &&
	Number.isInteger(value) &&
	value > 0;

export function parseMyAnimeListId(value: unknown): MyAnimeListId {
	if (!isMyAnimeListId(value)) {
		throw new Error("Invalid MyAnimeList ID");
	}
	return value;
}

export const parseMyAnimeListIdOrNull = (
	value: unknown,
): MyAnimeListId | null => (isMyAnimeListId(value) ? value : null);
