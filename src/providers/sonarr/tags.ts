/** Sonarr tag save-time normalization, reuse, creation, and ID resolution. */
// src/providers/sonarr/tags.ts

import { createError, ErrorCode } from "@/shared/errors";
import type { ProviderCredentials } from "../types";
import type { SonarrClient } from "./client";
import type { SonarrTag, SonarrTagId } from "./types";

type ResolveSonarrTagIdsInput = {
	api: Pick<SonarrClient, "getTags" | "createTag">;
	credentials: ProviderCredentials;
	existingIdsFromForm: SonarrTagId[] | undefined;
	freeformLabelsFromForm: string[] | undefined;
};

type NormalizedSonarrTagLabel = {
	displayLabel: string;
	key: string;
};

function normalizeSonarrTagLabel(
	label: string | null | undefined,
): NormalizedSonarrTagLabel | null {
	if (typeof label !== "string") return null;

	const displayLabel = label.trim().toLocaleLowerCase().replaceAll(/\s+/g, "-");
	if (!displayLabel) return null;

	if (!/^[\da-z-]+$/.test(displayLabel)) {
		throw createError(
			ErrorCode.VALIDATION_ERROR,
			`Invalid Sonarr tag label: ${label}`,
			"Sonarr tags can only use letters, numbers, and hyphens.",
			{ label },
		);
	}

	return {
		displayLabel,
		key: displayLabel,
	};
}

export async function resolveSonarrTagIds(
	input: ResolveSonarrTagIdsInput,
): Promise<SonarrTagId[]> {
	const {
		api,
		credentials,
		existingIdsFromForm,
		freeformLabelsFromForm,
	} = input;
	const existingTags = await api.getTags(credentials);
	const labelToId = buildExistingTagMap(existingTags);
	const labelsToResolve = dedupeLabels(freeformLabelsFromForm ?? []);

	for (const label of labelsToResolve) {
		if (labelToId.has(label.key)) continue;

		const created = await api.createTag(label.displayLabel, credentials);
		const createdLabel = normalizeSonarrTagLabel(created.label);
		if (
			createdLabel === null ||
			typeof created.id !== "number" ||
			Number.isNaN(created.id)
		) {
			throw createError(
				ErrorCode.API_ERROR,
				"Sonarr returned invalid tag payload.",
				"Failed to create tag in Sonarr.",
			);
		}
		labelToId.set(createdLabel.key, created.id);
	}

	return dedupeTagIds([
		...(existingIdsFromForm ?? []),
		...labelsToResolve.map((label) => {
			const id = labelToId.get(label.key);
			if (id === undefined) {
				throw createError(
					ErrorCode.API_ERROR,
					`Failed to resolve tag ID for label: ${label.displayLabel}`,
					"Unable to resolve tag ID for one or more Sonarr tags.",
				);
			}
			return id;
		}),
	]);
}

function buildExistingTagMap(tags: SonarrTag[]): Map<string, SonarrTagId> {
	const labelToId = new Map<string, SonarrTagId>();

	for (const tag of tags) {
		const normalized = normalizeSonarrTagLabel(tag.label);
		if (normalized === null) continue;
		if (typeof tag.id !== "number" || Number.isNaN(tag.id)) continue;
		if (!labelToId.has(normalized.key)) {
			labelToId.set(normalized.key, tag.id);
		}
	}

	return labelToId;
}

function dedupeLabels(labels: string[]): NormalizedSonarrTagLabel[] {
	const seen = new Set<string>();
	const deduped: NormalizedSonarrTagLabel[] = [];

	for (const label of labels) {
		const normalized = normalizeSonarrTagLabel(label);
		if (normalized === null || seen.has(normalized.key)) continue;
		seen.add(normalized.key);
		deduped.push(normalized);
	}

	return deduped;
}

function dedupeTagIds(ids: SonarrTagId[]): SonarrTagId[] {
	const seen = new Set<SonarrTagId>();
	const deduped: SonarrTagId[] = [];

	for (const id of ids) {
		if (typeof id !== "number" || Number.isNaN(id) || seen.has(id)) continue;
		seen.add(id);
		deduped.push(id);
	}

	return deduped;
}
