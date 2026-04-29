import { describe, expect, it } from "vitest";

import { deriveModalRoute } from "./use-modal-routing";

describe("modal routing", () => {
	it('keeps explicit mapping requests in the mapping view', () => {
		expect(
			deriveModalRoute({
				isConfigured: true,
				requestedView: "mapping",
				providerStatus: {
					providerId: null,
					providerMappingState: "mapped",
					isInLibrary: true,
				},
			}),
		).toMatchObject({ view: "mapping", setupMode: "edit" });
	});

	it("opens setup edit for configured mapped in-library status", () => {
		expect(
			deriveModalRoute({
				isConfigured: true,
				requestedView: "setup",
				providerStatus: {
					providerId: null,
					providerMappingState: "mapped",
					isInLibrary: true,
				},
			}),
		).toMatchObject({ view: "setup", setupMode: "edit" });
	});

	it("opens setup add for configured mapped statuses outside the library", () => {
		expect(
			deriveModalRoute({
				isConfigured: true,
				providerStatus: {
					providerId: null,
					providerMappingState: "mapped",
					isInLibrary: false,
				},
			}),
		).toMatchObject({ view: "setup", setupMode: "add" });
	});

	it("falls back to mapping when setup cannot be shown", () => {
		expect(
			deriveModalRoute({
				isConfigured: true,
				requestedView: "setup",
				providerStatus: {
					providerId: null,
					providerMappingState: "unmapped",
					isInLibrary: false,
				},
			}),
		).toMatchObject({ view: "mapping", canShowSetup: false });
	});

	it("falls back to mapping while the provider is not configured", () => {
		expect(
			deriveModalRoute({
				isConfigured: false,
				providerStatus: {
					providerId: null,
					providerMappingState: "mapped",
					isInLibrary: false,
				},
			}),
		).toMatchObject({ view: "mapping", canShowSetup: false });
	});
});
