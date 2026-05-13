/** Shared query barrel for mapping, metadata, and option hooks. */
// src/shared/queries/index.ts

export * from "./query-keys";
export {
	useExtensionOptions,
	usePublicOptions,
	useSaveProviderConnection,
	useSavePublicOptions,
} from "./options";
export { useProviderBaseUrl } from "./provider-base-url";
export * from "./anilist";
export * from "./mapping";
