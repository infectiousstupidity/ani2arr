/** Shared normalization helpers for AniList metadata bundle and overlay payloads. */
// src/anilist/metadata-normalization.ts

import * as v from "valibot";
import type { AniListTitles } from "@/anilist/schemas/media.schema";
import { AniListIdSchema } from "@/anilist/anilist-id";
import {
	AniListMediaFormatSchema,
} from "@/anilist/schemas/media.schema";
import {
	AniListMetadataBundleSchema,
	AniListMetadataChunkRefSchema,
	AniListMetadataSchema,
	AniListMetadataCoverImageSchema,
} from "@/anilist/schemas/metadata.schema";
import type { AniListMetadata } from "@/anilist/schemas/metadata.schema";

const RawAniListTitlesSchema = v.object({
	romaji: v.optional(v.nullable(v.string())),
	english: v.optional(v.nullable(v.string())),
	native: v.optional(v.nullable(v.string())),
});

const RawAniListMetadataEntrySchema = v.object({
	id: v.optional(AniListIdSchema),
	titles: v.optional(v.nullable(RawAniListTitlesSchema)),
	seasonYear: v.optional(v.nullable(v.number())),
	format: v.optional(v.nullable(AniListMediaFormatSchema)),
	coverImage: v.optional(v.nullable(AniListMetadataCoverImageSchema)),
	updatedAt: v.optional(v.nullable(v.number())),
});

const RawAniListMetadataBundleSchema = v.object({
	generatedAt: v.fallback(v.number(), () => Date.now()),
	entries: v.optional(v.array(v.unknown()), []),
	chunks: v.optional(v.array(v.unknown()), []),
});

type RawAniListTitles = v.InferOutput<typeof RawAniListTitlesSchema>;

export type AniListMetadataChunkRef = v.InferOutput<
	typeof AniListMetadataChunkRefSchema
>;
export type AniListMetadataBundle = v.InferOutput<
	typeof AniListMetadataBundleSchema
>;

export const normalizeTitles = (
	titles?: RawAniListTitles | AniListTitles | null,
): AniListTitles => {
	if (!titles) return {};

	const normalized: AniListTitles = {};
	if (typeof titles.english === "string" && titles.english.trim()) {
		normalized.english = titles.english;
	}
	if (typeof titles.romaji === "string" && titles.romaji.trim()) {
		normalized.romaji = titles.romaji;
	}
	if (typeof titles.native === "string" && titles.native.trim()) {
		normalized.native = titles.native;
	}
	return normalized;
};

export const normalizeMetadataEntry = (
	raw: unknown,
	fallbackUpdatedAt = Date.now(),
): AniListMetadata | null => {
	const result = v.safeParse(RawAniListMetadataEntrySchema, raw);
	if (!result.success) return null;

	const entry = result.output;
	if (!entry.id) return null;

	const normalized = {
		id: entry.id,
		titles: normalizeTitles(entry.titles ?? {}),
		seasonYear: entry.seasonYear ?? null,
		format: entry.format ?? null,
		coverImage: entry.coverImage
			? {
					medium: entry.coverImage.medium ?? null,
					large: entry.coverImage.large ?? null,
				}
			: null,
		updatedAt:
			typeof entry.updatedAt === "number" && Number.isFinite(entry.updatedAt)
				? entry.updatedAt
				: fallbackUpdatedAt,
	};

	const parsedMetadata = v.safeParse(AniListMetadataSchema, normalized);
	return parsedMetadata.success ? parsedMetadata.output : null;
};

export const parseMetadataBundle = (
	raw: unknown,
	fallbackGeneratedAt?: number,
): AniListMetadataBundle | null => {
	const result = v.safeParse(RawAniListMetadataBundleSchema, raw);
	if (!result.success) return null;

	const generatedAt = fallbackGeneratedAt ?? result.output.generatedAt;
	const entries = result.output.entries
		.map((entry) => normalizeMetadataEntry(entry, generatedAt))
		.filter((entry): entry is AniListMetadata => entry !== null);
	if (entries.length !== result.output.entries.length) {
		throw new Error(
			`AniList metadata bundle parse dropped ${result.output.entries.length - entries.length} entries`,
		);
	}

	const chunks = result.output.chunks
		.map((chunk) => {
			const parsedChunk = v.safeParse(AniListMetadataChunkRefSchema, chunk);
			return parsedChunk.success ? parsedChunk.output : null;
		})
		.filter((chunk): chunk is AniListMetadataChunkRef => chunk !== null);

	const parsedBundle = v.safeParse(AniListMetadataBundleSchema, {
		generatedAt,
		...(entries.length > 0 ? { entries } : {}),
		...(chunks.length > 0 ? { chunks } : {}),
	});
	return parsedBundle.success ? parsedBundle.output : null;
};
