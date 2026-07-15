/** Legacy Seerr connection adapters backed by unified settings normalization. */
// src/settings/seerr-config.ts

import type { ProviderCredentials } from "@/providers/types";
import {
	getConnectionCredentials,
	getConnectionDraft,
	hasConfiguredConnectionCredentials,
	normalizeConnectionInput,
	normalizeConnectionSettings,
	type NormalizedConnection,
} from "./connection-config";
import type { ExtensionOptions } from "./types";

export type { NormalizedConnection as NormalizedSeerrConnection } from "./connection-config";

// LEGACY: Remove in Task 10 after consumers switch to connection-config.
export const getSeerrConnectionDraft = (
	settings: ExtensionOptions | undefined,
): ProviderCredentials => getConnectionDraft(settings, "seerr");

export const getSeerrCredentials = (
	settings: ExtensionOptions | undefined,
): ProviderCredentials | null => getConnectionCredentials(settings, "seerr");

export const normalizeSeerrConnectionInput = (
	input: Partial<ProviderCredentials> | undefined,
): NormalizedConnection | null => normalizeConnectionInput(input, "seerr");

export const normalizeSeerrConnectionSettings = (
	settings: ExtensionOptions | undefined,
): NormalizedConnection | null => normalizeConnectionSettings(settings, "seerr");

export const hasConfiguredSeerrCredentials = (
	settings: ExtensionOptions | undefined,
): boolean => hasConfiguredConnectionCredentials(settings, "seerr");
