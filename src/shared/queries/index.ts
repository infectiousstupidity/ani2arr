/** Shared query barrel for mapping, metadata, and option hooks. */
// src/shared/queries/index.ts

export * from "./query-keys";
export {
	useExtensionOptions,
	usePublicOptions,
	useSaveOptions,
} from "@/options";
export * from "./metadata";
export * from "./mapping";
