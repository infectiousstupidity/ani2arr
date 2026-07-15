/** Legacy provider connection exports backed by unified settings normalization. */
// src/settings/provider-config.ts

// LEGACY: Remove in Task 10 after consumers switch to connection-config.
export {
	getConnectionDraft as getProviderConnectionDraft,
	getConnectionCredentials as getProviderCredentials,
	hasConfiguredConnectionCredentials as hasConfiguredProviderCredentials,
	normalizeConnectionInput as normalizeProviderConnectionInput,
	normalizeConnectionSettings as normalizeProviderConnectionSettings,
} from "./connection-config";
export type {
	NormalizedConnection as NormalizedProviderConnection,
} from "./connection-config";
