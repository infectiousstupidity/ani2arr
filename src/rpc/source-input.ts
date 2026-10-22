/** Source identity helpers for RPC inputs during the MAL identity migration. */
// src/rpc/source-input.ts

import type { AniListId } from "@/anilist/types";
import type { SourceIdentity } from "@/mapping/source-identity";
import { getUniqueAniListIdForSource } from "@/mapping/upstream.store";

export type SourceInputLike = {
	source?: SourceIdentity | undefined;
	anilistId?: AniListId;
};

export function sourceFromInput(input: SourceInputLike): SourceIdentity {
	if (input.source) return input.source;
	if (input.anilistId !== undefined) {
		return { source: "anilist", id: input.anilistId };
	}
	throw new Error("Missing source identity.");
}

export function getDirectAniListId(input: SourceInputLike): AniListId | null {
	if (input.anilistId !== undefined) return input.anilistId;
	if (input.source?.source === "anilist") return input.source.id;
	return null;
}

export async function resolveAniListIdFromInput(
	input: SourceInputLike,
): Promise<AniListId | null> {
	const directAniListId = getDirectAniListId(input);
	if (directAniListId !== null) return directAniListId;
	if (input.source?.source !== "mal") return null;
	return getUniqueAniListIdForSource(input.source);
}
