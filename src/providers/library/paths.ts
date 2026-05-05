/** Provider library path and slug helpers shared across UI and RPC code. */
// src/providers/library/paths.ts

import type { Provider, TmdbId, TvdbId } from "@/providers";

/** Minimal provider media shape used to derive provider route slugs and library paths. */
export interface ProviderMediaPathSource {
	path?: string | null;
	rootFolderPath?: string | null;
	folder?: string | null;
	folderName?: string | null;
	titleSlug?: string | null;
	title?: string | null;
	tvdbId?: TvdbId | null;
	tmdbId?: TmdbId | null;
}

export type ProviderSetupPathPreview = {
	selectedRootFolderPath: string | null;
	folderSlug: string | null;
	existingPath: string | null;
	previewPath: string | null;
	willMove: boolean;
};

type DeriveProviderSetupPathPreviewInput =
	| {
			mode: "add";
			provider: "sonarr";
			title: string;
			selectedRootFolderPath?: string | null;
			providerIdHint?: TvdbId | null;
	  }
	| {
			mode: "add";
			provider: "radarr";
			title: string;
			selectedRootFolderPath?: string | null;
			providerIdHint?: TmdbId | null;
	  }
	| {
			mode: "edit";
			provider: Provider;
			title: string;
			selectedRootFolderPath?: string | null;
			existingMedia: ProviderMediaPathSource;
	  };

const trimTrailingSeparators = (input: string): string =>
	input.replace(/[/\\]+$/, "").trim();

