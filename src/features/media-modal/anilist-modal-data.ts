/** Pure AniList metadata, title, and header derivation for media modal data hooks. */
// src/features/media-modal/anilist-modal-data.ts

import {
	metadataHintFromAniListMetadata,
	resolveTitlePreference,
	type AniListTitleLanguage,
} from "@/anilist/title";
import type {
	AniListId,
	AniListMedia,
	AniListMediaFormat,
	AniListMediaHint,
} from "@/anilist/types";
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
	statusMetadata: AniListMediaHint | null;
	statusTitle?: string | undefined;
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

const normalizeSynonyms = (synonyms?: string[] | null): string[] => {
	if (!Array.isArray(synonyms)) return [];

	return [
		...new Set(
			synonyms
				.filter((value): value is string => typeof value === "string")
				.map((value) => value.trim())
				.filter((value) => value.length > 0),
		),
	].toSorted();
};

const normalizeRelationIds = (ids?: number[] | null): number[] => {
	if (!Array.isArray(ids)) return [];

	return [
		...new Set(
			ids.filter(
				(value): value is number =>
					typeof value === "number" && Number.isFinite(value),
			),
		),
	].toSorted((a, b) => a - b);
};

const mergeSynonyms = (
	a: string[] | null | undefined,
	b: string[] | null | undefined,
): string[] | null => {
	const merged = [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]
		.map((item) => item.trim())
		.filter((item) => item.length > 0);

	if (merged.length === 0) return null;
	return [...new Set(merged)];
};

const mergeRelationIds = (
	a: number[] | null | undefined,
	b: number[] | null | undefined,
): number[] | null => {
	const merged = [
		...(Array.isArray(a) ? a : []),
		...(Array.isArray(b) ? b : []),
	].filter(
		(value): value is number =>
			typeof value === "number" && Number.isFinite(value),
	);

	if (merged.length === 0) return null;
	return [...new Set(merged)];
};

function mergeMetadataHints(
	primary?: AniListMediaHint | null,
	secondary?: AniListMediaHint | null,
): AniListMediaHint | null {
	const hints = [primary ?? null, secondary ?? null].filter(
		(hint): hint is AniListMediaHint => !!hint,
	);
	if (hints.length === 0) return null;

	const result: AniListMediaHint = {
		titles: null,
		synonyms: null,
		startYear: null,
		format: null,
		relationPrequelIds: null,
		coverImage: null,
	};

	for (const hint of hints) {
		if (!result.titles && hint.titles) result.titles = hint.titles;
		if (!result.startYear && hint.startYear) result.startYear = hint.startYear;
		if (!result.format && hint.format) result.format = hint.format;
		if (!result.coverImage && hint.coverImage) {
			result.coverImage = hint.coverImage;
		}

		result.synonyms = mergeSynonyms(result.synonyms, hint.synonyms);
		result.relationPrequelIds = mergeRelationIds(
			result.relationPrequelIds,
			hint.relationPrequelIds,
		);
	}

	return result;
}

function prequelIdsFromMedia(media: AniListMedia): number[] | null {
	const ids = (media.relations?.edges ?? [])
		.filter((edge) => edge.relationType === "PREQUEL")
		.map((edge) => edge.node.id);
	const normalized = normalizeRelationIds(ids);
	return normalized.length > 0 ? normalized : null;
}

function metadataFromMediaObject(
	media?: AniListMedia | null,
): AniListMediaHint | null {
	if (!media) return null;

	const titles = Object.keys(media.title).length > 0 ? media.title : null;
	const synonyms = normalizeSynonyms(media.synonyms);
	const startYear = media.startDate?.year ?? null;
	const format = media.format ?? null;
	const prequelIds = prequelIdsFromMedia(media);

	if (
		!titles &&
		synonyms.length === 0 &&
		startYear == null &&
		!format &&
		!prequelIds
	) {
		return null;
	}

	return {
		titles: titles ?? null,
		synonyms: synonyms.length > 0 ? synonyms : null,
		startYear: startYear ?? null,
		format,
		relationPrequelIds: prequelIds ?? null,
	} satisfies AniListMediaHint;
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
	anilistId?: AniListId | undefined;
	fallbackLabel?: string | undefined;
	metadataHint: MediaModalMetadataHint | null;
	titles: MediaModalTitles;
}): string {
	const fallbackLabel =
		input.fallbackLabel ??
		(input.anilistId === undefined
			? "Unknown media"
			: `AniList #${input.anilistId}`);
	return (
		pickString(
			input.titles.english,
			input.titles.romaji,
			input.titles.native,
			input.metadataHint?.title,
		) ?? fallbackLabel
	);
}

export function resolveMediaModalMetadata(input: {
	anilistId?: AniListId | undefined;
	fallbackLabel?: string | undefined;
	anilistMedia: AniListMedia | null | undefined;
	metadataBatchData: GetAniListMetadataOutput | undefined;
	metadataHint: MediaModalMetadataHint | null;
	preferredTitleLanguage: AniListTitleLanguage;
}): ResolvedMediaModalMetadata {
	const {
		anilistId,
		fallbackLabel,
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
	const fallbackTitle = getFallbackTitle({
		...(anilistId === undefined ? {} : { anilistId }),
		...(fallbackLabel === undefined ? {} : { fallbackLabel }),
		metadataHint,
		titles,
	});
	const resolvedTitle = resolveTitlePreference({
		titles,
		preferred: preferredTitleLanguage,
		fallback: fallbackTitle,
	});
	const providerRequestTitle = resolvedTitle.primary;
	const defaultFallbackLabel =
		fallbackLabel ??
		(anilistId === undefined ? "Unknown media" : `AniList #${anilistId}`);
	const providerPayloadTitle =
		fallbackTitle === defaultFallbackLabel ? undefined : providerRequestTitle;
	const statusTitle = pickString(metadataHint?.title);

	return {
		resolvedMetadata,
		statusMetadata: canonical,
		...(statusTitle === undefined ? {} : { statusTitle }),
		providerRequestTitle,
		...(providerPayloadTitle === undefined ? {} : { providerPayloadTitle }),
		fallbackTitle,
		anilistHeaderData: buildAniListHeaderData({
			title: providerRequestTitle,
			anilistMedia,
			resolvedMetadata,
			format,
			coverImageHint: metadataHint?.coverImage ?? null,
		}),
	};
}
