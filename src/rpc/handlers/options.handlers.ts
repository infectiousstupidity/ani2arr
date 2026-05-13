/** RPC handlers for extension options notifications and provider refreshes. */
// src/rpc/handlers/options.handlers.ts

import * as v from "valibot";
import type { Ani2arrApi } from "@/rpc";
import { getExtensionOptionsSnapshot } from "@/settings";
import { NotifyProviderConnectionChangedInputSchema } from "@/rpc/schemas";
import type { ApiHandlerDeps } from "./handler-deps";

export function createOptionsHandlers(
	deps: ApiHandlerDeps,
): Pick<Ani2arrApi, "notifyProviderConnectionChanged"> {
	const { handleProviderConnectionChanged } = deps;

	const handlers = {
		async notifyProviderConnectionChanged(input) {
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
	} satisfies Pick<Ani2arrApi, "notifyProviderConnectionChanged">;

	return handlers;
}
