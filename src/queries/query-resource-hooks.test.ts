/** Representative hook tests for normalized query keys and RPC requests. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseAniListId } from "@/anilist/types";
import { parseMyAnimeListId } from "@/myanimelist/types";
import { parseTmdbId, parseTvdbId } from "@/providers/schemas";
import type { RequestInSeerrInput, StatusInput } from "@/rpc/types";
import {
	createDefaultPublicOptions,
	type PublicOptionsUpdate,
} from "@/settings/schema";
import * as settingsStore from "@/settings/store";
import { useUpdatePublicOptions } from "./options";
import {
	normalizeProviderLookupRequest,
	normalizeSeerrMediaStatusRequest,
	normalizeSeerrSearchRequest,
	normalizeSeerrTargetRequest,
	normalizeSonarrStatusRequest,
	normalizeRadarrStatusRequest,
	queryKeys,
} from "./query-keys";
import {
	useRequestInSeerr,
	useSeerrMediaStatus,
	useSeerrSearch,
	useSeerrTarget,
} from "./seerr";
import { useMovieStatus } from "./radarr";
import { useSeriesStatus, useSonarrLookupSearch } from "./sonarr";

const mocks = vi.hoisted(() => ({
	useMutation: vi.fn(),
	useQuery: vi.fn(),
	queryClient: {
		setQueryData: vi.fn(),
		invalidateQueries: vi.fn(),
	},
	api: {
		getSeriesStatus: vi.fn(),
		getMovieStatus: vi.fn(),
		getSeerrTarget: vi.fn(),
		getSeerrMediaStatus: vi.fn(),
		searchSonarr: vi.fn(),
		searchSeerrMedia: vi.fn(),
		updatePublicOptions: vi.fn(),
	},
}));

vi.mock("@tanstack/react-query", () => ({
	useMutation: mocks.useMutation,
	useQuery: mocks.useQuery,
	useQueryClient: () => mocks.queryClient,
}));

vi.mock("@/rpc", () => ({
	getAni2arrApi: () => mocks.api,
}));

type CapturedQuery = {
	queryKey: readonly unknown[];
	queryFn: () => Promise<unknown>;
	enabled?: boolean;
	staleTime?: number;
	refetchOnMount?: boolean | "always";
	placeholderData: (
		data: unknown,
		query?: { queryKey: readonly unknown[] },
	) => unknown;
};

const aid = parseAniListId;
const mal = parseMyAnimeListId;
const tmdb = parseTmdbId;
const tvdb = parseTvdbId;

function capturedQuery(callIndex = -1): CapturedQuery {
	const call =
		callIndex === -1
			? mocks.useQuery.mock.calls.at(-1)
			: mocks.useQuery.mock.calls[callIndex];
	const options = call?.[0] as CapturedQuery | undefined;
	if (!options) throw new Error("Expected useQuery to be called.");
	return options;
}

beforeEach(() => {
	vi.clearAllMocks();
});

it("sends a targeted options update and refreshes from the persisted snapshot", async () => {
	const saved = createDefaultPublicOptions();
	saved.ui.browseCards.primaryStatus = "seerr";
	saved.ui.animePages.sonarr.enabled = false;
	const update = {
		type: "animePage",
		provider: "sonarr",
		enabled: false,
	} satisfies PublicOptionsUpdate;
	using readSaved = vi
		.spyOn(settingsStore, "getPublicOptionsSnapshot")
		.mockResolvedValue(saved);
	mocks.api.updatePublicOptions.mockResolvedValueOnce({ ok: true });

	useUpdatePublicOptions();
	const mutation = mocks.useMutation.mock.lastCall?.[0];
	const result = await mutation.mutationFn(update);
	mutation.onSuccess(result, update);

	expect(mocks.api.updatePublicOptions).toHaveBeenCalledExactlyOnceWith(update);
	expect(readSaved).toHaveBeenCalled();
	await vi.waitFor(() =>
		expect(mocks.queryClient.setQueryData).toHaveBeenCalledWith(
			queryKeys.publicOptions(),
			saved,
		),
	);
});

describe("normalized query resource hooks", () => {
	it("uses one normalized Sonarr status resource and adds controls only to RPC", async () => {
		const input: StatusInput = {
			source: { source: "mal", id: mal(5114) },
			title: "\tFullmetal\n Alchemist\t",
			metadata: {
				titles: { english: "\tFullmetal\tAlchemist\t" },
				synonyms: [" FMA ", "FMA"],
				relationPrequelIds: [2, 1, 2],
				coverImage: "cover",
			},
		};
		const resource = normalizeSonarrStatusRequest(input);

		useSeriesStatus(input, {
			force_verify: true,
			force_mapping_retry: true,
		});

		const query = capturedQuery();
		expect(query.queryKey).toEqual(
			queryKeys.providerMediaStatus("sonarr", resource),
		);
		expect(query.staleTime).toBe(0);
		expect(query.refetchOnMount).toBe("always");

		await query.queryFn();
		expect(mocks.api.getSeriesStatus).toHaveBeenCalledWith({
			...resource,
			force_verify: true,
			force_mapping_retry: true,
		});
	});

	it("keeps previous Arr status only for the same provider and source", async () => {
		const input: StatusInput = {
			source: { source: "anilist", id: aid(1) },
			title: " Movie ",
		};
		useMovieStatus(input);
		const movie = capturedQuery();
		const request = normalizeRadarrStatusRequest(input);
		expect(movie.queryKey).toEqual(
			queryKeys.providerMediaStatus("radarr", request),
		);
		await movie.queryFn();
		expect(mocks.api.getMovieStatus).toHaveBeenCalledWith(request);
		const previous = { isInLibrary: true };
		expect(movie.placeholderData(previous, { queryKey: movie.queryKey })).toBe(
			previous,
		);
		expect(
			movie.placeholderData(previous, {
				queryKey: queryKeys.providerMediaStatus(
					"sonarr",
					normalizeSonarrStatusRequest(input),
				),
			}),
		).toBeUndefined();
		expect(
			movie.placeholderData(previous, {
				queryKey: queryKeys.providerMediaStatusItem("radarr", {
					source: "anilist",
					id: aid(2),
				}),
			}),
		).toBeUndefined();
	});

	it("uses a normalized Seerr target key and request", async () => {
		const input = {
			source: { source: "anilist", id: aid(1) },
			mediaType: "tv" as const,
			title: " Frieren ",
		} as const;
		const resource = normalizeSeerrTargetRequest(input);
		useSeerrTarget(input);
		const query = capturedQuery();
		expect(query.queryKey).toEqual(queryKeys.seerrTarget(resource));
		await query.queryFn();
		expect(mocks.api.getSeerrTarget).toHaveBeenCalledWith(resource);
	});

	it("uses normalized Seerr seasons for both status key and RPC", async () => {
		const input: RequestInSeerrInput = {
			mediaType: "tv",
			tmdbId: tmdb(10),
			tvdbId: tvdb(20),
			seasons: [2, 1, 2],
		};
		const resource = normalizeSeerrMediaStatusRequest(input);

		useSeerrMediaStatus({ requestInput: input });

		const query = capturedQuery();
		expect(query.queryKey).toEqual(queryKeys.seerrMediaStatus(resource));
		await query.queryFn();
		expect(mocks.api.getSeerrMediaStatus).toHaveBeenCalledWith(resource);
	});

	it("invalidates Seerr status after seeding a successful request", () => {
		const requested = {
			mediaType: "tv",
			tmdbId: tmdb(10),
			seasons: [1],
		} satisfies RequestInSeerrInput;
		useRequestInSeerr();
		mocks.useMutation.mock.lastCall?.[0]?.onSuccess?.({}, requested);

		expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({
			queryKey: queryKeys.seerrMediaStatusItem("tv", tmdb(10)),
		});
		expect(mocks.queryClient.setQueryData).toHaveBeenCalledBefore(
			mocks.queryClient.invalidateQueries,
		);
	});

	it("uses normalized search requests for keys and RPC", async () => {
		const lookupResource = normalizeProviderLookupRequest({
			term: "\tFullmetal\n Alchemist\t",
		});
		const seerrResource = normalizeSeerrSearchRequest({
			query: "\tFullmetal\n Alchemist\t",
		});

		useSonarrLookupSearch({ term: "\tFullmetal\n Alchemist\t", enabled: true });
		useSeerrSearch({ query: "\tFullmetal\n Alchemist\t" });

		const lookup = capturedQuery(0);
		const seerr = capturedQuery(1);
		expect(lookup.queryKey).toEqual(
			queryKeys.providerLookup("sonarr", lookupResource),
		);
		expect(seerr.queryKey).toEqual(queryKeys.seerrSearch(seerrResource));

		await lookup.queryFn();
		await seerr.queryFn();
		expect(mocks.api.searchSonarr).toHaveBeenCalledWith(lookupResource);
		expect(mocks.api.searchSeerrMedia).toHaveBeenCalledWith(seerrResource);
	});
});
