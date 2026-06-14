/** Tests for shared revision storage and broadcast helpers. */
// src/shared/sync/revisions.test.ts

import { describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import {
	MAPPINGS_REVISION_CHANGE_KEY,
	RADARR_LIBRARY_REVISION_CHANGE_KEY,
	SONARR_LIBRARY_REVISION_CHANGE_KEY,
	bumpMappingsRevision,
	bumpProviderLibraryRevision,
	resetAllRevisions,
} from "./revisions";

const FIRST_REVISION = "00000000-0000-4000-8000-000000000001";
const SECOND_REVISION = "00000000-0000-4000-8000-000000000002";

describe("revision signals", () => {
	it("writes named revision signals for mappings and libraries", async () => {
		await bumpMappingsRevision();
		await bumpProviderLibraryRevision("sonarr");
		await bumpProviderLibraryRevision("radarr");

		const stored = await browser.storage.local.get([
			MAPPINGS_REVISION_CHANGE_KEY,
			SONARR_LIBRARY_REVISION_CHANGE_KEY,
			RADARR_LIBRARY_REVISION_CHANGE_KEY,
		]);

		expect(stored[MAPPINGS_REVISION_CHANGE_KEY]).toEqual(expect.any(String));
		expect(stored[SONARR_LIBRARY_REVISION_CHANGE_KEY]).toEqual(
			expect.any(String),
		);
		expect(stored[RADARR_LIBRARY_REVISION_CHANGE_KEY]).toEqual(
			expect.any(String),
		);
	});

	it("writes a fresh value for repeated bumps", async () => {
		const randomUuid = vi
			.spyOn(crypto, "randomUUID")
			.mockReturnValueOnce(FIRST_REVISION)
			.mockReturnValueOnce(SECOND_REVISION);

		await bumpMappingsRevision();
		await bumpMappingsRevision();

		const stored = await browser.storage.local.get(MAPPINGS_REVISION_CHANGE_KEY);

		expect(randomUuid).toHaveBeenCalledTimes(2);
		expect(stored[MAPPINGS_REVISION_CHANGE_KEY]).toBe(SECOND_REVISION);
	});

	it("clears all revision signals", async () => {
		await bumpMappingsRevision();
		await bumpProviderLibraryRevision("sonarr");

		await resetAllRevisions();

		const stored = await browser.storage.local.get([
			MAPPINGS_REVISION_CHANGE_KEY,
			SONARR_LIBRARY_REVISION_CHANGE_KEY,
			RADARR_LIBRARY_REVISION_CHANGE_KEY,
		]);

		expect(stored).toEqual({});
	});
});
