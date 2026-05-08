/** Public options-domain type surface for settings and public option contracts. */
// src/options/index.ts

export type {
	BadgeVisibility,
	ExtensionOptions,
	PublicOptions,
	UiOptions,
} from "./types";
export {
	ExtensionOptionsSchema,
	createDefaultExtensionOptions,
	defaultRadarrFormState,
	defaultSonarrFormState,
	defaultUiOptions,
} from "./schema";
export { UiOptionsSchema, createDefaultUiOptions } from "./ui-schema";
export {
	PUBLIC_OPTIONS_CHANGE_KEY,
	parseExtensionOptions,
	toPublicOptions,
	getExtensionOptionsSnapshot,
	setExtensionOptionsSnapshot,
	getPublicOptionsSnapshot,
	watchExtensionOptionsSnapshot,
	watchPublicOptionsSnapshot,
} from "./store";
export {
	getProviderConnectionDraft,
	getProviderCredentials,
	getProviderBaseUrl,
	normalizeProviderConnectionInput,
	normalizeProviderConnectionSettings,
	hasConfiguredProviderCredentials,
} from "./provider-config";
export type { NormalizedProviderConnection } from "./provider-config";
