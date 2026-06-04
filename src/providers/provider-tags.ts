/** Shared Sonarr and Radarr tag creation and ID resolution. */
// src/providers/provider-tags.ts

import { createError } from "@/shared/errors/error-utils";
import { ErrorCode } from "@/shared/errors/error.types";

import { getProviderLabel } from "./provider-labels";
import type { ProviderTagId } from "./schemas";
import type { Provider, ProviderCredentials, ProviderTag } from "./types";

type TagClient = {
	getTags: (credentials: ProviderCredentials) => Promise<ProviderTag[]>;
	createTag: (
		label: string,
		credentials: ProviderCredentials,
	) => Promise<ProviderTag>;
};

export async function resolveProviderTagIds(input: {
	provider: Provider;
	client: TagClient;
	credentials: ProviderCredentials;
	existingIds: ProviderTagId[] | undefined;
	freeformLabels: string[] | undefined;
}): Promise<ProviderTagId[]> {
	const providerLabel = getProviderLabel(input.provider);
	const existingTags = await input.client.getTags(input.credentials);
	const labelToId = buildTagMap(existingTags);
	const labels = normalizeLabels(input.freeformLabels ?? [], providerLabel);

	for (const label of labels) {
		if (labelToId.has(label)) continue;

		const created = await input.client.createTag(label, input.credentials);

		if (!created.id || !created.label.trim()) {
			throw createError(
				ErrorCode.API_ERROR,
				`${providerLabel} returned invalid tag payload.`,
				`Failed to create tag in ${providerLabel}.`,
			);
		}

		labelToId.set(normalizeLabel(created.label, providerLabel), created.id);
	}

	return [
		...new Set([
			...(input.existingIds ?? []),
			...labels.map((label) => {
				const id = labelToId.get(label);

				if (!id) {
					throw createError(
						ErrorCode.API_ERROR,
						`Failed to resolve tag ID for label: ${label}`,
						`Unable to resolve one or more ${providerLabel} tags.`,
					);
				}

				return id;
			}),
		]),
	];
}

function buildTagMap(tags: ProviderTag[]): Map<string, ProviderTagId> {
	return new Map(
		tags.map((tag) => [tag.label.trim().toLocaleLowerCase(), tag.id]),
	);
}

function normalizeLabels(
	labels: string[],
	providerLabel: Capitalize<Provider>,
): string[] {
	return [
		...new Set(
			labels
				.map((label) => normalizeLabel(label, providerLabel))
				.filter(Boolean),
		),
	];
}

function normalizeLabel(
	label: string,
	providerLabel: Capitalize<Provider>,
): string {
	const normalized = label.trim().toLocaleLowerCase().replaceAll(/\s+/g, "-");

	if (normalized && !/^[\da-z-]+$/.test(normalized)) {
		throw createError(
			ErrorCode.VALIDATION_ERROR,
			`Invalid ${providerLabel} tag label: ${label}`,
			`${providerLabel} tags can only use letters, numbers, and hyphens.`,
			{ label },
		);
	}

	return normalized;
}