function trimToNull(value?: string | null): string | null {
	if (typeof value !== "string") {
		return null;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

export const extractProviderFolderSlug = (
	path?: string | null,
	rootFolderPath?: string | null,
): string | null => {
	if (!path) return null;
	const normalizedPath = trimTrailingSeparators(path).replaceAll("\\", "/");
	const normalizedRoot = rootFolderPath
		? trimTrailingSeparators(rootFolderPath).replaceAll("\\", "/")
		: null;
	const normalizedPathLower = normalizedPath.toLowerCase();
	const normalizedRootLower = normalizedRoot?.toLowerCase() ?? null;

	if (normalizedRoot && normalizedRootLower) {
		if (normalizedPathLower === normalizedRootLower) {
			return null;
		}

		const rootedPrefix = `${normalizedRootLower}/`;
		if (normalizedPathLower.startsWith(rootedPrefix)) {
			const remainder = normalizedPath
				.slice(normalizedRoot.length + 1)
				.replace(/^\/+/, "");
			if (remainder.length > 0) return remainder;
		}
	}

	const segments = normalizedPath.split("/");
	const last = segments.at(-1);
	return last?.length ? last : null;
};

export const sanitizeFolderSegment = (segment: string): string => {
	const replaced = segment.replaceAll(/[/\\]+/g, " ").trim();
	return replaced.replaceAll(/\s+/g, " ");
};

export const buildProviderFolderSlugFromTitle = (
	title?: string | null,
	media?: {
		tvdbId?: TvdbId | null | undefined;
		tmdbId?: TmdbId | null | undefined;
	} | null,
): string | null => {
	const baseTitle = sanitizeFolderSegment(title ?? "");
	if (!baseTitle) return null;

	if (typeof media?.tvdbId === "number" && Number.isFinite(media.tvdbId)) {
		return `${baseTitle} [tvdb-${media.tvdbId}]`;
	}
	if (typeof media?.tmdbId === "number" && Number.isFinite(media.tmdbId)) {
		return `${baseTitle} [tmdb-${media.tmdbId}]`;
	}

	return baseTitle;
};

export const normalizePathForCompare = (
	input?: string | null,
): string | null => {
	if (!input) return null;
	return trimTrailingSeparators(input).replaceAll("\\", "/").toLowerCase();
};

export const buildProviderFolderSlug = (
	media: ProviderMediaPathSource,
	fallbackTitle: string,
): string => {
	const fromPath = extractProviderFolderSlug(media.path, media.rootFolderPath);
	if (fromPath) return fromPath;
	if (media.folder && media.folder.trim()) return media.folder.trim();
	if (media.folderName && media.folderName.trim())
		return media.folderName.trim();
	if (media.titleSlug && media.titleSlug.trim()) return media.titleSlug.trim();

	const fromTitle = buildProviderFolderSlugFromTitle(
		media.title || fallbackTitle || "Media",
		media,
	);
	return fromTitle ?? "Media";
};

export const extractProviderRootFolderPath = (
	media?: ProviderMediaPathSource | null,
	slug?: string | null,
): string | null => {
	if (!media) return null;
	if (media.rootFolderPath && media.rootFolderPath.trim()) {
		return media.rootFolderPath;
	}
	if (!media.path || !media.path.trim()) {
		return null;
	}

	const normalizedPath = trimTrailingSeparators(media.path);
	if (slug && normalizedPath.toLowerCase().endsWith(slug.toLowerCase())) {
		const candidate = normalizedPath.slice(
			0,
			normalizedPath.length - slug.length,
		);
		return trimTrailingSeparators(candidate);
	}

	const lastSlash = Math.max(
		normalizedPath.lastIndexOf("/"),
		normalizedPath.lastIndexOf("\\"),
	);
	if (lastSlash === -1) return null;
	return normalizedPath.slice(0, lastSlash);
};

export const getProviderRouteSlug = (
	provider: Provider,
	media?: ProviderMediaPathSource | null,
): string | null => {
	if (!media) return null;
	if (media.titleSlug && media.titleSlug.trim()) {
		return media.titleSlug.trim();
	}
	if (provider === "radarr" && media.folderName && media.folderName.trim()) {
		return media.folderName.trim();
	}
	if (provider === "sonarr" && media.folder && media.folder.trim()) {
		return media.folder.trim();
	}
	return extractProviderFolderSlug(media.path, media.rootFolderPath);
};

export const joinRootAndSlug = (
	rootFolderPath: string,
	slug: string,
): string => {
	const normalizedRoot = trimTrailingSeparators(rootFolderPath);
	if (!normalizedRoot) return slug;
	const separator = normalizedRoot.includes("\\") ? "\\" : "/";
	return `${normalizedRoot}${separator}${slug}`;
};

export const buildProviderMediaPath = (
	rootFolderPath: string,
	slug?: string | null,
): string | null => {
	if (!rootFolderPath || !slug) return null;
	return joinRootAndSlug(rootFolderPath, slug);
};

export const deriveProviderSetupPathPreview = (
	input: DeriveProviderSetupPathPreviewInput,
): ProviderSetupPathPreview => {
	const selectedRootFolderPath = trimToNull(input.selectedRootFolderPath);

	if (input.mode === "edit") {
		const folderSlug = trimToNull(
			buildProviderFolderSlug(input.existingMedia, input.title),
		);
		const existingPath = trimToNull(input.existingMedia.path);
		const existingRootFolderPath = trimToNull(
			extractProviderRootFolderPath(input.existingMedia, folderSlug),
		);
		const resolvedRootFolderPath =
			selectedRootFolderPath ?? existingRootFolderPath;
		const previewPath =
			resolvedRootFolderPath && folderSlug
				? buildProviderMediaPath(resolvedRootFolderPath, folderSlug)
				: null;
		const willMove = !!(
			existingPath &&
			previewPath &&
			normalizePathForCompare(existingPath) !==
				normalizePathForCompare(previewPath)
		);

		return {
			selectedRootFolderPath: resolvedRootFolderPath,
			folderSlug,
			existingPath,
			previewPath,
			willMove,
		};
	}

	const folderSlug =
		input.provider === "sonarr"
			? buildProviderFolderSlugFromTitle(input.title, {
					tvdbId: input.providerIdHint,
				})
			: buildProviderFolderSlugFromTitle(input.title, {
					tmdbId: input.providerIdHint,
				});
	const previewPath =
		selectedRootFolderPath && folderSlug
			? buildProviderMediaPath(selectedRootFolderPath, folderSlug)
			: null;

	return {
		selectedRootFolderPath,
		folderSlug,
		existingPath: null,
		previewPath,
		willMove: false,
	};
};
