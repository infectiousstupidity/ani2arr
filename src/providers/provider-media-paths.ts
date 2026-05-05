/** Low-level provider path math for joining, extraction, normalization, and move checks. */
// src/providers/provider-media-paths.ts

const trimTrailingSeparators = (input: string): string =>
	input.trim().replace(/[/\\]+$/, "");

const normalizeSeparators = (input: string): string =>
	input.replaceAll("\\", "/");

function trimToNull(value?: string | null): string | null {
	if (typeof value !== "string") return null;

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

export function normalizePathForCompare(path?: string | null): string | null {
	const trimmed = trimToNull(path);
	if (trimmed === null) return null;

	return normalizeSeparators(trimTrailingSeparators(trimmed)).toLowerCase();
}

export function joinRootAndFolder(
	rootFolderPath: string,
	folder: string,
): string {
	const root = trimTrailingSeparators(rootFolderPath);
	const normalizedFolder = folder.trim().replace(/^[/\\]+/, "");
	if (!root) return normalizedFolder;
	if (!normalizedFolder) return root;

	const separator = root.includes("\\") ? "\\" : "/";
	return `${root}${separator}${normalizedFolder}`;
}

export function extractRelativeFolder(
	path?: string | null,
	rootFolderPath?: string | null,
): string | null {
	const trimmedPath = trimToNull(path);
	const trimmedRoot = trimToNull(rootFolderPath);
	if (trimmedPath === null || trimmedRoot === null) return null;

	const normalizedPath = normalizeSeparators(
		trimTrailingSeparators(trimmedPath),
	);
	const normalizedRoot = normalizeSeparators(
		trimTrailingSeparators(trimmedRoot),
	);
	const normalizedPathLower = normalizedPath.toLowerCase();
	const normalizedRootLower = normalizedRoot.toLowerCase();

	if (normalizedPathLower === normalizedRootLower) return null;

	const rootedPrefix = `${normalizedRootLower}/`;
	if (!normalizedPathLower.startsWith(rootedPrefix)) return null;

	const relativeFolder = normalizedPath.slice(normalizedRoot.length + 1);
	return relativeFolder.length > 0 ? relativeFolder : null;
}

export function extractPathLeaf(path?: string | null): string | null {
	const trimmed = trimToNull(path);
	if (trimmed === null) return null;

	const normalizedPath = normalizeSeparators(trimTrailingSeparators(trimmed));
	const leaf = normalizedPath.split("/").at(-1)?.trim();
	return leaf || null;
}

export function shouldMoveProviderFiles(
	currentPath?: string | null,
	nextPath?: string | null,
): boolean {
	const currentPathNormalized = normalizePathForCompare(currentPath);
	const nextPathNormalized = normalizePathForCompare(nextPath);

	return (
		currentPathNormalized !== null &&
		nextPathNormalized !== null &&
		currentPathNormalized !== nextPathNormalized
	);
}
