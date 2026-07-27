import { describe, expect, it } from "vitest";
import { parseTvdbId } from "@/providers/schemas";
import type {
	ProviderQualityProfileId,
	ProviderTagId,
	SonarrSeriesId,
} from "@/providers/schemas";
import type { SonarrSeries } from "@/providers/sonarr/types";
import type { GetSeriesStatusOutput } from "@/rpc/types";
import {
	getSonarrEditDefaults,
	getSonarrSetupTarget,
	isSonarrSetupDraftDirty,
} from "./sonarr-setup-values";

const parseProviderQualityProfileId = (value: number) =>
	value as ProviderQualityProfileId;
const parseProviderTagId = (value: number) => value as ProviderTagId;
const parseSonarrSeriesId = (value: number) => value as SonarrSeriesId;

const series = {
	id: parseSonarrSeriesId(11),
	title: "Editable Series",
	tvdbId: parseTvdbId(22),
	titleSlug: "editable-series",
	qualityProfileId: parseProviderQualityProfileId(33),
	rootFolderPath: "/media/series",
	path: "/media/series/Editable Series",
	monitored: true,
	monitorNewItems: "none",
	seriesType: "anime",
	seasonFolder: true,
	tags: [parseProviderTagId(44)],
} satisfies SonarrSeries;

describe("sonarr setup values", () => {
	it("derives dirty from current values and monitoring action", () => {
		const defaults = getSonarrEditDefaults(series);
		type DirtyInput = Parameters<typeof isSonarrSetupDraftDirty>[0];
		const isDirty = (
			values: DirtyInput["values"],
			monitoringAction: DirtyInput["monitoringAction"] =
				defaults.monitoringAction,
		) =>
			isSonarrSetupDraftDirty({
				baselineValues: defaults.form,
				values,
				baselineMonitoringAction: defaults.monitoringAction,
				monitoringAction,
			});
		const changed = {
			...defaults.form,
			qualityProfileId: parseProviderQualityProfileId(66),
		};
		const reverted = {
			...changed,
			qualityProfileId: defaults.form.qualityProfileId,
		};

		expect(isDirty(changed)).toBe(true);
		expect(isDirty(reverted)).toBe(false);
		expect(isDirty(reverted, "all")).toBe(true);
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

		expect(
			getSonarrSetupTarget({
				identityKey: "anilist:1",
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
			series,
		};

		const target = getSonarrSetupTarget({
			identityKey: "anilist:1",
			status,
			targetTitle: "Fallback",
			storedDefaults: {},
		});

		expect(target).toMatchObject({
			mode: "edit",
			key: "sonarr:edit:anilist:1:11",
			tvdbId: parseTvdbId(22),
			title: "Editable Series",
			initialFormValues: {
				qualityProfileId: parseProviderQualityProfileId(33),
				rootFolderPath: "/media/series",
				monitored: true,
				monitorNewItems: "none",
				seriesType: "anime",
				seasonFolder: true,
				tags: [parseProviderTagId(44)],
				freeformTags: [],
			},
			initialMonitoringAction: "noChange",
		});
		expect(target?.initialFormValues.addOptions).toBeUndefined();
	});

	it("creates an add target from mapped not-in-library status", () => {
		const status: GetSeriesStatusOutput = {
			mapping: { kind: "mapped", source: "manual", providerId: parseTvdbId(22) },
			isInLibrary: false,
		};

		expect(
			getSonarrSetupTarget({
				identityKey: "anilist:1",
				status,
				targetTitle: "Add Series",
				storedDefaults: {
					rootFolderPath: "/defaults",
					qualityProfileId: parseProviderQualityProfileId(44),
				},
			}),
		).toMatchObject({
			mode: "add",
			key: "sonarr:add:anilist:1:22",
			tvdbId: parseTvdbId(22),
			title: "Add Series",
			initialFormValues: {
				rootFolderPath: "/defaults",
				qualityProfileId: parseProviderQualityProfileId(44),
				seriesType: "anime",
			},
		});
	});
});
