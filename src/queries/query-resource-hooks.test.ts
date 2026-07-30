/** Representative hook tests for normalized query keys and RPC requests. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseAniListId } from "@/anilist/types";
import { parseMyAnimeListId } from "@/myanimelist/types";
import { parseTmdbId, parseTvdbId } from "@/providers/schemas";
import type { RequestInSeerrInput, StatusInput } from "@/rpc/types";
import {
	normalizeProviderLookupRequest,
	normalizeSeerrMediaStatusRequest,
	normalizeSeerrSearchRequest,
	normalizeSeerrTargetRequest,
	normalizeSonarrStatusRequest,
	queryKeys,
} from "./query-keys";
import { useSeerrMediaStatus, useSeerrSearch, useSeerrTarget } from "./seerr";
import { useSeriesStatus, useSonarrLookupSearch } from "./sonarr";

const mocks = vi.hoisted(() => ({
	useQuery: vi.fn(),
	api: {
		getSeriesStatus: vi.fn(),
		getSeerrTarget: vi.fn(),
		getSeerrMediaStatus: vi.fn(),
		searchSonarr: vi.fn(),
		searchSeerrMedia: vi.fn(),
	},
}));

vi.mock("@tanstack/react-query", () => ({
	useMutation: vi.fn(),
	useQuery: mocks.useQuery,
	useQueryClient: vi.fn(),
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

describe("normalized query resource hooks", () => {
	it("uses one normalized Sonarr status resource and adds controls only to RPC", async () => {
		const input: StatusInput = {
			source: { source: "mal", id: mal(5114) },
			anilistId: aid(21),
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

	it("reuses the normal Seerr target key and forces retry execution", async () => {
		const base = {
			source: { source: "anilist", id: aid(1) },
			title: "\tFrieren\t",
			metadata: { titles: { english: " Frieren " }, coverImage: "cover" },
		} as const;
		const resource = normalizeSeerrTargetRequest(base);

		useSeerrTarget(base);
		useSeerrTarget({ ...base, forceRetry: true });

		const normal = capturedQuery(0);
		const forced = capturedQuery(1);
		expect(normal.queryKey).toEqual(queryKeys.seerrTarget(resource));
		expect(forced.queryKey).toEqual(normal.queryKey);
		expect(forced.staleTime).toBe(0);
		expect(forced.refetchOnMount).toBe("always");

		await forced.queryFn();
		expect(mocks.api.getSeerrTarget).toHaveBeenCalledWith({
			...resource,
			forceRetry: true,
		});
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
