/** AniList GraphQL client with rate-limit handling and defensive response mapping. */
// src/anilist/client.ts

import {
	AniListError,
	isAniListId,
	parseAniListMediaFormat,
	type AniListId,
	type AniListMedia,
	type AniListMetadata,
	type AniListMetadataBundle,
	type AniListMetadataChunkRef,
	type AniListTitles,
} from "@/anilist/types";

const ANILIST_GRAPHQL_API_URL = "https://graphql.anilist.co";
const DEFAULT_ANILIST_RETRY_AFTER_MS = 60_000;

const FETCH_MEDIA_QUERY = `
  query FetchMedia($id: Int!) {
    Media(id: $id, type: ANIME) {
      id
      format
      title { romaji english native }
      startDate { year }
      synonyms
      relations {
        edges {
          relationType(version: 2)
          node {
            id
            format
            title { romaji english native }
            startDate { year }
            synonyms
          }
        }
      }
      bannerImage
      coverImage {
        extraLarge
        large
        medium
        color
      }
      seasonYear
    }
  }
`;

const asRecord = (value: unknown): Record<string, unknown> | null =>
	value && typeof value === "object" ? (value as Record<string, unknown>) : null;

const stringOrNull = (value: unknown): string | null =>
	typeof value === "string" && value.trim().length > 0 ? value : null;

const numberOrNull = (value: unknown): number | null =>
	typeof value === "number" && Number.isFinite(value) ? value : null;

const normalizeTitles = (value: unknown): AniListTitles => {
	const raw = asRecord(value);
	if (!raw) return {};

	const titles: AniListTitles = {};
	const english = stringOrNull(raw.english);
	const romaji = stringOrNull(raw.romaji);
	const native = stringOrNull(raw.native);
	if (english) titles.english = english;
	if (romaji) titles.romaji = romaji;
	if (native) titles.native = native;
	return titles;
};

const normalizeSynonyms = (value: unknown): string[] =>
	Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];

const normalizeStartDate = (
	value: unknown,
): { year?: number | null | undefined } | undefined => {
	const raw = asRecord(value);
	if (!raw) return undefined;

	const year = numberOrNull(raw.year);
	return year === null ? {} : { year };
};

const normalizeRelationNode = (
	value: unknown,
): NonNullable<AniListMedia["relations"]>["edges"][number]["node"] | null => {
	const raw = asRecord(value);
	if (!raw || !isAniListId(raw.id)) return null;

	const title = normalizeTitles(raw.title);
	const synonyms = normalizeSynonyms(raw.synonyms);
	const startDate = normalizeStartDate(raw.startDate);

	return {
		id: raw.id,
		...(parseAniListMediaFormat(raw.format) === null
			? {}
			: { format: parseAniListMediaFormat(raw.format) }),
		...(Object.keys(title).length > 0 ? { title } : {}),
		...(startDate ? { startDate } : {}),
		...(synonyms.length > 0 ? { synonyms } : {}),
	};
};

const normalizeRelations = (value: unknown): AniListMedia["relations"] | undefined => {
	const raw = asRecord(value);
	const edges = raw?.edges;
	if (!Array.isArray(edges)) return undefined;

	const normalized = edges
		.map((edge) => {
			const rawEdge = asRecord(edge);
			if (!rawEdge || typeof rawEdge.relationType !== "string") return null;

			const node = normalizeRelationNode(rawEdge.node);
			return node ? { relationType: rawEdge.relationType, node } : null;
		})
		.filter(
			(edge): edge is NonNullable<AniListMedia["relations"]>["edges"][number] =>
				edge !== null,
		);

	return { edges: normalized };
};

const normalizeCoverImage = (value: unknown): AniListMedia["coverImage"] => {
	const raw = asRecord(value);
	if (!raw) return null;

	return {
		extraLarge: stringOrNull(raw.extraLarge),
		large: stringOrNull(raw.large),
		medium: stringOrNull(raw.medium),
		color: stringOrNull(raw.color),
	};
};

const mapMedia = (value: unknown): AniListMedia => {
	const raw = asRecord(value);
	if (!raw || !isAniListId(raw.id)) {
		throw new AniListError("AniList response missing valid media ID");
	}

	const startDate = normalizeStartDate(raw.startDate);
	const relations = normalizeRelations(raw.relations);
	const bannerImage = stringOrNull(raw.bannerImage);
	const seasonYear = numberOrNull(raw.seasonYear);

	return {
		id: raw.id,
		format: parseAniListMediaFormat(raw.format),
		title: normalizeTitles(raw.title),
		...(startDate ? { startDate } : {}),
		synonyms: normalizeSynonyms(raw.synonyms),
		...(relations ? { relations } : {}),
		bannerImage,
		coverImage: normalizeCoverImage(raw.coverImage),
		seasonYear,
	};
};

