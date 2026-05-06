/** LEGACY: Radarr library support types retained until Radarr moves into src/providers/radarr. */
// src/providers/library/types.ts

export type { RadarrMovieLibraryStatus } from "@/providers/radarr/library";
import type { TtlCache } from "@/shared/cache/ttl-cache";

/** LEGACY: Radarr cache dependency shape retained until Radarr moves into src/providers/radarr. */
export interface ProviderLibraryCaches<TSnapshot> {
	lean: TtlCache<TSnapshot[]>;
}

/** LEGACY: Radarr mutation callback shape retained until Radarr moves into src/providers/radarr. */
export type LibraryMutationEmitter<TPayload> = (
	payload: TPayload,
) => Promise<void> | void;
