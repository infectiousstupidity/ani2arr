/** Sonarr-backed library cache and status lookup logic for series records. */
// src/providers/library/sonarr-library.ts

import type { AniListId } from "@/anilist";
import {
	SonarrLibrary as SonarrSeriesLibrary,
	toSonarrSeriesSnapshot,
} from "@/providers/sonarr/library";
import type {
	SonarrSeries as NewSonarrSeries,
	SonarrLookupSeries as NewSonarrLookupSeries,
	SonarrSeriesSnapshot as NewSonarrSeriesSnapshot,
} from "@/providers/sonarr/types";
import { logError, normalizeError } from "@/shared/errors";
import {
	getExtensionOptionsSnapshot,
	getProviderCredentials,
	hasConfiguredProviderCredentials,
	type ExtensionOptions,
} from "@/options";
import type {
	ProviderCredentials,
	SonarrLookupSeries,
	SonarrSeries,
	SonarrSeriesSnapshot,
	TvdbId,
} from "@/providers";
import { notifyLibraryMutation } from "./notify-library-mutation";
import type {
	LibraryMutationEmitter,
	SonarrLibraryStatus,
} from "./types";

type SonarrLibraryMutationPayload = {
	tvdbId: TvdbId;
	action: "added" | "removed";
};

type SonarrLibraryDeps = {
	seriesLibrary: SonarrSeriesLibrary;
	lookupSeries: (
		term: string,
		credentials: ProviderCredentials,
	) => Promise<NewSonarrLookupSeries[]>;
	emitLibraryMutation?: LibraryMutationEmitter<SonarrLibraryMutationPayload>;
};

export class SonarrLibrary {
	private readonly seriesLibrary: SonarrSeriesLibrary;
	private readonly lookupSeries: SonarrLibraryDeps["lookupSeries"];
	private readonly emitLibraryMutation:
		| LibraryMutationEmitter<SonarrLibraryMutationPayload>
		| undefined;

	constructor(deps: SonarrLibraryDeps) {
		this.seriesLibrary = deps.seriesLibrary;
		this.lookupSeries = deps.lookupSeries;
		this.emitLibraryMutation = deps.emitLibraryMutation;
	}

	async getLeanSeriesList(): Promise<SonarrSeriesSnapshot[]> {
		const options = await getExtensionOptionsSnapshot();
		const credentials = getProviderCredentials(options, "sonarr");
		if (!credentials) {
			await this.seriesLibrary.clearSeriesSnapshotCache();
			return [];
		}

		const snapshots = await this.seriesLibrary.getSeriesSnapshots(credentials);
		return snapshots.map((element) => toLegacySeriesSnapshot(element));
	}

	async refreshCache(
		optionsOverride?: ExtensionOptions,
	): Promise<SonarrSeriesSnapshot[]> {
		const options = optionsOverride ?? (await getExtensionOptionsSnapshot());
		const credentials = getProviderCredentials(options, "sonarr");

		if (!credentials) {
			await this.seriesLibrary.clearSeriesSnapshotCache();
			return [];
		}

		const snapshots =
			await this.seriesLibrary.refreshSeriesSnapshots(credentials);
		return snapshots.map((element) => toLegacySeriesSnapshot(element));
	}

	async addSeriesToCache(newSeries: SonarrSeries): Promise<void> {
		await this.seriesLibrary.upsertSeriesSnapshot(
			legacySeriesToSnapshot(newSeries),
		);
	}

	async removeSeriesFromCache(tvdbId: TvdbId): Promise<void> {
		await this.seriesLibrary.removeSeriesSnapshot(tvdbId);
	}

