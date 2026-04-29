/** High-value tests for unified manual mapping persistence behavior. */
// src/mapping/manual-mapping/manual-mapping.service.test.ts

import { beforeEach, describe, expect, it } from "vitest";
import { parseAniListId } from "@/anilist";
import { parseTvdbId } from "@/providers";
import { ManualMappingService } from "./manual-mapping.service";

const aid = parseAniListId;
const tvdb = parseTvdbId;

describe("ManualMappingService", () => {
	let service: ManualMappingService;

	beforeEach(async () => {
		service = new ManualMappingService();
		await service.init();
		await service.clearAll();
	});

	it("stores manual mappings and keeps linked AniList reverse IDs", async () => {
		await service.set("sonarr", aid(10), tvdb(200));
		await service.set("sonarr", aid(11), tvdb(200));

		expect(service.get("sonarr", aid(10))).toBe(tvdb(200));
		expect(service.list("sonarr")).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					anilistId: aid(10),
					provider: "sonarr",
					providerId: tvdb(200),
				}),
				expect.objectContaining({
					anilistId: aid(11),
					provider: "sonarr",
					providerId: tvdb(200),
				}),
			]),
		);
		expect(service.getLinkedAniListIds("sonarr", tvdb(200))).toEqual([
			aid(10),
			aid(11),
		]);
	});

	it("ignore clears manual mapping and reverse link", async () => {
		await service.set("sonarr", aid(10), tvdb(200));
		await service.setIgnore("sonarr", aid(10));

		expect(service.get("sonarr", aid(10))).toBeNull();
		expect(service.isIgnored("sonarr", aid(10))).toBe(true);
		expect(service.list("sonarr")).toEqual([]);
		expect(service.listIgnores("sonarr")).toEqual([
			expect.objectContaining({ anilistId: aid(10), provider: "sonarr" }),
		]);
		expect(service.getLinkedAniListIds("sonarr", tvdb(200))).toEqual([]);
	});

	it("stores and clears rejected candidate suppression", async () => {
		await service.setRejectedCandidate("sonarr", aid(10), tvdb(200));

		expect(service.getCandidateSuppression("sonarr", aid(10), tvdb(200))).toBe(
			"rejected",
		);
		expect(service.listRejectedCandidates("sonarr")).toEqual([
			expect.objectContaining({
				anilistId: aid(10),
				provider: "sonarr",
				providerId: tvdb(200),
			}),
		]);

		await service.clearRejectedCandidate("sonarr", aid(10), tvdb(200));

		expect(
			service.getCandidateSuppression("sonarr", aid(10), tvdb(200)),
		).toBeNull();
		expect(service.listRejectedCandidates("sonarr")).toEqual([]);
	});

	it("manual mapping clears ignore and the same rejected candidate", async () => {
		await service.setIgnore("sonarr", aid(10));
		await service.setRejectedCandidate("sonarr", aid(10), tvdb(200));
		await service.set("sonarr", aid(10), tvdb(200));

		expect(service.get("sonarr", aid(10))).toBe(tvdb(200));
		expect(service.isIgnored("sonarr", aid(10))).toBe(false);
		expect(
			service.getCandidateSuppression("sonarr", aid(10), tvdb(200)),
		).toBeNull();
		expect(service.listRejectedCandidates("sonarr")).toEqual([]);
	});
});
