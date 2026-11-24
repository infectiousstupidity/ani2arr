// @vitest-environment happy-dom
/**
 * RPC messages and overlay remounts for a browse page: first batch of cards,
 * then an infinite-scroll append. RPC is faked; counts are what matter.
 */
import { QueryClientProvider } from "@tanstack/react-query";
import * as Tooltip from "@radix-ui/react-tooltip";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, vi } from "vitest";
import { browser } from "wxt/browser";
import type { AniListId } from "@/anilist/types";
import { anilistBrowseAdapter } from "@/content/anilist/browse/adapter";
import { BrowseOverlays } from "@/content/browse/browse-overlays";
import { createExtensionQueryClient } from "@/queries/query-client";
import { queryKeys } from "@/queries/query-keys";
import { createDefaultPublicOptions } from "@/settings/schema";
import { buildAniListCards, report, stubVisibleIntersectionObserver } from "./helpers";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const calls = new Map<string, number>();
const messages = { count: 0 };
const identityIdsRequested = { count: 0 };
const delay = () => new Promise((resolve) => setTimeout(resolve, 5));
// Every 10th card is listed as an ONA (Sonarr by format) but mapped only to Radarr.
const radarrOnly = (id: number) => id % 10 === 0;

const fakeApi: Record<string, (...args: unknown[]) => Promise<unknown>> = {
	async getMappingIdentities(ids) {
		identityIdsRequested.count += (ids as unknown[]).length;
		// A fresh worker answers after decoding the stores (tens of ms, more on slow machines).
		await new Promise((resolve) => setTimeout(resolve, 200));
		return (ids as AniListId[]).flatMap((anilistId) =>
			radarrOnly(anilistId)
				? [{ anilistId, source: { source: "anilist", id: anilistId }, provider: "radarr", result: { kind: "mapped", source: "upstream", providerId: anilistId } }]
				: [{ anilistId, source: { source: "anilist", id: anilistId }, provider: "sonarr", result: { kind: "mapped", source: "upstream", providerId: anilistId } }],
		);
	},
	async getSeriesStatus() {
		await delay();
		return { mapping: { kind: "mapped", source: "upstream", providerId: 1 }, isInLibrary: false };
	},
	async getMovieStatus() {
		await delay();
		return { mapping: { kind: "mapped", source: "upstream", providerId: 1 }, isInLibrary: false };
	},
	async getSeriesStatuses(inputs) {
		await delay();
		return (inputs as unknown[]).map(() => ({ mapping: { kind: "mapped", source: "upstream", providerId: 1 }, isInLibrary: false }));
	},
	async getMovieStatuses(inputs) {
		await delay();
		return (inputs as unknown[]).map(() => ({ mapping: { kind: "mapped", source: "upstream", providerId: 1 }, isInLibrary: false }));
	},
	async getAniListMetadata() {
		await delay();
		return { metadata: [] };
	},
	async getSeerrTarget() {
		await delay();
		return { tmdbId: 5, mediaType: "tv", source: "anibridge" };
	},
	async getSeerrMediaStatus() {
		await delay();
		return { status: "unknown" };
	},
};

vi.mock("@/rpc", () => ({
	getAni2arrApi: () =>
		new Proxy(
			{},
			{
				get: (_target, property: string) => (...args: unknown[]) => {
					calls.set(property, (calls.get(property) ?? 0) + 1);
					messages.count += 1;
					const fn = fakeApi[property];
					if (!fn) throw new Error(`unexpected RPC ${property}`);
					return fn(...args);
				},
			},
		),
}));

const formatFor = (id: number) => (radarrOnly(id) ? "ONA" : "TV Show");

const settle = async () => {
	for (let index = 0; index < 20; index += 1) {
		await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
	}
};

async function run(seerr: boolean) {
	calls.clear();
	messages.count = 0;
	const grid = document.createElement("div");
	grid.className = "media-grid";
	grid.append(...buildAniListCards(1, 50, formatFor));
	document.body.replaceChildren(grid);
	stubVisibleIntersectionObserver();

	const options = createDefaultPublicOptions();
	options.providers.sonarr.isConfigured = true;
	options.providers.radarr.isConfigured = true;
	options.seerr.isConfigured = seerr;
	options.ui.browseCards.seerr.enabled = seerr;
	const client = createExtensionQueryClient({ staleTime: Infinity, retry: false });
	client.setQueryData(queryKeys.publicOptions(), options);

	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	await act(async () =>
		root.render(
			<QueryClientProvider client={client}>
				<Tooltip.Provider>
					<BrowseOverlays adapter={anilistBrowseAdapter} portalContainer={host} />
				</Tooltip.Provider>
			</QueryClientProvider>,
		),
	);
	await settle();
	const label = seerr ? "arr+seerr" : "arr only";
	report(`[${label}] first 50 cards: RPC messages`, `${messages.count} ${JSON.stringify(Object.fromEntries(calls))}`);

	calls.clear();
	messages.count = 0;
	identityIdsRequested.count = 0;
	await act(async () => {
		grid.append(...buildAniListCards(51, 100, formatFor));
	});
	await settle();
	report(`[${label}] scroll append 50 more: RPC messages`, `${messages.count} ${JSON.stringify(Object.fromEntries(calls))}`);
	report(`[${label}] AniList IDs sent in identity requests on append`, identityIdsRequested.count);

	// One automatic mapping found elsewhere bumps the revision once (L4-03, debounced 1 s).
	calls.clear();
	messages.count = 0;
	await act(async () => {
		await browser.storage.local.set({ mappingsRevision: crypto.randomUUID() });
	});
	await settle();
	report(`[${label}] one global mappings revision bump with 100 cards on screen: RPC messages`, `${messages.count} ${JSON.stringify(Object.fromEntries(calls))}`);

	// Automatic results now name the AniList IDs they changed.
	calls.clear();
	messages.count = 0;
	await act(async () => {
		await browser.storage.local.set({ mappingsRevision: { id: crypto.randomUUID(), anilistIds: [7, 42] } });
	});
	await settle();
	report(`[${label}] one automatic bump (2 AniList IDs) with 100 cards on screen: RPC messages`, `${messages.count} ${JSON.stringify(Object.fromEntries(calls))}`);
	await act(async () => root.unmount());
}

describe("browse overlays RPC traffic", () => {
	it("arr only", async () => run(false));
	it("arr + seerr", async () => run(true));
});
