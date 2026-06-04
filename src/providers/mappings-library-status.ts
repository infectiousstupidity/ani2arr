/** Combines mapping list results with provider library presence. */
// src/providers/mappings-library-status.ts

import type {
	AmbiguousMappingListEntry,
	IgnoredMappingListEntry,
	MappedTargetGroup,
	MappingList,
	UnmappedMappingListEntry,
} from "@/mapping/list-mappings";

import type { RadarrMovieSnapshot } from "./radarr/types";
import type { SonarrSeriesSnapshot } from "./sonarr/types";

type MappingTarget = {
	providerId: MappedTargetGroup["providerId"];
	season?: number;
};

export type SonarrLibraryTarget = MappingTarget & {
	provider: "sonarr";
	isInLibrary: boolean;
	libraryItem: SonarrSeriesSnapshot | null;
};

export type RadarrLibraryTarget = MappingTarget & {
	provider: "radarr";
	isInLibrary: boolean;
	libraryItem: RadarrMovieSnapshot | null;
};

export interface SonarrMappedTargetGroupStatus extends MappedTargetGroup {
	isInLibrary: boolean;
	libraryItem: SonarrSeriesSnapshot | null;
}

export interface RadarrMappedTargetGroupStatus extends MappedTargetGroup {
	isInLibrary: boolean;
	libraryItem: RadarrMovieSnapshot | null;
}

export interface SonarrAmbiguousMappingStatus extends AmbiguousMappingListEntry {
	targets: SonarrLibraryTarget[];
	existingTargets: SonarrLibraryTarget[];
	activeTarget: SonarrLibraryTarget | null;
}

export interface RadarrAmbiguousMappingStatus extends AmbiguousMappingListEntry {
	targets: RadarrLibraryTarget[];
	existingTargets: RadarrLibraryTarget[];
	activeTarget: RadarrLibraryTarget | null;
}

export interface SonarrMappingsLibraryStatus {
	provider: "sonarr";
	mapped: SonarrMappedTargetGroupStatus[];
	ignored: IgnoredMappingListEntry[];
	ambiguous: SonarrAmbiguousMappingStatus[];
	unmapped: UnmappedMappingListEntry[];
}

export interface RadarrMappingsLibraryStatus {
	provider: "radarr";
	mapped: RadarrMappedTargetGroupStatus[];
	ignored: IgnoredMappingListEntry[];
	ambiguous: RadarrAmbiguousMappingStatus[];
	unmapped: UnmappedMappingListEntry[];
}

export function composeSonarrMappingsLibraryStatus(
	mappings: MappingList,
	library: readonly SonarrSeriesSnapshot[],
): SonarrMappingsLibraryStatus {
	if (mappings.provider !== "sonarr") {
		throw new Error("Expected Sonarr mapping list.");
	}

	const libraryByTvdbId = new Map(
		library.map((series) => [Number(series.tvdbId), series] as const),
	);

	return {
		provider: "sonarr",
		mapped: mappings.mapped.map((group) =>
			composeSonarrMappedGroup(group, libraryByTvdbId),
		),
		ignored: mappings.ignored,
		ambiguous: mappings.ambiguous.map((entry) =>
			composeSonarrAmbiguousEntry(entry, libraryByTvdbId),
		),
		unmapped: mappings.unmapped,
	};
}

export function composeRadarrMappingsLibraryStatus(
	mappings: MappingList,
	library: readonly RadarrMovieSnapshot[],
): RadarrMappingsLibraryStatus {
	if (mappings.provider !== "radarr") {
		throw new Error("Expected Radarr mapping list.");
	}

	const libraryByTmdbId = new Map(
		library.map((movie) => [Number(movie.tmdbId), movie] as const),
	);

	return {
		provider: "radarr",
		mapped: mappings.mapped.map((group) =>
			composeRadarrMappedGroup(group, libraryByTmdbId),
		),
		ignored: mappings.ignored,
		ambiguous: mappings.ambiguous.map((entry) =>
			composeRadarrAmbiguousEntry(entry, libraryByTmdbId),
		),
		unmapped: mappings.unmapped,
	};
}

function composeSonarrMappedGroup(
	group: MappedTargetGroup,
	libraryByTvdbId: ReadonlyMap<number, SonarrSeriesSnapshot>,
): SonarrMappedTargetGroupStatus {
	const libraryItem = libraryByTvdbId.get(Number(group.providerId)) ?? null;

	return {
		...group,
		isInLibrary: libraryItem !== null,
		libraryItem,
	};
}

function composeRadarrMappedGroup(
	group: MappedTargetGroup,
	libraryByTmdbId: ReadonlyMap<number, RadarrMovieSnapshot>,
): RadarrMappedTargetGroupStatus {
	const libraryItem = libraryByTmdbId.get(Number(group.providerId)) ?? null;

	return {
		...group,
		isInLibrary: libraryItem !== null,
		libraryItem,
	};
}

function composeSonarrAmbiguousEntry(
	entry: AmbiguousMappingListEntry,
	libraryByTvdbId: ReadonlyMap<number, SonarrSeriesSnapshot>,
): SonarrAmbiguousMappingStatus {
	const targets = entry.result.targets.flatMap(
		(target): SonarrLibraryTarget[] => {
			if (target.provider !== "sonarr") return [];
			const libraryItem = libraryByTvdbId.get(Number(target.providerId)) ?? null;
			return [
				{
					provider: "sonarr",
					providerId: target.providerId,
					...(target.season === undefined ? {} : { season: target.season }),
					isInLibrary: libraryItem !== null,
					libraryItem,
				},
			];
		},
	);
	const existingTargets = targets.filter((target) => target.isInLibrary);

	return {
		...entry,
		targets,
		existingTargets,
		activeTarget: getOnlyExistingTarget(existingTargets),
	};
}

function composeRadarrAmbiguousEntry(
	entry: AmbiguousMappingListEntry,
	libraryByTmdbId: ReadonlyMap<number, RadarrMovieSnapshot>,
): RadarrAmbiguousMappingStatus {
	const targets = entry.result.targets.flatMap(
		(target): RadarrLibraryTarget[] => {
			if (target.provider !== "radarr") return [];
			const libraryItem = libraryByTmdbId.get(Number(target.providerId)) ?? null;
			return [
				{
					provider: "radarr",
					providerId: target.providerId,
					isInLibrary: libraryItem !== null,
					libraryItem,
				},
			];
		},
	);
	const existingTargets = targets.filter((target) => target.isInLibrary);

	return {
		...entry,
		targets,
		existingTargets,
		activeTarget: getOnlyExistingTarget(existingTargets),
	};
}

function getOnlyExistingTarget<T>(targets: readonly T[]): T | null {
	return targets.length === 1 ? (targets[0] ?? null) : null;
}
