/** Owns small media-modal formatting and provider target helpers. */
// src/features/media-modal/helpers.ts

import { parseAniListIdOrNull, type AniListId } from "@/anilist";
import type { MediaModalTargetSummary } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function joinProviderUrl(root: string, path?: string | null): string | undefined {
	if (!path) return undefined;
	const trimmedRoot = root.replace(/\/$/, "");
	if (/^https?:\/\//i.test(path)) return path;
	const normalized = path.startsWith("/") ? path : `/${path}`;
	return `${trimmedRoot}${normalized}`;
}

export function formatToken(value: string): string {
	return value.replaceAll("-", " ").replaceAll("_", " ");
}

export function normalizeLinkedAniListIds(
	ids: readonly number[] | undefined,
): AniListId[] | undefined {
	if (!ids?.length) return undefined;

	const parsed = ids
		.map((id) => parseAniListIdOrNull(id))
		.filter((id): id is AniListId => id !== null);

	return parsed.length > 0 ? [...new Set(parsed)] : undefined;
}

export function pickProviderPoster(
	value: unknown,
	baseUrl: string,
): string | undefined {
	if (!isRecord(value)) return undefined;

	const images = Array.isArray(value.images) ? value.images : [];
	const poster = images.find(
		(image) =>
			isRecord(image) &&
			typeof image.coverType === "string" &&
			image.coverType.toLowerCase() === "poster",
	);

	if (isRecord(poster)) {
		if (typeof poster.url === "string" && baseUrl) {
			return joinProviderUrl(baseUrl, poster.url);
		}

		if (typeof poster.remoteUrl === "string") {
			return poster.remoteUrl;
		}
	}

	return typeof value.remotePoster === "string" ? value.remotePoster : undefined;
}

export function targetsEqual(
	a: Pick<MediaModalTargetSummary, "provider" | "providerId"> | null,
	b: Pick<MediaModalTargetSummary, "provider" | "providerId"> | null,
): boolean {
	return (
		a !== null &&
		b !== null &&
		a.provider === b.provider &&
		a.providerId === b.providerId
	);
}
