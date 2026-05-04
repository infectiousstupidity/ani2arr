import type {
	SonarrAddOptions,
	SonarrAddPayloadOptions,
	SonarrLookupSeries,
	SonarrQualityProfileId,
	SonarrSeriesType,
	SonarrTagId,
} from "./types";

export type AddSonarrSeriesPayload = SonarrLookupSeries & {
	rootFolderPath: string;
	qualityProfileId: SonarrQualityProfileId;
	seriesType: SonarrSeriesType;
	seasonFolder: boolean;
	tags: SonarrTagId[];
	addOptions: SonarrAddPayloadOptions;
};

export function buildAddSonarrSeriesPayload(
	series: SonarrLookupSeries,
	options: SonarrAddOptions,
): AddSonarrSeriesPayload {
	return {
		...series,
		rootFolderPath: options.rootFolderPath,
		addOptions: {
			monitor: options.monitor,
			searchForMissingEpisodes: options.searchForMissingEpisodes,
			searchForCutoffUnmetEpisodes: options.searchForCutoffUnmetEpisodes,
		},
		qualityProfileId: options.qualityProfileId,
		seriesType: options.seriesType,
		seasonFolder: options.seasonFolder,
		tags: options.tags,
	};
}

export function buildSonarrAddPathPreview(
	rootFolderPath: string,
	series: SonarrLookupSeries,
): string {
	const root = rootFolderPath.replace(/[/\\]+$/, "");
	const separator = root.includes("\\") ? "\\" : "/";

	return `${root}${separator}${series.folder}`;
}
