/** AniList title helpers, local title-language options, links, and metadata hints. */
// src/anilist/title.ts

import type {
	AniListId,
	AniListMediaHint,
	AniListMetadata,
	AniListTitles,
} from "@/anilist/types";

export const ANILIST_TITLE_LANGUAGES = ["english", "romaji", "native"] as const;

export type AniListTitleLanguage = (typeof ANILIST_TITLE_LANGUAGES)[number];

export const isAniListTitleLanguage = (
	value: unknown,
): value is AniListTitleLanguage =>
	typeof value === "string" &&
	ANILIST_TITLE_LANGUAGES.includes(value as AniListTitleLanguage);

const TITLE_LANGUAGE_ORDER: AniListTitleLanguage[] = [
	"english",
	"romaji",
	"native",
];

const ANILIST_TITLE_LANGUAGE_LABELS: Readonly<
	Record<AniListTitleLanguage, string>
> = {
	english: "English",
	romaji: "Romaji",
	native: "Native",
};

const normalizeTitle = (value?: string | null): string | null => {
	if (typeof value !== "string") return null;

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
};

const getAniListTitleLanguageLabel = (
	language: AniListTitleLanguage,
	options?: { includeDefaultSuffix?: boolean },
): string => {
	const label = ANILIST_TITLE_LANGUAGE_LABELS[language];
	return options?.includeDefaultSuffix && language === "english"
		? `${label} (default)`
		: label;
};

export const resolveTitlePreference = (params: {
	titles?: AniListTitles | null;
	preferred?: AniListTitleLanguage;
	fallback?: string | null;
}): {
	primary: string;
	usedLanguage: AniListTitleLanguage | "fallback";
	alternates: Array<{ label: string; value: string }>;
} => {
	const preferred = params.preferred ?? "english";
	const uniqueOrder = [
		...new Set<AniListTitleLanguage>([preferred, ...TITLE_LANGUAGE_ORDER]),
	];
	const titleMap = params.titles ?? {};
	const fallbackTitle = normalizeTitle(params.fallback);

	let primary = "";
	let usedLanguage: AniListTitleLanguage | "fallback" = "fallback";

	for (const language of uniqueOrder) {
		const candidate = normalizeTitle(titleMap[language]);
		if (candidate) {
			primary = candidate;
			usedLanguage = language;
			break;
		}
	}

	if (!primary && fallbackTitle) {
		primary = fallbackTitle;
		usedLanguage = "fallback";
	}

	if (!primary) {
		primary = "Unknown title";
	}

	const alternates = TITLE_LANGUAGE_ORDER
		.filter((language) => language !== usedLanguage)
		.map((language) => {
			const value = normalizeTitle(titleMap[language]);
			return value && value !== primary
				? { label: getAniListTitleLanguageLabel(language), value }
				: null;
		})
		.filter((entry): entry is { label: string; value: string } => entry !== null);

	return { primary, usedLanguage, alternates };
};

export function buildAniListAnimeUrl(anilistId: AniListId): string {
	return `https://anilist.co/anime/${anilistId}`;
}

export const metadataHintFromAniListMetadata = (
	metadata?: AniListMetadata | null,
): AniListMediaHint | null => {
	if (!metadata) return null;

	const titles =
		metadata.titles && Object.keys(metadata.titles).length > 0
			? metadata.titles
			: null;
	const coverImage =
		metadata.coverImage?.large ?? metadata.coverImage?.medium ?? null;

	if (
		!titles &&
		metadata.seasonYear == null &&
		metadata.format == null &&
		!coverImage
	) {
		return null;
	}

	return {
		titles,
		synonyms: null,
		startYear: metadata.seasonYear ?? null,
		format: metadata.format ?? null,
		relationPrequelIds: null,
		coverImage,
	};
};
