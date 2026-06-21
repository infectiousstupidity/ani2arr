/** Source identity helpers for RPC inputs during the MAL identity migration. */
// src/rpc/source-input.ts

import type { AniListId } from "@/anilist/types";
import type { SourceIdentity } from "@/mapping/source-identity";

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

export function anilistIdFromSource(source: SourceIdentity): AniListId | null {
	return source.source === "anilist" ? source.id : null;
}
