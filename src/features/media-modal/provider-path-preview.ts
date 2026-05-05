/** Builds provider setup path preview props from provider-owned folder data. */
// src/features/media-modal/provider-path-preview.ts

import type { ProviderRootFolderPathPreview } from "@/components/provider-add-options/provider-root-folder-select";
import {
	extractPathLeaf,
	extractRelativeFolder,
	joinRootAndFolder,
	shouldMoveProviderFiles,
} from "@/providers/library/paths";

type EditPreviewSource = {
	path?: string | null;
	rootFolderPath?: string | null;
};

function trimToNull(value?: string | null): string | null {
	if (typeof value !== "string") return null;

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

export function buildAddPathPreview(input: {
	selectedRootFolderPath?: string | null | undefined;
	providerFolderName?: string | null | undefined;
}): ProviderRootFolderPathPreview {
	const folderName = trimToNull(input.providerFolderName);
	const selectedRootFolderPath = trimToNull(input.selectedRootFolderPath);
	const selectedPreviewPath =
		selectedRootFolderPath && folderName
			? joinRootAndFolder(selectedRootFolderPath, folderName)
			: null;

	return {
		mode: "add",
		folderName,
		selectedPreviewPath,
		getRootFolderDisplayPath: folderName
			? (rootFolderPath) => joinRootAndFolder(rootFolderPath, folderName)
			: undefined,
	};
}

export function buildEditPathPreview(input: {
	selectedRootFolderPath?: string | null;
	existingMedia: EditPreviewSource;
}): ProviderRootFolderPathPreview {
	const currentPath = trimToNull(input.existingMedia.path);
	const folderName =
		extractRelativeFolder(
			input.existingMedia.path,
			input.existingMedia.rootFolderPath,
		) ?? extractPathLeaf(input.existingMedia.path);
	const selectedRootFolderPath =
		trimToNull(input.selectedRootFolderPath) ??
		trimToNull(input.existingMedia.rootFolderPath);
	const selectedPreviewPath =
		selectedRootFolderPath && folderName
			? joinRootAndFolder(selectedRootFolderPath, folderName)
			: null;

	return {
		mode: "edit",
		currentPath,
		folderName,
		selectedPreviewPath,
		willMove: shouldMoveProviderFiles(currentPath, selectedPreviewPath),
		getRootFolderDisplayPath: folderName
			? (rootFolderPath) => joinRootAndFolder(rootFolderPath, folderName)
			: undefined,
	};
}
