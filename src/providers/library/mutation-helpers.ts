/** Shared library-mutation helpers for provider add and update flows. */
// src/providers/library/mutation-helpers.ts

import { createError, ErrorCode } from "@/shared/errors";
import { getProviderLabel } from "@/providers/provider-labels";
import type {
	Provider,
	ProviderCredentials,
	ProviderQualityProfileId,
	ProviderTag,
	ProviderTagId,
} from "@/providers";
import { resolveProviderTagIds } from "./tag-ids";

type ProviderTagMutationApi = {
	getTags(credentials: ProviderCredentials): Promise<ProviderTag[]>;
	createTag(
		credentials: ProviderCredentials,
		label: string,
	): Promise<ProviderTag>;
};

type ResolveRequiredQualityProfileIdInput = {
	value: ProviderQualityProfileId | undefined;
	fallback: ProviderQualityProfileId | undefined;
	provider: Provider;
	entityLabel: "series" | "movie";
	actionLabel: "add" | "update";
};

type ResolveRequiredRootFolderPathInput = {
	value: string | undefined;
	fallback: string | undefined;
	provider: Provider;
	entityLabel: "series" | "movie";
	actionLabel: "add" | "update";
};

type ResolveMutationTagIdsInput = {
	api: ProviderTagMutationApi;
	credentials: ProviderCredentials;
	existingIdsFromForm: ProviderTagId[] | undefined;
	freeformLabelsFromForm: string[] | undefined;
	provider: Provider;
};

export function resolveRequiredQualityProfileId(
	input: ResolveRequiredQualityProfileIdInput,
): ProviderQualityProfileId {
	const { value, fallback, provider, entityLabel, actionLabel } = input;
	const providerLabel = getProviderLabel(provider);
	let resolvedValue: ProviderQualityProfileId | undefined;

	if (typeof value === "number" && Number.isFinite(value)) {
		resolvedValue = value;
	} else if (typeof fallback === "number" && Number.isFinite(fallback)) {
		resolvedValue = fallback;
	}

	if (typeof resolvedValue !== "number") {
		throw createError(
			ErrorCode.VALIDATION_ERROR,
			`Missing ${providerLabel} quality profile for ${actionLabel}.`,
			`Select a ${providerLabel} quality profile before ${actionLabel === "add" ? "adding" : "updating"} this ${entityLabel}.`,
		);
	}

	return resolvedValue;
}

export function resolveRequiredRootFolderPath(
	input: ResolveRequiredRootFolderPathInput,
): string {
	const { value, fallback, provider, entityLabel, actionLabel } = input;
	const providerLabel = getProviderLabel(provider);
	const resolvedValue = value?.trim() || fallback?.trim() || "";

	if (!resolvedValue) {
		throw createError(
			ErrorCode.VALIDATION_ERROR,
			`Missing ${providerLabel} root folder for ${actionLabel}.`,
			`Select a ${providerLabel} root folder before ${actionLabel === "add" ? "adding" : "updating"} this ${entityLabel}.`,
		);
	}

	return resolvedValue;
}

export async function resolveMutationTagIds(
	input: ResolveMutationTagIdsInput,
): Promise<ProviderTagId[]> {
	const {
		api,
		credentials,
		existingIdsFromForm,
		freeformLabelsFromForm,
		provider,
	} = input;
	const existingTags = await api.getTags(credentials);

	return resolveProviderTagIds({
		api,
		credentials,
		existingIdsFromForm: existingIdsFromForm ?? [],
		freeformLabelsFromForm: freeformLabelsFromForm ?? [],
		existingTags,
		providerLabel: getProviderLabel(provider),
	});
}
