/** Tests for Radarr add workflow payload building and save-time tag resolution. */
import { describe, expect, it, vi } from "vitest";
import type {
	ProviderQualityProfileId,
	ProviderTagId,
	RadarrMovieId,
} from "@/providers/schemas";
import { parseTmdbId } from "@/providers/schemas";
import { addRadarrMovie } from "./add";
import type { RadarrClient } from "./client";
import type { RadarrFormState } from "./form-state";

const credentials = {
	url: "https://radarr.example.test",
	apiKey: "secret",
};
const parseProviderQualityProfileId = (value: number) =>
	value as ProviderQualityProfileId;
const parseProviderTagId = (value: number) => value as ProviderTagId;
const parseRadarrMovieId = (value: number) => value as RadarrMovieId;
const tmdbId = parseTmdbId(34);
const qualityProfileId = parseProviderQualityProfileId(99);
const lookupMovie = {
	id: parseRadarrMovieId(1),
	title: "Lookup Movie",
	tmdbId,
	imdbId: "tt0034",
	titleSlug: "lookup-movie",
	originalTitle: "Lookup Movie Original",
	year: 2025,
	remotePoster: "https://image.example/poster.jpg",
	alternateTitles: [{ title: "Preserved Title" }],
	ratings: { imdb: { value: 8.1 } },
};

function createInput(form: Partial<RadarrFormState> = {}) {
	return {
		tmdbId,
		form: {
			rootFolderPath: "/movies",
			qualityProfileId,
			minimumAvailability: "released" as const,
			tags: [],
			freeformTags: ["New Tag"],
			addOptions: {
				monitor: "movieOnly" as const,
				searchForMovie: true,
			},
			...form,
		},
		defaults: { freeformTags: [] },
		credentials,
	};
}

type ClientStub = Pick<
	RadarrClient,
	"lookupMovieByTmdbId" | "addMovie" | "getTags" | "createTag"
>;

function createClient(overrides: Partial<ClientStub> = {}): ClientStub {
	return {
		lookupMovieByTmdbId: vi.fn(async () => lookupMovie),
		addMovie: vi.fn(),
		getTags: vi.fn(async () => []),
		createTag: vi.fn(async () => ({
			id: parseProviderTagId(8),
			label: "new-tag",
		})),
		...overrides,
	};
}

describe("addRadarrMovie", () => {
	it("looks up the movie by TMDB, builds the add payload, resolves tags, and returns the created movie", async () => {
		const originalLookupMovie = structuredClone(lookupMovie);
		const createdMovie = {
			...lookupMovie,
			id: parseRadarrMovieId(12),
			qualityProfileId,
			rootFolderPath: "/movies",
			path: "/movies/Lookup Movie [tmdb-34]",
			monitored: true,
			minimumAvailability: "released" as const,
			tags: [parseProviderTagId(7), parseProviderTagId(8)],
		};
		const client = createClient({
			lookupMovieByTmdbId: vi.fn(async () => lookupMovie),
			addMovie: vi.fn(async () => createdMovie),
			getTags: vi.fn(async () => [
				{ id: parseProviderTagId(7), label: "Keep" },
			]),
		});

		const result = await addRadarrMovie(
			createInput({
				tags: [parseProviderTagId(7)],
				addOptions: { monitor: "movieAndCollection", searchForMovie: false },
			}),
			{ client: client as unknown as RadarrClient },
		);

		expect(result).toBe(createdMovie);
		expect(lookupMovie).toEqual(originalLookupMovie);
		expect(client.lookupMovieByTmdbId).toHaveBeenCalledWith(
			tmdbId,
			credentials,
		);
		expect(client.createTag).toHaveBeenCalledWith("new-tag", credentials);
		expect(client.addMovie).toHaveBeenCalledWith(
			{
				id: 0,
				title: "Lookup Movie",
				tmdbId,
				imdbId: "tt0034",
				titleSlug: "lookup-movie",
				originalTitle: "Lookup Movie Original",
				year: 2025,
				remotePoster: "https://image.example/poster.jpg",
				alternateTitles: [{ title: "Preserved Title" }],
				qualityProfileId,
				rootFolderPath: "/movies",
				monitored: true,
				minimumAvailability: "released",
				tags: [parseProviderTagId(7), parseProviderTagId(8)],
				addOptions: {
					monitor: "movieAndCollection",
					searchForMovie: false,
				},
			},
			credentials,
		);
	});

	it("does not resolve tags or add when Radarr lookup has no matching TMDB result", async () => {
		const client = createClient({
			lookupMovieByTmdbId: vi.fn(async () => null),
		});

		await expect(
			addRadarrMovie(createInput(), {
				client: client as unknown as RadarrClient,
			}),
		).rejects.toMatchObject({
			code: "VALIDATION_ERROR",
		});
		expect(client.getTags).not.toHaveBeenCalled();
		expect(client.createTag).not.toHaveBeenCalled();
		expect(client.addMovie).not.toHaveBeenCalled();
	});

	it("derives unmonitored add payloads from the none monitor option", async () => {
		const client = createClient({
			lookupMovieByTmdbId: vi.fn(async () => ({
				title: "Lookup Movie",
				tmdbId,
			})),
			addMovie: vi.fn(async (payload) => ({
				...payload,
				id: parseRadarrMovieId(12),
				path: "/movies/Lookup Movie",
			})),
		});

		await addRadarrMovie(
			createInput({
				freeformTags: [],
				addOptions: { monitor: "none", searchForMovie: false },
			}),
			{ client: client as unknown as RadarrClient },
		);

		expect(client.addMovie).toHaveBeenCalledWith(
			expect.objectContaining({
				monitored: false,
				addOptions: {
					monitor: "none",
					searchForMovie: false,
				},
			}),
			credentials,
		);
	});

	it("does not look up, resolve tags, or add when required add fields are missing", async () => {
		const client = createClient();

		await expect(
			addRadarrMovie(
				createInput({
					minimumAvailability: undefined,
					addOptions: undefined,
				}),
				{ client: client as unknown as RadarrClient },
			),
		).rejects.toMatchObject({
			code: "VALIDATION_ERROR",
		});
		expect(client.lookupMovieByTmdbId).not.toHaveBeenCalled();
		expect(client.getTags).not.toHaveBeenCalled();
		expect(client.createTag).not.toHaveBeenCalled();
		expect(client.addMovie).not.toHaveBeenCalled();
	});
});
