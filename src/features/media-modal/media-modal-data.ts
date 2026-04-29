/** Tiny shared pure helpers for provider-specific media modal data hooks. */
// src/features/media-modal/media-modal-data.ts

import type {
	AniListMedia,
	AniListMediaFormat,
	AniListMediaHint,
} from "@/anilist/schemas/media.schema";
import type { AniListHeaderData } from "./types";

export type MediaModalTitles = {
	english: string | undefined;
	romaji: string | undefined;
	native: string | undefined;
};

export function pickString(
	...values: Array<string | null | undefined>
): string | undefined {
	const found = values.find(
		(value) => typeof value === "string" && value.trim().length > 0,
	);
	return found === null || found === undefined ? undefined : found;
}

export function getMediaFormat(input: {
	canonicalMetadata: AniListMediaHint | null;
	anilistMedia: AniListMedia | null | undefined;
	resolvedMetadata: AniListMediaHint | null;
}): AniListMediaFormat | null {
	return (
		input.canonicalMetadata?.format ??
		input.anilistMedia?.format ??
		input.resolvedMetadata?.format ??
		null
	);
}

export function getCoverImage(input: {
	anilistMedia: AniListMedia | null | undefined;
	resolvedMetadata: AniListMediaHint | null;
}): string | null {
	return (
		input.anilistMedia?.coverImage?.extraLarge ??
		input.anilistMedia?.coverImage?.large ??
		input.anilistMedia?.coverImage?.medium ??
		input.resolvedMetadata?.coverImage ??
		null
	);
}

export function getMediaYear(input: {
	anilistMedia: AniListMedia | null | undefined;
	resolvedMetadata: AniListMediaHint | null;
}): number | null {
	return (
		input.anilistMedia?.seasonYear ??
		input.anilistMedia?.startDate?.year ??
		input.resolvedMetadata?.startYear ??
		null
	);
}

export function extractTitles(input: {
	anilistMedia: AniListMedia | null | undefined;
	resolvedMetadata: AniListMediaHint | null;
}): MediaModalTitles {
	return {
		english: pickString(
			input.anilistMedia?.title?.english,
			input.resolvedMetadata?.titles?.english,
		),
		romaji: pickString(
			input.anilistMedia?.title?.romaji,
			input.resolvedMetadata?.titles?.romaji,
		),
		native: pickString(
			input.anilistMedia?.title?.native,
			input.resolvedMetadata?.titles?.native,
		),
	};
}

export function buildAniListHeaderData(input: {
	title: string;
	anilistMedia: AniListMedia | null | undefined;
	resolvedMetadata: AniListMediaHint | null;
	format: AniListMediaFormat | null;
}): AniListHeaderData {
	return {
		title: input.title,
		bannerImage: input.anilistMedia?.bannerImage ?? null,
		coverImage: getCoverImage({
			anilistMedia: input.anilistMedia,
			resolvedMetadata: input.resolvedMetadata,
		}),
		format: input.format,
		year: getMediaYear({
			anilistMedia: input.anilistMedia,
			resolvedMetadata: input.resolvedMetadata,
		}),
	};
}
