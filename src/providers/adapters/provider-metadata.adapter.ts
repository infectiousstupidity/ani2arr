/** Provider metadata normalization for app-facing selection models. */
// src/providers/adapters/provider-metadata.adapter.ts

import type {
	ProviderMetadata,
	ProviderQualityProfile,
	ProviderRootFolder,
	ProviderTag,
} from "@/providers/types";
import type {
	ProviderQualityProfileApi,
	ProviderRootFolderApi,
	ProviderTagApi,
} from "@/providers/schemas/provider-shared.schemas";

type ProviderMetadataApi = {
	qualityProfiles: ReadonlyArray<ProviderQualityProfileApi>;
	rootFolders: ReadonlyArray<ProviderRootFolderApi>;
	tags: ReadonlyArray<ProviderTagApi>;
};

function normalizeNonBlankText(value: string | null): string | null {
	const trimmed = value?.trim();
	return trimmed ?? null;
}

export function toProviderRootFolders(
	rootFolders: ReadonlyArray<ProviderRootFolderApi>,
): ProviderRootFolder[] {
	const normalized: ProviderRootFolder[] = [];

	for (const rootFolder of rootFolders) {
		const path = normalizeNonBlankText(rootFolder.path);
		if (!path) continue;

		normalized.push({
			id: rootFolder.id,
			path,
			freeSpace: rootFolder.freeSpace ?? null,
		});
	}

	return normalized;
}

export function toProviderQualityProfiles(
	qualityProfiles: ReadonlyArray<ProviderQualityProfileApi>,
): ProviderQualityProfile[] {
	const normalized: ProviderQualityProfile[] = [];

	for (const qualityProfile of qualityProfiles) {
		const name = normalizeNonBlankText(qualityProfile.name);
		if (!name) continue;

		normalized.push({
			id: qualityProfile.id,
			name,
		});
	}

	return normalized;
}

export function toProviderTags(
	tags: ReadonlyArray<ProviderTagApi>,
): ProviderTag[] {
	const normalized: ProviderTag[] = [];

	for (const tag of tags) {
		const label = normalizeNonBlankText(tag.label);
		if (!label) continue;

		normalized.push({
			id: tag.id,
			label,
		});
	}

	return normalized;
}

export function toProviderMetadata(
	input: ProviderMetadataApi,
): ProviderMetadata {
	return {
		qualityProfiles: toProviderQualityProfiles(input.qualityProfiles),
		rootFolders: toProviderRootFolders(input.rootFolders),
		tags: toProviderTags(input.tags),
	};
}
