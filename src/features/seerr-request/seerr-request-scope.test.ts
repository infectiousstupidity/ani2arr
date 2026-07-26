/** Tests Seerr TV request-scope decisions. */

import { describe, expect, it } from "vitest";
import type { SeerrSeasonStatus } from "@/providers/seerr/types";
import { getSeerrRequestScopeDecision } from "./seerr-request-scope";

function requestableSeason(seasonNumber: number): SeerrSeasonStatus {
	return {
		seasonNumber,
		episodeCount: 12,
		status: "not-requested",
		requestable: true,
	};
}

describe("getSeerrRequestScopeDecision", () => {
	const multipleSeasons = [requestableSeason(1), requestableSeason(3)];

	it("offers a mapped season by default when partial requests are useful", () => {
		expect(
			getSeerrRequestScopeDecision({
				partialRequestsEnabled: true,
				enableSpecialEpisodes: false,
				mappedSeasons: [3],
				seasons: multipleSeasons,
			}),
		).toEqual({
			canChooseScope: true,
			canRequestWholeSeries: true,
			mappedSeasons: [3],
			defaultScope: "mapped",
		});
	});

	it("uses the whole series when partial requests are disabled", () => {
		expect(
			getSeerrRequestScopeDecision({
				partialRequestsEnabled: false,
				enableSpecialEpisodes: false,
				mappedSeasons: [3],
				seasons: multipleSeasons,
			}).defaultScope,
		).toBe("all");
	});

	it("uses the whole series when the target has no mapped season", () => {
		expect(
			getSeerrRequestScopeDecision({
				partialRequestsEnabled: true,
				enableSpecialEpisodes: false,
				mappedSeasons: [],
				seasons: multipleSeasons,
			}).defaultScope,
		).toBe("all");
	});

	it("does not offer a scope choice for a single requestable season", () => {
		expect(
			getSeerrRequestScopeDecision({
				partialRequestsEnabled: true,
				enableSpecialEpisodes: false,
				mappedSeasons: [1],
				seasons: [requestableSeason(1)],
			}),
		).toMatchObject({
			canChooseScope: false,
			defaultScope: "all",
		});
	});
});
