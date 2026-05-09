/** RPC handlers for extension options persistence and provider-default updates. */
// src/rpc/handlers/options.handlers.ts

import * as v from "valibot";
import type { Ani2arrApi } from "@/rpc";
import {
	getExtensionOptionsSnapshot,
	setExtensionOptionsSnapshot,
	type ExtensionOptions,
} from "@/settings";
import { normalizeSonarrFormState } from "@/providers/sonarr/form-state";
import { normalizeRadarrFormState } from "@/providers/radarr/form-state";
import { NotifyProviderConnectionChangedInputSchema } from "@/rpc/schemas";
import type { ApiHandlerDeps } from "./handler-deps";

export function createOptionsHandlers(
	deps: ApiHandlerDeps,
): Pick<
	Ani2arrApi,
	| "notifyProviderConnectionChanged"
	| "updateSonarrDefaults"
	| "updateRadarrDefaults"
> {
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

		async updateSonarrDefaults(defaults) {
			const parsedDefaults = normalizeSonarrFormState(defaults);
			const current = await getExtensionOptionsSnapshot();
			const next: ExtensionOptions = {
				...current,
				providers: {
					...current.providers,
					sonarr: {
						...current.providers.sonarr,
						defaults: parsedDefaults,
					},
				},
			};
			await setExtensionOptionsSnapshot(next);
			return { ok: true as const };
		},

		async updateRadarrDefaults(defaults) {
			const parsedDefaults = normalizeRadarrFormState(defaults);
			const current = await getExtensionOptionsSnapshot();
			const next: ExtensionOptions = {
				...current,
				providers: {
					...current.providers,
					radarr: {
						...current.providers.radarr,
						defaults: parsedDefaults,
					},
				},
			};
			await setExtensionOptionsSnapshot(next);
			return { ok: true as const };
		},
	} satisfies Pick<
		Ani2arrApi,
		| "notifyProviderConnectionChanged"
		| "updateSonarrDefaults"
		| "updateRadarrDefaults"
	>;

	return handlers;
}
