/** Public exports for the Radarr provider-domain implementation. */
// src/providers/radarr/index.ts

export {
	addRadarrMovie,
	buildAddRadarrMoviePayload,
	type RadarrAddMoviePayload,
} from "./add";
export { RadarrClient } from "./client";
export { buildUpdateRadarrMoviePayload, updateRadarrMovie } from "./edit";
export {
	RadarrLibrary,
	toRadarrMovieSnapshot,
	type RadarrMovieLibraryStatus,
} from "./library";
export * from "./schemas";
export { normalizeRadarrTagLabel, resolveRadarrTagIds } from "./tags";
export type * from "./types";
