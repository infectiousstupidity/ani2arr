/** Provider route-slug helpers for navigation and mapping display links. */
// src/providers/provider-route-slug.ts

import type { Provider } from "./types";
import { extractPathLeaf, extractRelativeFolder } from "./provider-media-paths";

export interface ProviderRouteSlugSource {
	titleSlug?: string | null | undefined;
	folder?: string | null | undefined;
	folderName?: string | null | undefined;
	path?: string | null | undefined;
	rootFolderPath?: string | null | undefined;
}

function trimToNull(value?: string | null): string | null {
	if (typeof value !== "string") return null;

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

export function getProviderRouteSlug(
	provider: Provider,
	media?: ProviderRouteSlugSource | null,
): string | null {
	if (!media) return null;

	const titleSlug = trimToNull(media.titleSlug);
	if (titleSlug) return titleSlug;

	const providerFolder =
		provider === "radarr"
			? trimToNull(media.folderName)
			: trimToNull(media.folder);
	if (providerFolder) return providerFolder;

	return (
		extractRelativeFolder(media.path, media.rootFolderPath) ??
		extractPathLeaf(media.path)
	);
}
