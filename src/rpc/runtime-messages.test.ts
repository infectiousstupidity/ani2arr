/** Tests for extension options-page background launcher messages. */
// src/rpc/runtime-messages.test.ts

import { browser } from "wxt/browser";
import { describe, expect, it, vi } from "vitest";
import type { AniListId } from "@/anilist/types";
import { openOptionsPage } from "./runtime-messages";

describe("openOptionsPage", () => {
	it("opens a provider section", () => {
		const sendMessage = vi
			.spyOn(browser.runtime, "sendMessage")
			.mockResolvedValue();
		vi.spyOn(Date, "now").mockReturnValue(123);

		openOptionsPage({ sectionId: "sonarr" });

		expect(sendMessage).toHaveBeenCalledWith({
			_a2a: true,
			type: "OPEN_OPTIONS_PAGE",
			sectionId: "sonarr",
			timestamp: 123,
		});
	});

	it("opens mappings for a target AniList ID", () => {
		const sendMessage = vi
			.spyOn(browser.runtime, "sendMessage")
			.mockResolvedValue();
		vi.spyOn(Date, "now").mockReturnValue(456);

		openOptionsPage({
			sectionId: "mappings",
			targetAnilistId: 42 as AniListId,
		});

		expect(sendMessage).toHaveBeenCalledWith({
			_a2a: true,
			type: "OPEN_OPTIONS_PAGE",
			sectionId: "mappings",
			targetAnilistId: 42,
			timestamp: 456,
		});
	});

	it("opens full options without a section", () => {
		const sendMessage = vi
			.spyOn(browser.runtime, "sendMessage")
			.mockResolvedValue();
		vi.spyOn(Date, "now").mockReturnValue(789);

		openOptionsPage();

		expect(sendMessage).toHaveBeenCalledWith({
			_a2a: true,
			type: "OPEN_OPTIONS_PAGE",
			timestamp: 789,
		});
	});

	it("opens Seerr with the explicit CSRF recovery action", () => {
		const sendMessage = vi
			.spyOn(browser.runtime, "sendMessage")
			.mockResolvedValue();
		vi.spyOn(Date, "now").mockReturnValue(999);

		openOptionsPage({
			sectionId: "seerr",
			enableSeerrCsrf: true,
		});

		expect(sendMessage).toHaveBeenCalledWith({
			_a2a: true,
			type: "OPEN_OPTIONS_PAGE",
			sectionId: "seerr",
			enableSeerrCsrf: true,
			timestamp: 999,
		});
	});
});
