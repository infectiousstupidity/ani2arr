// @vitest-environment happy-dom

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
	beforeEach(() => {
		if (!document.body) document.documentElement.append(document.createElement("body"));
		document.body.replaceChildren();
	});

	it("starts browse after body appears and before DOMContentLoaded", async () => {
		setLocation("https://myanimelist.net/anime/genre/2/Adventure");
		vi.spyOn(document, "readyState", "get").mockReturnValue("loading");
		document.body.remove();
		const startup = runMyAnimeListContent(createContext());

		expect(myAnimeListBrowseMainMock).not.toHaveBeenCalled();

		document.documentElement.append(document.createElement("body"));
		await startup;

		expect(document.readyState).toBe("loading");
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
