/** Tests for Sonarr add workflow payload building and save-time tag resolution. */
import { describe, expect, it, vi } from "vitest";
import type {
	ProviderQualityProfileId,
	ProviderTagId,
	SonarrSeriesId,
} from "@/providers/schemas";
import { parseTvdbId } from "@/providers/schemas";
import { addSonarrSeries } from "./add";
import type { SonarrClient } from "./client";
import type { SonarrFormState } from "./form-state";

const credentials = {
	url: "https://sonarr.example.test",
	apiKey: "secret",
};
const parseProviderQualityProfileId = (value: number) =>
	value as ProviderQualityProfileId;
const parseProviderTagId = (value: number) => value as ProviderTagId;
const parseSonarrSeriesId = (value: number) => value as SonarrSeriesId;
const tvdbId = parseTvdbId(34);
const qualityProfileId = parseProviderQualityProfileId(99);
const lookupSeries = {
	title: "Lookup Series",
	tvdbId,
	titleSlug: "lookup-series",
	folder: "Lookup Series [tvdb-34]",
};

function createInput(form: Partial<SonarrFormState> = {}) {
	return {
		tvdbId,
		title: "Example Series",
		form: {
			rootFolderPath: "/series",
			qualityProfileId,
			seriesType: "anime" as const,
			seasonFolder: true,
			tags: [],
			freeformTags: ["New Tag"],
			addOptions: {
				monitor: "all" as const,
				searchForMissingEpisodes: true,
				searchForCutoffUnmetEpisodes: false,
			},
			...form,
		},
		defaults: { freeformTags: [] },
		credentials,
	};
}

type ClientStub = Pick<
	SonarrClient,
	"lookupSeriesByTvdbId" | "addSeries" | "getTags" | "createTag"
>;

function createClient(overrides: Partial<ClientStub> = {}): ClientStub {
	return {
		lookupSeriesByTvdbId: vi.fn(async () => lookupSeries),
		addSeries: vi.fn(),
		getTags: vi.fn(async () => []),
		createTag: vi.fn(async () => ({
			id: parseProviderTagId(8),
			label: "new-tag",
		})),
		...overrides,
	};
}

describe("addSonarrSeries", () => {
	it("builds the Sonarr add payload, resolves tags on save, and returns the created series", async () => {
		const createdSeries = {
			id: parseSonarrSeriesId(12),
			title: "Lookup Series",
			tvdbId,
			titleSlug: "example-series",
			qualityProfileId,
			rootFolderPath: "/series",
			path: "/series/Example Series [tvdb-34]",
			monitored: true,
			monitorNewItems: "all" as const,
			seriesType: "anime" as const,
			seasonFolder: true,
			tags: [parseProviderTagId(7), parseProviderTagId(8)],
		};
		const client = createClient({
			lookupSeriesByTvdbId: vi.fn(async () => lookupSeries),
			addSeries: vi.fn(async () => createdSeries),
			getTags: vi.fn(async () => [
				{ id: parseProviderTagId(7), label: "Keep" },
			]),
		});

		const result = await addSonarrSeries(
			createInput({ tags: [parseProviderTagId(7)] }),
			{ client: client as unknown as SonarrClient },
		);

		expect(result).toBe(createdSeries);
		expect(client.lookupSeriesByTvdbId).toHaveBeenCalledWith(
			tvdbId,
			credentials,
		);
		expect(client.createTag).toHaveBeenCalledWith("new-tag", credentials);
		expect(client.addSeries).toHaveBeenCalledWith(
			{
				...lookupSeries,
				tvdbId,
				qualityProfileId,
				rootFolderPath: "/series",
				seasonFolder: true,
				monitored: true,
				seriesType: "anime",
				tags: [parseProviderTagId(7), parseProviderTagId(8)],
				addOptions: {
					monitor: "all",
					searchForMissingEpisodes: true,
					searchForCutoffUnmetEpisodes: false,
				},
			},
			credentials,
		);
	});

	it("does not add the series when tag creation fails", async () => {
		const client = createClient({
			createTag: vi.fn(async () => {
				throw new Error("Tag create failed");
			}),
		});

		await expect(
			addSonarrSeries(createInput(), {
				client: client as unknown as SonarrClient,
			}),
		).rejects.toThrow("Tag create failed");
		expect(client.addSeries).not.toHaveBeenCalled();
	});

	it("does not resolve tags or add when Sonarr lookup has no matching TVDB result", async () => {
		const client = createClient({
			lookupSeriesByTvdbId: vi.fn(async () => null),
		});

		await expect(
			addSonarrSeries(createInput(), {
				client: client as unknown as SonarrClient,
			}),
		).rejects.toMatchObject({
			code: "VALIDATION_ERROR",
		});
		expect(client.getTags).not.toHaveBeenCalled();
		expect(client.createTag).not.toHaveBeenCalled();
		expect(client.addSeries).not.toHaveBeenCalled();
	});

	it("does not resolve or create tags when required add fields are missing", async () => {
		const client = createClient();

		await expect(
			addSonarrSeries(
				createInput({
					addOptions: {
						searchForMissingEpisodes: true,
						searchForCutoffUnmetEpisodes: false,
					},
				}),
				{ client: client as unknown as SonarrClient },
			),
		).rejects.toMatchObject({
			code: "VALIDATION_ERROR",
		});
		expect(client.getTags).not.toHaveBeenCalled();
		expect(client.createTag).not.toHaveBeenCalled();
		expect(client.addSeries).not.toHaveBeenCalled();
	});
});
