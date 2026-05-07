/** Radarr tag save-time normalization, reuse, creation, and ID resolution. */
// src/providers/radarr/tags.ts

import { createError, ErrorCode } from "@/shared/errors";
import type { ProviderCredentials } from "../types";
import type { RadarrClient } from "./client";
import type { RadarrTag, RadarrTagId } from "./types";

type ResolveRadarrTagIdsInput = {
	api: Pick<RadarrClient, "getTags" | "createTag">;
	credentials: ProviderCredentials;
	existingIdsFromForm: RadarrTagId[] | undefined;
	freeformLabelsFromForm: string[] | undefined;
};

type NormalizedRadarrTagLabel = {
	displayLabel: string;
	key: string;
};

export function normalizeRadarrTagLabel(
	label: string | null | undefined,
): NormalizedRadarrTagLabel | null {
	if (typeof label !== "string") return null;

	const displayLabel = label.trim().toLocaleLowerCase().replaceAll(/\s+/g, "-");
	if (!displayLabel) return null;

	if (!/^[\da-z-]+$/.test(displayLabel)) {
		throw createError(
			ErrorCode.VALIDATION_ERROR,
			`Invalid Radarr tag label: ${label}`,
			"Radarr tags can only use letters, numbers, and hyphens.",
			{ label },
		);
	}

	return {
		displayLabel,
		key: displayLabel,
	};
}

export async function resolveRadarrTagIds(
	input: ResolveRadarrTagIdsInput,
): Promise<RadarrTagId[]> {
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
		const createdLabel = normalizeRadarrTagLabel(created.label);
		if (
			createdLabel === null ||
			typeof created.id !== "number" ||
			Number.isNaN(created.id)
		) {
			throw createError(
				ErrorCode.API_ERROR,
				"Radarr returned invalid tag payload.",
				"Failed to create tag in Radarr.",
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
					"Unable to resolve tag ID for one or more Radarr tags.",
				);
			}
			return id;
		}),
	]);
}

function buildExistingTagMap(tags: RadarrTag[]): Map<string, RadarrTagId> {
	const labelToId = new Map<string, RadarrTagId>();

	for (const tag of tags) {
		const normalized = normalizeRadarrTagLabel(tag.label);
		if (normalized === null) continue;
		if (typeof tag.id !== "number" || Number.isNaN(tag.id)) continue;
		if (!labelToId.has(normalized.key)) {
			labelToId.set(normalized.key, tag.id);
		}
	}

	return labelToId;
}

function dedupeLabels(labels: string[]): NormalizedRadarrTagLabel[] {
	const seen = new Set<string>();
	const deduped: NormalizedRadarrTagLabel[] = [];

	for (const label of labels) {
		const normalized = normalizeRadarrTagLabel(label);
		if (normalized === null || seen.has(normalized.key)) continue;
		seen.add(normalized.key);
		deduped.push(normalized);
	}

	return deduped;
}

function dedupeTagIds(ids: RadarrTagId[]): RadarrTagId[] {
	const seen = new Set<RadarrTagId>();
	const deduped: RadarrTagId[] = [];

	for (const id of ids) {
		if (typeof id !== "number" || Number.isNaN(id) || seen.has(id)) continue;
		seen.add(id);
		deduped.push(id);
	}

	return deduped;
}
