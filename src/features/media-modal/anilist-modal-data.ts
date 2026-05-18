/** Pure AniList metadata, title, and header derivation for media modal data hooks. */
// src/features/media-modal/anilist-modal-data.ts

import type { AniListId } from "@/anilist";
import {
	mergeMetadataHints,
	metadataFromMediaObject,
	metadataHintFromAniListMetadata,
} from "@/anilist/metadata-hints";
import type {
	AniListMedia,
	AniListMediaFormat,
	AniListMediaHint,
} from "@/anilist/schemas/media.schema";
import type { AniListTitleLanguage } from "@/anilist/schemas/title-language.schema";
import { resolveTitlePreference } from "@/anilist/title-preference";
import type { GetAniListMetadataOutput } from "@/rpc/types";
import type { AniListHeaderData, MediaModalMetadataHint } from "./types";

export type MediaModalTitles = {
	english: string | undefined;
	romaji: string | undefined;
	native: string | undefined;
};

export type ResolvedMediaModalMetadata = {
	anilistHeaderData: AniListHeaderData;
	fallbackTitle: string;
	providerPayloadTitle?: string | undefined;
	providerRequestTitle: string;
	resolvedMetadata: AniListMediaHint | null;
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
	coverImageHint: string | null | undefined;
}): string | null {
	return (
		input.anilistMedia?.coverImage?.extraLarge ??
		input.anilistMedia?.coverImage?.large ??
		input.anilistMedia?.coverImage?.medium ??
		input.resolvedMetadata?.coverImage ??
		input.coverImageHint ??
		null
	);
}

function getMediaYear(input: {
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

function extractTitles(input: {
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

function buildAniListHeaderData(input: {
	title: string;
	anilistMedia: AniListMedia | null | undefined;
	resolvedMetadata: AniListMediaHint | null;
	format: AniListMediaFormat | null;
	coverImageHint?: string | null;
}): AniListHeaderData {
	return {
		title: input.title,
		bannerImage: input.anilistMedia?.bannerImage ?? null,
		coverImage: getCoverImage({
			anilistMedia: input.anilistMedia,
			resolvedMetadata: input.resolvedMetadata,
			coverImageHint: input.coverImageHint,
		}),
		format: input.format,
		year: getMediaYear({
			anilistMedia: input.anilistMedia,
			resolvedMetadata: input.resolvedMetadata,
		}),
	};
}

function getFallbackTitle(input: {
	anilistId: AniListId;
	metadataHint: MediaModalMetadataHint | null;
	titles: MediaModalTitles;
}): string {
	return (
		pickString(
			input.titles.english,
			input.titles.romaji,
			input.titles.native,
			input.metadataHint?.title,
		) ?? `AniList #${input.anilistId}`
	);
}

function getHeaderTitle(input: {
	anilistMedia: AniListMedia | null | undefined;
	metadataHint: MediaModalMetadataHint | null;
	providerRequestTitle: string;
	resolvedMetadata: AniListMediaHint | null;
}): string {
	return (
		pickString(
			input.anilistMedia?.title?.english,
			input.anilistMedia?.title?.romaji,
			input.anilistMedia?.title?.native,
			input.resolvedMetadata?.titles?.english,
			input.resolvedMetadata?.titles?.romaji,
			input.resolvedMetadata?.titles?.native,
			input.metadataHint?.title,
		) ?? input.providerRequestTitle
	);
}

export function resolveMediaModalMetadata(input: {
	anilistId: AniListId;
	anilistMedia: AniListMedia | null | undefined;
	metadataBatchData: GetAniListMetadataOutput | undefined;
	metadataHint: MediaModalMetadataHint | null;
	preferredTitleLanguage: AniListTitleLanguage;
}): ResolvedMediaModalMetadata {
	const {
		anilistId,
		anilistMedia,
		metadataBatchData,
		metadataHint,
		preferredTitleLanguage,
	} = input;
	const rawMetadata = metadataBatchData?.metadata?.[0];
	const canonical = metadataHintFromAniListMetadata(rawMetadata ?? null);
	const mediaMeta = metadataFromMediaObject(anilistMedia ?? null);
	const resolvedMetadata = mergeMetadataHints(canonical, mediaMeta);
	const titles = extractTitles({ anilistMedia, resolvedMetadata });
	const format =
		getMediaFormat({
			canonicalMetadata: canonical,
			anilistMedia,
			resolvedMetadata,
		}) ??
		metadataHint?.format ??
		null;
	const fallbackTitle = getFallbackTitle({ anilistId, metadataHint, titles });
	const resolvedTitle = resolveTitlePreference({
		titles,
		preferred: preferredTitleLanguage,
		fallback: fallbackTitle,
	});
	const providerRequestTitle = resolvedTitle.primary;
	const providerPayloadTitle =
		fallbackTitle === `AniList #${anilistId}`
			? undefined
			: providerRequestTitle;

	return {
		resolvedMetadata,
		providerRequestTitle,
		...(providerPayloadTitle === undefined ? {} : { providerPayloadTitle }),
		fallbackTitle,
		anilistHeaderData: buildAniListHeaderData({
			title: getHeaderTitle({
				anilistMedia,
				metadataHint,
				providerRequestTitle,
				resolvedMetadata,
			}),
			anilistMedia,
			resolvedMetadata,
			format,
			coverImageHint: metadataHint?.coverImage ?? null,
		}),
	};
}
