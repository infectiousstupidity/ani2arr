/** RPC handlers for extension options notifications and provider refreshes. */
// src/rpc/handlers/options.handlers.ts

import { handleProviderConnectionChanged } from "@/background/api-services";
import { getExtensionOptionsSnapshot } from "@/settings/store";
import type { NotifyProviderConnectionChangedInput } from "@/rpc/types";

export const optionsHandlers = {
	async notifyProviderConnectionChanged(
		input?: NotifyProviderConnectionChangedInput,
	) {
		const options = await getExtensionOptionsSnapshot();
		await handleProviderConnectionChanged(options, input);
		return { ok: true as const };
	},
};
