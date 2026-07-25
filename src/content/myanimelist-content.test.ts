/** Startup tests for the MyAnimeList content entrypoint. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentScriptContext } from "wxt/utils/content-script-context";

const myAnimeListAnimeMainMock = vi.hoisted(() => vi.fn(async () => {}));
const myAnimeListBrowseMainMock = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("@/content/myanimelist/anime-page", () => ({
	main: myAnimeListAnimeMainMock,
}));
vi.mock("@/content/myanimelist/browse", () => ({
	main: myAnimeListBrowseMainMock,
}));

import { runMyAnimeListContent } from "../entrypoints/myanimelist.content";

const noop = (): void => {};

class FakeDocument extends EventTarget {
	body: HTMLElement | null = null;
	readyState: DocumentReadyState = "loading";
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

function createContext(): ContentScriptContext {
	return {
		get isInvalid() {
			return false;
		},
		get isValid() {
			return true;
		},
		onInvalidated: vi.fn(() => noop),
	} as unknown as ContentScriptContext;
}

function setLocation(url: string): void {
	vi.stubGlobal("location", { href: url });
}

describe("runMyAnimeListContent", () => {
	let doc: FakeDocument;

	beforeEach(() => {
		doc = new FakeDocument();
		FakeMutationObserver.instances = [];
		vi.stubGlobal("document", doc);
		vi.stubGlobal("MutationObserver", FakeMutationObserver);
	});

	it("starts browse after body appears and before DOMContentLoaded", async () => {
		setLocation("https://myanimelist.net/anime/genre/2/Adventure");
		const startup = runMyAnimeListContent(createContext());

		expect(myAnimeListBrowseMainMock).not.toHaveBeenCalled();

		doc.body = {} as HTMLElement;
		FakeMutationObserver.instances[0]?.notify();
		await startup;

		expect(doc.readyState).toBe("loading");
		expect(myAnimeListBrowseMainMock).toHaveBeenCalledOnce();
		expect(myAnimeListAnimeMainMock).not.toHaveBeenCalled();
	});

	it("starts only the anime-page owner for an anime detail URL", async () => {
		setLocation(
			"https://myanimelist.net/anime/5114/Fullmetal_Alchemist_Brotherhood",
		);

		await runMyAnimeListContent(createContext());

		expect(myAnimeListAnimeMainMock).toHaveBeenCalledOnce();
		expect(myAnimeListBrowseMainMock).not.toHaveBeenCalled();
	});
});
