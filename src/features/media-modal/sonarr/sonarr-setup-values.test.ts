/** Tests for Sonarr media modal setup value helpers. */
// src/features/media-modal/sonarr/sonarr-setup-values.test.ts

import { describe, expect, it } from "vitest";
import { parseAniListId } from "@/anilist/types";
import { parseTvdbId } from "@/providers/schemas";
import type {
	ProviderQualityProfileId,
	ProviderTagId,
	SonarrSeriesId,
} from "@/providers/schemas";
import type { GetSeriesStatusOutput } from "@/rpc/types";
import {
	getSonarrAddDefaults,
	getSonarrEditDefaults,
	getSonarrSetupTarget,
	hasFullSonarrEditItem,
	isSonarrSetupDraftDirty,
} from "./sonarr-setup-values";

const parseProviderQualityProfileId = (value: number) =>
	value as ProviderQualityProfileId;
const parseProviderTagId = (value: number) => value as ProviderTagId;
const parseSonarrSeriesId = (value: number) => value as SonarrSeriesId;

describe("sonarr setup values", () => {
	it("hydrates edit defaults from series-level fields only", () => {
		const defaults = getSonarrEditDefaults({
			id: parseSonarrSeriesId(11),
			title: "Example Series",
			tvdbId: parseTvdbId(22),
			titleSlug: "example-series",
			qualityProfileId: parseProviderQualityProfileId(33),
			rootFolderPath: "/media/series",
			path: "/media/series/Example Series",
			monitored: true,
			monitorNewItems: "none",
			seriesType: "anime",
			seasonFolder: true,
			tags: [parseProviderTagId(44)],
		});

		expect(defaults.form).toMatchObject({
			qualityProfileId: parseProviderQualityProfileId(33),
			rootFolderPath: "/media/series",
			monitored: true,
			monitorNewItems: "none",
			seriesType: "anime",
			seasonFolder: true,
			tags: [parseProviderTagId(44)],
			freeformTags: [],
		});
		expect(defaults.form.addOptions).toBeUndefined();
		expect(defaults.monitoringAction).toBe("noChange");
	});

	it("hydrates add defaults from persisted defaults", () => {
		const defaults = getSonarrAddDefaults({
			rootFolderPath: "/defaults",
			qualityProfileId: parseProviderQualityProfileId(44),
			addOptions: {
				monitor: "all",
				searchForMissingEpisodes: true,
				searchForCutoffUnmetEpisodes: false,
			},
		});

		expect(defaults).toMatchObject({
			rootFolderPath: "/defaults",
			qualityProfileId: parseProviderQualityProfileId(44),
			addOptions: {
				monitor: "all",
				searchForMissingEpisodes: true,
				searchForCutoffUnmetEpisodes: false,
			},
		});
	});

	it("derives dirty from current values and monitoring action", () => {
		const defaults = getSonarrEditDefaults({
			id: parseSonarrSeriesId(11),
			title: "Example Series",
			tvdbId: parseTvdbId(22),
			titleSlug: "example-series",
			qualityProfileId: parseProviderQualityProfileId(33),
			rootFolderPath: "/media/series",
			path: "/media/series/Example Series",
			monitored: true,
			monitorNewItems: "none",
			seriesType: "anime",
			seasonFolder: true,
			tags: [],
		});
		const changed = {
			...defaults.form,
			qualityProfileId: parseProviderQualityProfileId(66),
		};
		const reverted = {
			...changed,
			qualityProfileId: defaults.form.qualityProfileId,
		};

		expect(
			isSonarrSetupDraftDirty({
				baselineValues: defaults.form,
				values: changed,
				baselineMonitoringAction: defaults.monitoringAction,
				monitoringAction: defaults.monitoringAction,
			}),
		).toBe(true);
		expect(
			isSonarrSetupDraftDirty({
				baselineValues: defaults.form,
				values: reverted,
				baselineMonitoringAction: defaults.monitoringAction,
				monitoringAction: defaults.monitoringAction,
			}),
		).toBe(false);
		expect(
			isSonarrSetupDraftDirty({
				baselineValues: defaults.form,
				values: reverted,
				baselineMonitoringAction: defaults.monitoringAction,
				monitoringAction: "all",
			}),
		).toBe(true);
	});

	it("does not create an edit target from a lean in-library item", () => {
		const status: GetSeriesStatusOutput = {
			mapping: { kind: "mapped", source: "manual", providerId: parseTvdbId(22) },
			isInLibrary: true,
			series: {
				id: parseSonarrSeriesId(11),
				tvdbId: parseTvdbId(22),
				title: "Lean Series",
				titleSlug: "lean-series",
			},
		};

		expect(hasFullSonarrEditItem(status)).toBe(false);
		expect(
			getSonarrSetupTarget({
				anilistId: parseAniListId(1),
				status,
				targetTitle: "Fallback",
				storedDefaults: {},
			}),
		).toBeNull();
	});

	it("creates an edit target from a full in-library item", () => {
		const status: GetSeriesStatusOutput = {
			mapping: { kind: "mapped", source: "manual", providerId: parseTvdbId(22) },
			isInLibrary: true,
			series: {
				id: parseSonarrSeriesId(11),
				tvdbId: parseTvdbId(22),
				title: "Editable Series",
				titleSlug: "editable-series",
				qualityProfileId: parseProviderQualityProfileId(33),
				rootFolderPath: "/media/series",
				path: "/media/series/Editable Series",
				monitored: true,
				monitorNewItems: "all",
				seriesType: "anime",
				seasonFolder: true,
				tags: [],
			},
		};

		expect(
			getSonarrSetupTarget({
				anilistId: parseAniListId(1),
				status,
				targetTitle: "Fallback",
				storedDefaults: {},
			}),
		).toMatchObject({
			mode: "edit",
			key: "sonarr:edit:1:11",
			tvdbId: parseTvdbId(22),
			title: "Editable Series",
		});
	});

	it("creates an add target from mapped not-in-library status", () => {
		const status: GetSeriesStatusOutput = {
			mapping: { kind: "mapped", source: "manual", providerId: parseTvdbId(22) },
			isInLibrary: false,
		};

		expect(
			getSonarrSetupTarget({
				anilistId: parseAniListId(1),
				status,
				targetTitle: "Add Series",
				storedDefaults: {
					rootFolderPath: "/defaults",
					qualityProfileId: parseProviderQualityProfileId(44),
				},
			}),
		).toMatchObject({
			mode: "add",
			key: "sonarr:add:1:22",
			tvdbId: parseTvdbId(22),
			title: "Add Series",
			initialFormValues: {
				rootFolderPath: "/defaults",
				qualityProfileId: parseProviderQualityProfileId(44),
			},
		});
	});
});
