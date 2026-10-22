/** Provider resolution helper for browse-card overlay targets. */
// src/content/browse/browse-card-provider.ts

import type { AniListMediaHint } from "@/anilist/types";
import {
	resolveAniListTargetProvider,
	resolveProviderForAniListFormat,
} from "@/content/target-provider";
import type { Provider } from "@/providers/types";
import type { MappingIdentity } from "@/rpc/types";
import type { HostMediaTarget } from "./types";

export function resolveBrowseCardProvider(input: {
	parsed: HostMediaTarget;
	metadata: AniListMediaHint | null;
	mappedIdentities: readonly MappingIdentity[];
}): Provider | null {
	if (input.parsed.anilistId === undefined) {
		return resolveProviderForAniListFormat(
			input.parsed.format ?? input.metadata?.format ?? null,
		);
	}

	return resolveAniListTargetProvider({
		anilistId: input.parsed.anilistId,
		format: input.parsed.format ?? input.metadata?.format ?? null,
		mappedIdentities: input.mappedIdentities,
	});
}
