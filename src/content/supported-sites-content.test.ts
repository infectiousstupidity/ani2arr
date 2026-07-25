/** Timing tests for the shared supported-sites content entrypoint. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentScriptContext } from "wxt/utils/content-script-context";

const anichartBrowseMainMock = vi.hoisted(() => vi.fn(async () => {}));
const anilistAnimeMainMock = vi.hoisted(() => vi.fn(async () => {}));
const anilistBrowseMainMock = vi.hoisted(() => vi.fn(async () => {}));
const myAnimeListAnimeMainMock = vi.hoisted(() => vi.fn(async () => {}));
const myAnimeListBrowseMainMock = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("@/content/anichart/browse", () => ({
	main: anichartBrowseMainMock,
}));
vi.mock("@/content/anilist/anime-page", () => ({
	main: anilistAnimeMainMock,
}));
vi.mock("@/content/anilist/browse", () => ({
	main: anilistBrowseMainMock,
}));
vi.mock("@/content/myanimelist/anime-page", () => ({
	main: myAnimeListAnimeMainMock,
}));
vi.mock("@/content/myanimelist/browse", () => ({
	main: myAnimeListBrowseMainMock,
}));

import { runSupportedSitesContent } from "../entrypoints/supported-sites.content";

class FakeDocument extends EventTarget {
	body: HTMLElement | null = null;
	readyState: DocumentReadyState = "loading";

	finishLoading(): void {
		this.readyState = "interactive";
		this.dispatchEvent(new Event("DOMContentLoaded"));
	}
}

class FakeMutationObserver {
	static instances: FakeMutationObserver[] = [];

	readonly disconnect = vi.fn();
	readonly observe = vi.fn();

	constructor(private readonly callback: MutationCallback) {
		FakeMutationObserver.instances.push(this);
	}

	notify(): void {
		this.callback([], this as unknown as MutationObserver);
	}
}

function setLocation(url: string): void {
	const parsed = new URL(url);
	vi.stubGlobal("location", {
		href: parsed.href,
		hostname: parsed.hostname,
	});
}

function createContext(): {
	ctx: ContentScriptContext;
	invalidate: () => void;
} {
	let valid = true;
	const invalidationCallbacks = new Set<() => void>();
	const ctx = {
		get isInvalid() {
			return !valid;
		},
		get isValid() {
			return valid;
		},
		addEventListener(
			target: EventTarget,
			type: string,
			handler: EventListener,
			options?: AddEventListenerOptions,
		) {
			target.addEventListener(type, handler, options);
		},
		onInvalidated(callback: () => void) {
			invalidationCallbacks.add(callback);
			return () => invalidationCallbacks.delete(callback);
		},
	} as unknown as ContentScriptContext;

	return {
		ctx,
		invalidate: () => {
			valid = false;
			for (const callback of invalidationCallbacks) callback();
		},
	};
}

function insertBody(doc: FakeDocument): void {
	doc.body = {} as HTMLElement;
	for (const observer of FakeMutationObserver.instances) observer.notify();
}

const allOwnerMocks = [
	anichartBrowseMainMock,
	anilistAnimeMainMock,
	anilistBrowseMainMock,
	myAnimeListAnimeMainMock,
	myAnimeListBrowseMainMock,
];

describe("runSupportedSitesContent", () => {
	let doc: FakeDocument;

	beforeEach(() => {
		doc = new FakeDocument();
		FakeMutationObserver.instances = [];
		vi.stubGlobal("document", doc);
		vi.stubGlobal("MutationObserver", FakeMutationObserver);
	});

	it.each([
		"https://myanimelist.net/anime/season",
		"https://myanimelist.net/anime/season/2026/summer",
		"https://myanimelist.net/topanime.php?type=movie",
		"https://myanimelist.net/topanime.php?limit=50",
	])("starts MAL browse after body, once, on %s", async (url) => {
		setLocation(url);
		const { ctx } = createContext();
		const startup = runSupportedSitesContent(ctx);

		expect(allOwnerMocks.every((mock) => mock.mock.calls.length === 0)).toBe(
			true,
		);

		insertBody(doc);
		await vi.waitFor(() => {
			expect(myAnimeListBrowseMainMock).toHaveBeenCalledOnce();
		});
		expect(myAnimeListAnimeMainMock).not.toHaveBeenCalled();

		doc.finishLoading();
		await startup;

		expect(myAnimeListBrowseMainMock).toHaveBeenCalledOnce();
		expect(myAnimeListAnimeMainMock).toHaveBeenCalledOnce();
		expect(anichartBrowseMainMock).not.toHaveBeenCalled();
		expect(anilistAnimeMainMock).not.toHaveBeenCalled();
		expect(anilistBrowseMainMock).not.toHaveBeenCalled();
	});

	it.each([
		{
			url: "https://myanimelist.net/anime/genre/2/Adventure",
			expected: [myAnimeListAnimeMainMock, myAnimeListBrowseMainMock],
		},
		{
			url: "https://myanimelist.net/anime/5114/Fullmetal_Alchemist_Brotherhood",
			expected: [myAnimeListAnimeMainMock, myAnimeListBrowseMainMock],
		},
		{
			url: "https://anilist.co/",
			expected: [anilistAnimeMainMock, anilistBrowseMainMock],
		},
		{
			url: "https://anichart.net/Summer-2026",
			expected: [anichartBrowseMainMock],
		},
	])("defers $url owners until document end", async ({ url, expected }) => {
		setLocation(url);
		const { ctx } = createContext();
		const startup = runSupportedSitesContent(ctx);

		insertBody(doc);
		expect(allOwnerMocks.every((mock) => mock.mock.calls.length === 0)).toBe(
			true,
		);

		doc.finishLoading();
		await startup;

		for (const owner of allOwnerMocks) {
			expect(owner).toHaveBeenCalledTimes(expected.includes(owner) ? 1 : 0);
		}
	});

	it("cancels pending early startup when the content context is invalidated", async () => {
		setLocation("https://myanimelist.net/anime/season");
		const { ctx, invalidate } = createContext();
		const startup = runSupportedSitesContent(ctx);

		invalidate();
		await startup;

		insertBody(doc);
		doc.finishLoading();
		expect(allOwnerMocks.every((mock) => mock.mock.calls.length === 0)).toBe(
			true,
		);
		expect(FakeMutationObserver.instances[0]?.disconnect).toHaveBeenCalledOnce();
	});
});
