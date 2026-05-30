/** Pure helpers for provider status RPC request and mapping option shaping. */
// src/rpc/handlers/provider-status.helpers.ts

import type { AutoMappingOptions } from "@/mapping/auto-mapping/types";
import type {
	AcceptedMappingReason,
	AcceptedMappingSource,
} from "@/mapping/types";
import type { StatusInput } from "@/rpc/schemas";
import type { RequestPriority } from "@/shared/utils/request-priority";

export type ProviderStatusPayload = Pick<
	StatusInput,
	"anilistId" | "title" | "metadata"
>;

export type ProviderStatusOptions = {
	force_verify?: boolean;
	network?: "never";
	priority?: RequestPriority;
};

export function buildStatusPayload(input: StatusInput): ProviderStatusPayload {
	const payload: ProviderStatusPayload = { anilistId: input.anilistId };
	if (input.title !== undefined) payload.title = input.title;
	if (input.metadata !== undefined) payload.metadata = input.metadata;
	return payload;
}

export function buildStatusOptions(input: StatusInput): ProviderStatusOptions {
	const options: ProviderStatusOptions = {};
	if (input.force_verify) options.force_verify = true;
	if (input.network) options.network = input.network;
	if (input.priority) options.priority = input.priority;
	return options;
}

export function buildMappingOptions(
	payload: ProviderStatusPayload,
	normalizedTitle: string | undefined,
	options: ProviderStatusOptions,
): AutoMappingOptions {
	const mappingOptions: AutoMappingOptions = {};
	if (options.priority) mappingOptions.priority = options.priority;
	if (options.force_verify) mappingOptions.forceLookupNetwork = true;

	const hints: NonNullable<AutoMappingOptions["hints"]> = {};
	if (normalizedTitle) hints.primaryTitle = normalizedTitle;
	if (payload.metadata) hints.domMedia = payload.metadata;
	if (Object.keys(hints).length > 0) mappingOptions.hints = hints;
	return mappingOptions;
}

export function resolveMappingSource(
	reason: AcceptedMappingReason,
): AcceptedMappingSource {
	switch (reason) {
		case "manual-override": {
			return "manual";
		}
		case "exact-upstream": {
			return "upstream";
		}
		default: {
			return "auto";
		}
	}
}
