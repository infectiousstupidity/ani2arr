/** Focused tests for AniList client response and error mapping. */
// src/anilist/client.test.ts

import { afterEach, describe, expect, it, vi } from "vitest";
import { AniListError, parseAniListId } from "@/anilist/types";
import { fetchAniListMedia } from "./client";

const response = (
	payload: unknown,
	options: { ok?: boolean; status?: number; headers?: Headers } = {},
): Response =>
	({
		ok: options.ok ?? true,
		status: options.status ?? 200,
		headers: options.headers ?? new Headers(),
		json: async () => payload,
	}) as Response;

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("AniList client", () => {
	it("throws GraphQL errors with useful messages", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				response({ errors: [{ message: "AniList exploded", status: 500 }] }),
			),
		);

		await expect(fetchAniListMedia(parseAniListId(301))).rejects.toThrow(
			"AniList GraphQL Error: AniList exploded",
		);
	});

	it("maps rate-limit responses with retry delay", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				response(null, {
					ok: false,
					status: 429,
					headers: new Headers({ "Retry-After": "2" }),
				}),
			),
		);

		await expect(fetchAniListMedia(parseAniListId(302))).rejects.toMatchObject({
			name: "AniListError",
			status: 429,
			retryAfterMs: 2000,
		} satisfies Partial<AniListError>);
	});

	it("normalizes nullable fields and filters invalid relation edges", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				response({
					data: {
						Media: {
							id: 501,
							format: "BRAND_NEW_FORMAT",
							title: { romaji: "Current", english: null },
							synonyms: ["Alias", null, 123],
							relations: {
								edges: [
									null,
									{ relationType: null, node: { id: 1 } },
									{ relationType: "SEQUEL", node: { id: null } },
									{
										relationType: "PREQUEL",
										node: {
											id: 500,
											format: "TV",
											title: { english: "Prequel" },
										},
									},
								],
							},
							coverImage: { large: "large.jpg", medium: null },
						},
					},
				}),
			),
		);

		const result = await fetchAniListMedia(parseAniListId(501));

		expect(result).toMatchObject({
			id: 501,
			format: null,
			title: { romaji: "Current" },
			synonyms: ["Alias"],
			relations: {
				edges: [
					{
						relationType: "PREQUEL",
						node: {
							id: 500,
							format: "TV",
							title: { english: "Prequel" },
						},
					},
				],
			},
			coverImage: { large: "large.jpg", medium: null },
		});
	});

	it("throws when response lacks media", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => response({ data: { Media: null } })),
		);

		await expect(fetchAniListMedia(parseAniListId(401))).rejects.toThrow(
			"AniList response missing media for 401",
		);
	});
});
