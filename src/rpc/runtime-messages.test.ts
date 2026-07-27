import { browser } from "wxt/browser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AniListId } from "@/anilist/types";
import { openOptionsPage } from "./runtime-messages";

describe("openOptionsPage", () => {
	let sendMessage: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		sendMessage = vi.spyOn(browser.runtime, "sendMessage").mockResolvedValue();
	});

	it("opens mappings for a target AniList ID", () => {
		openOptionsPage({
			sectionId: "mappings",
			targetAnilistId: 42 as AniListId,
		});

		expect(sendMessage).toHaveBeenCalledWith({
			_a2a: true,
			type: "OPEN_OPTIONS_PAGE",
			sectionId: "mappings",
			targetAnilistId: 42,
			timestamp: expect.any(Number),
		});
	});

	it("opens full options without a section", () => {
		openOptionsPage();

		expect(sendMessage).toHaveBeenCalledWith({
			_a2a: true,
			type: "OPEN_OPTIONS_PAGE",
			timestamp: expect.any(Number),
		});
	});

	it("opens Seerr with the explicit CSRF recovery action", () => {
		openOptionsPage({
			sectionId: "seerr",
			enableSeerrCsrf: true,
		});

		expect(sendMessage).toHaveBeenCalledWith({
			_a2a: true,
			type: "OPEN_OPTIONS_PAGE",
			sectionId: "seerr",
			enableSeerrCsrf: true,
			timestamp: expect.any(Number),
		});
	});
});