	async getSeriesLibraryStatus(input: {
		anilistId: AniListId;
		providerId: TvdbId;
		forceVerify?: boolean;
	}): Promise<SonarrLibraryStatus> {
		const leanList = await this.getLeanSeriesList();
		const sonarrOptions = await getExtensionOptionsSnapshot();
		const isConfigured = hasConfiguredProviderCredentials(
			sonarrOptions,
			"sonarr",
		);
		const tvdbId = input.providerId;
		const cachedSeries =
			leanList.find((series) => series.tvdbId === tvdbId) ?? null;
		const existsInCache = cachedSeries !== null;

		if (!isConfigured || input.forceVerify !== true) {
			return {
				anilistId: input.anilistId,
				provider: "sonarr",
				providerId: tvdbId,
				isInLibrary: existsInCache,
				...(cachedSeries ? { series: cachedSeries } : {}),
			};
		}

		const credentials = getProviderCredentials(sonarrOptions, "sonarr")!;
		let liveSeries: NewSonarrSeries | null = null;
		try {
			liveSeries = await this.seriesLibrary.findSeriesByTvdbId(
				tvdbId,
				credentials,
			);
		} catch (error) {
			logError(
				normalizeError(error),
				`SonarrLibrary:getSeriesLibraryStatus:library:${tvdbId}`,
			);
			return {
				anilistId: input.anilistId,
				provider: "sonarr",
				providerId: tvdbId,
				isInLibrary: null,
				libraryUnknownReason: "library-check-failed",
			};
		}

		if (liveSeries) {
			let cacheMutated = false;
			if (!existsInCache) {
				await this.seriesLibrary.upsertSeriesSnapshot(
					toSonarrSeriesSnapshot(liveSeries),
				);
				cacheMutated = true;
			}

			if (cacheMutated) {
				await notifyLibraryMutation(
					"SonarrLibrary:notifyLibraryMutation",
					this.emitLibraryMutation,
					{
						tvdbId,
						action: "added",
					},
				);
			}

			return {
				anilistId: input.anilistId,
				provider: "sonarr",
				providerId: tvdbId,
				isInLibrary: true,
				series: toLegacySeriesSnapshot(toSonarrSeriesSnapshot(liveSeries)),
			};
		}

		let lookupSeries: SonarrLookupSeries | null = null;
		try {
			const hits = await this.lookupSeries(`tvdb:${tvdbId}`, credentials);
			const lookupHit = hits.find((hit) => hit.tvdbId === tvdbId) ?? null;
			lookupSeries = lookupHit ? toLegacyLookupSeries(lookupHit) : null;
		} catch (error) {
			logError(
				normalizeError(error),
				`SonarrLibrary:getSeriesLibraryStatus:lookup:${tvdbId}`,
			);
		}

		if (existsInCache) {
			await this.removeSeriesFromCache(tvdbId);
			await notifyLibraryMutation(
				"SonarrLibrary:notifyLibraryMutation",
				this.emitLibraryMutation,
				{
					tvdbId,
					action: "removed",
				},
			);
		}

		return {
			anilistId: input.anilistId,
			provider: "sonarr",
			providerId: tvdbId,
			isInLibrary: false,
			...(lookupSeries ? { series: lookupSeries } : {}),
		};
	}
}

function toLegacySeriesSnapshot(
	series: NewSonarrSeriesSnapshot,
): SonarrSeriesSnapshot {
	const statistics = series.statistics
		? {
				...(series.statistics.episodeCount === undefined
					? {}
					: { episodeCount: series.statistics.episodeCount }),
				...(series.statistics.episodeFileCount === undefined
					? {}
					: { episodeFileCount: series.statistics.episodeFileCount }),
				...(series.statistics.totalEpisodeCount === undefined
					? {}
					: { totalEpisodeCount: series.statistics.totalEpisodeCount }),
			}
		: undefined;

	return {
		id: series.id,
		tvdbId: series.tvdbId,
		title: series.title,
		titleSlug: series.titleSlug,
		...(series.alternateTitles === undefined
			? {}
			: { alternateTitles: series.alternateTitles }),
		...(series.status === undefined ? {} : { status: series.status }),
		...(statistics === undefined ? {} : { statistics }),
	};
}

function toLegacyLookupSeries(series: NewSonarrLookupSeries): SonarrLookupSeries {
	const images = series.images?.map((image) => ({
		...(image.coverType === undefined ? {} : { coverType: image.coverType }),
		...(image.url === undefined ? {} : { url: image.url }),
		...(image.remoteUrl === undefined ? {} : { remoteUrl: image.remoteUrl }),
	}));
	const statistics = series.statistics
		? {
				...(series.statistics.seasonCount === undefined
					? {}
					: { seasonCount: series.statistics.seasonCount }),
				...(series.statistics.episodeCount === undefined
					? {}
					: { episodeCount: series.statistics.episodeCount }),
				...(series.statistics.episodeFileCount === undefined
					? {}
					: { episodeFileCount: series.statistics.episodeFileCount }),
				...(series.statistics.totalEpisodeCount === undefined
					? {}
					: { totalEpisodeCount: series.statistics.totalEpisodeCount }),
			}
		: undefined;

	return {
		...(series.id === undefined ? {} : { id: series.id }),
		title: series.title,
		tvdbId: series.tvdbId,
		...(series.titleSlug === undefined ? {} : { titleSlug: series.titleSlug }),
		...(series.year === undefined ? {} : { year: series.year }),
		...(series.genres === undefined ? {} : { genres: series.genres }),
		...(series.network === undefined ? {} : { network: series.network }),
		...(series.seriesType === undefined
			? {}
			: { seriesType: series.seriesType }),
		...(series.status === undefined ? {} : { status: series.status }),
		...(images === undefined ? {} : { images }),
		...(series.remotePoster === undefined
			? {}
			: { remotePoster: series.remotePoster }),
		...(statistics === undefined ? {} : { statistics }),
	};
}

function legacySeriesToSnapshot(series: SonarrSeries): SonarrSeriesSnapshot {
	const alternateTitles = series.alternateTitles
		?.map((entry) => entry.title?.trim())
		.filter((title): title is string => !!title);

	return toLegacySeriesSnapshot({
		id: series.id,
		tvdbId: series.tvdbId,
		title: series.title,
		titleSlug: series.titleSlug,
		...(alternateTitles === undefined ? {} : { alternateTitles }),
		...(series.status === undefined ? {} : { status: series.status }),
		...(series.statistics === undefined
			? {}
			: { statistics: series.statistics }),
	});
}
