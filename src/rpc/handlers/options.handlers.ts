/** RPC handlers for extension options notifications and provider refreshes. */
// src/rpc/handlers/options.handlers.ts

import * as v from "valibot";
import { handleProviderConnectionChanged } from "@/background/api-services";
import { getExtensionOptionsSnapshot } from "@/settings";
import { NotifyProviderConnectionChangedInputSchema } from "@/rpc/schemas";

export const optionsHandlers = {
	async notifyProviderConnectionChanged(input?: unknown) {
		const parsedInput = v.parse(
			NotifyProviderConnectionChangedInputSchema,
			input,
		);
		const normalizedInput = parsedInput
			? {
					...(parsedInput.changedProviders
						? { changedProviders: parsedInput.changedProviders }
						: {}),
					...(parsedInput.disconnectedProviders
						? { disconnectedProviders: parsedInput.disconnectedProviders }
						: {}),
				}
			: undefined;
		const options = await getExtensionOptionsSnapshot();
		await handleProviderConnectionChanged(options, normalizedInput);
		return { ok: true as const };
	},
};