const parseRetryAfterMs = (header: string | null, now = Date.now()): number | null => {
	if (!header) return null;

	const seconds = Number(header);
	if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;

	const dateMs = Date.parse(header);
	if (Number.isNaN(dateMs)) return null;

	const delay = dateMs - now;
	return delay > 0 ? delay : null;
};

const parseRateLimitResetMs = (header: string | null): number | null => {
	const seconds = Number(header);
	return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
};

async function postAniList(params: {
	query: string;
	variables: Record<string, unknown>;
}): Promise<unknown> {
	const response = await fetch(ANILIST_GRAPHQL_API_URL, {
		method: "POST",
		headers: { "Content-Type": "application/json", Accept: "application/json" },
		body: JSON.stringify(params),
	});

	if (!response.ok) {
		if (response.status === 429) {
			const now = Date.now();
			const resetDelayMs =
				(parseRateLimitResetMs(response.headers.get("X-RateLimit-Reset")) ??
					now) - now;
			const retryAfterMs =
				parseRetryAfterMs(response.headers.get("Retry-After"), now) ??
				(resetDelayMs > 0 ? resetDelayMs : DEFAULT_ANILIST_RETRY_AFTER_MS);
			throw new AniListError("AniList rate limit exceeded", {
				status: 429,
				retryAfterMs: Math.max(0, retryAfterMs),
			});
		}

		throw new AniListError(`AniList API Error: ${response.status}`, {
			status: response.status,
		});
	}

	return response.json();
}

const assertNoGraphqlErrors = (payload: unknown): void => {
	const errors = asRecord(payload)?.errors;
	if (!Array.isArray(errors) || errors.length === 0) return;

	const message =
		errors
			.map((error) => asRecord(error)?.message)
			.filter((value): value is string => typeof value === "string")
			.join(", ") || "Unknown AniList GraphQL error";
	throw new AniListError(`AniList GraphQL Error: ${message}`);
};

export async function fetchAniListMedia(id: AniListId): Promise<AniListMedia> {
	const payload = await postAniList({
		query: FETCH_MEDIA_QUERY,
		variables: { id },
	});
	assertNoGraphqlErrors(payload);

	const media = asRecord(asRecord(payload)?.data)?.Media;
	if (!media) {
		throw new AniListError(`AniList response missing media for ${id}`);
	}
	return mapMedia(media);
}

const normalizeMetadataCover = (
	value: unknown,
): AniListMetadata["coverImage"] => {
	const raw = asRecord(value);
	if (!raw) return null;

	return {
		medium: stringOrNull(raw.medium),
		large: stringOrNull(raw.large),
	};
};

function parseMetadataEntry(
	value: unknown,
): AniListMetadata | null {
	const raw = asRecord(value);
	if (!raw || !isAniListId(raw.id)) return null;

	return {
		id: raw.id,
		titles: normalizeTitles(raw.titles),
		seasonYear: numberOrNull(raw.seasonYear),
		format: parseAniListMediaFormat(raw.format),
		coverImage: normalizeMetadataCover(raw.coverImage),
	};
}

const parseChunkRef = (value: unknown): AniListMetadataChunkRef | null => {
	const raw = asRecord(value);
	if (!raw || typeof raw.file !== "string" || raw.file.trim().length === 0) {
		return null;
	}
	const count = numberOrNull(raw.count);
	if (count === null || !Number.isInteger(count) || count < 0) return null;

	return { file: raw.file, count };
};

export function parseMetadataBundle(
	value: unknown,
	fallbackGeneratedAt?: number,
): AniListMetadataBundle | null {
	const raw = asRecord(value);
	if (!raw) return null;

	const generatedAt = fallbackGeneratedAt ?? numberOrNull(raw.generatedAt);
	if (generatedAt === null) return null;

	const entries = Array.isArray(raw.entries)
		? raw.entries
				.map((entry) => parseMetadataEntry(entry))
				.filter((entry): entry is AniListMetadata => entry !== null)
		: [];
	if (Array.isArray(raw.entries) && entries.length !== raw.entries.length) {
		throw new Error(
			`AniList metadata bundle parse dropped ${raw.entries.length - entries.length} entries`,
		);
	}

	const chunks = Array.isArray(raw.chunks)
		? raw.chunks
				.map((chunk) => parseChunkRef(chunk))
				.filter((chunk): chunk is AniListMetadataChunkRef => chunk !== null)
		: [];

	return {
		generatedAt,
		...(entries.length > 0 ? { entries } : {}),
		...(chunks.length > 0 ? { chunks } : {}),
	};
}
