/** RPC handlers that commit settings and their background-owned effects. */
// src/rpc/handlers/options.handlers.ts

import {
	commitProviderConnection,
	commitSeerrConnection,
} from "@/background/connection-workflows";
import type {
	SaveProviderConnectionInput,
	SavePublicOptionsInput,
	SaveSeerrConnectionInput,
} from "@/rpc/types";
import { savePublicOptionsSnapshot } from "@/settings/store";
import { logger } from "@/shared/utils/logger";

export const optionsHandlers = {
	async savePublicOptions(input: SavePublicOptionsInput) {
		await savePublicOptionsSnapshot(input);
		logger.configure({
			enabled: input.debugLogging || import.meta.env.DEV,
		});
		return { ok: true as const };
	},

	async saveProviderConnection({
		provider,
		credentials,
	}: SaveProviderConnectionInput) {
		await commitProviderConnection(provider, credentials);
		return { ok: true as const };
	},

	async saveSeerrConnection({ connection }: SaveSeerrConnectionInput) {
		await commitSeerrConnection(connection);
		return { ok: true as const };
	},
};
