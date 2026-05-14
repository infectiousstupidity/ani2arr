/** Builds Sonarr modal read-side data from options, AniList metadata, and status queries. */
// src/features/media-modal/hooks/sonarr/use-sonarr-modal-read-data.ts

import { useMemo } from "react";
import type { AniListId } from "@/anilist";
import {
	mergeMetadataHints,
	metadataFromMediaObject,
	metadataHintFromAniListMetadata,
} from "@/anilist/metadata-hints";
import { resolveTitlePreference } from "@/anilist/title-preference";
import { defaultSonarrFormState } from "@/settings";
import { useSeriesStatus, useSonarrFormOptions } from "@/queries/sonarr";
import { usePublicOptions } from "@/queries/options";
import {
	useAniListMedia,
	useAniListMetadataBatch,
	useProviderBaseUrl,
} from "@/queries";
import * as manualMappingHelpers from "@/features/media-modal/mapping-search/current-mapping";
import {
	buildAniListHeaderData,
	extractTitles,
	getMediaFormat,
	pickString,
} from "../../media-modal-data";
import type { MediaModalMetadataHint } from "../../types";

export function useSonarrModalReadData(input: {
	anilistId: AniListId;
	metadataHint?: MediaModalMetadataHint | null;
}) {
	const { anilistId, metadataHint = null } = input;
	const { data: options } = usePublicOptions();
	const isConfigured = options?.providers.sonarr.isConfigured === true;
	const providerBaseUrl = useProviderBaseUrl("sonarr", {
		enabled: isConfigured,
	});

	const metadataBatch = useAniListMetadataBatch([anilistId], { enabled: true });
	const { data: anilistMedia } = useAniListMedia(anilistId, {
		enabled: true,
		forceRefresh: false,
	});

	const {
		resolvedMetadata,
		providerRequestTitle,
		fallbackTitle,
		baseUrl,
		format,
	} = useMemo(() => {
		const rawMetadata = metadataBatch.data?.metadata?.[0];
		const canonical = metadataHintFromAniListMetadata(rawMetadata ?? null);
		const mediaMeta = metadataFromMediaObject(anilistMedia ?? null);
		const resolved = mergeMetadataHints(canonical, mediaMeta);

		const titles = extractTitles({ anilistMedia, resolvedMetadata: resolved });
		const fmt =
			getMediaFormat({
				canonicalMetadata: canonical,
				anilistMedia,
				resolvedMetadata: resolved,
			}) ??
			metadataHint?.format ??
			null;

		const fallback =
			pickString(
				titles.english,
				titles.romaji,
				titles.native,
				metadataHint?.title,
			) ??
			`AniList #${anilistId}`;
		const preferredLang =
			options?.ui.preferredAniListTitleLanguage ?? "english";
		const resolvedTitle = resolveTitlePreference({
			titles,
			preferred: preferredLang,
			fallback,
		});

		return {
			resolvedMetadata: resolved,
			providerRequestTitle: resolvedTitle.primary,
			fallbackTitle: fallback,
			baseUrl: providerBaseUrl.data ?? "",
			format: fmt,
		};
	}, [
		anilistId,
		anilistMedia,
		metadataHint?.format,
		metadataHint?.title,
		metadataBatch.data,
		options,
		providerBaseUrl.data,
	]);

	const sonarrFormOptions = useSonarrFormOptions({ enabled: isConfigured });

	const statusPayload = useMemo(
		() => ({
			anilistId,
			title: fallbackTitle,
			metadata: resolvedMetadata,
		}),
		[anilistId, fallbackTitle, resolvedMetadata],
	);

	const sonarrStatus = useSeriesStatus(statusPayload, {
		enabled: isConfigured,
		force_verify: true,
	});

	const hasUsableVerifiedStatus = sonarrStatus.isFetchedAfterMount;
	const verificationSettled = hasUsableVerifiedStatus || sonarrStatus.isError;
	const verifiedStatus = hasUsableVerifiedStatus
		? (sonarrStatus.data ?? null)
		: null;
	const providerStatus = verifiedStatus;

	const currentMapping = useMemo(
		() =>
			manualMappingHelpers.deriveCurrentMapping({
				provider: "sonarr",
				status: providerStatus,
				baseUrl,
				fallbackTitle: providerRequestTitle,
			}),
		[providerStatus, baseUrl, providerRequestTitle],
	);
	const anilistHeaderData = useMemo(
		() =>
			buildAniListHeaderData({
				title:
					pickString(
						anilistMedia?.title?.english,
						anilistMedia?.title?.romaji,
						anilistMedia?.title?.native,
						resolvedMetadata?.titles?.english,
						resolvedMetadata?.titles?.romaji,
						resolvedMetadata?.titles?.native,
						metadataHint?.title,
					) ?? providerRequestTitle,
				anilistMedia,
				resolvedMetadata,
				format,
				coverImageHint: metadataHint?.coverImage ?? null,
			}),
		[
			anilistMedia,
			format,
			metadataHint?.coverImage,
			metadataHint?.title,
			providerRequestTitle,
			resolvedMetadata,
		],
	);

	return useMemo(() => {
		const storedDefaults =
			options?.providers.sonarr.defaults ?? defaultSonarrFormState();
		const verificationFailed =
			verificationSettled &&
			(sonarrStatus.isError || verifiedStatus?.isInLibrary === null);

		return {
			provider: "sonarr" as const,
			anilistId,
			baseUrl,
			isConfigured,
			anilistHeaderData,
			manualMappingActive: providerStatus?.manualMappingActive === true,
			currentMapping,
			resolvedMetadata,
			providerRequestTitle,
			...(fallbackTitle === providerRequestTitle
				? {}
				: { fallbackLookupTitle: fallbackTitle }),
			rawProviderStatus: providerStatus,
			verificationSettled,
			verificationFailed,
			storedDefaults,
			providerFormOptions: sonarrFormOptions.data ?? null,
		};
	}, [
		options?.providers.sonarr.defaults,
		verificationSettled,
		sonarrStatus.isError,
		verifiedStatus?.isInLibrary,
		anilistId,
		anilistHeaderData,
		baseUrl,
		isConfigured,
		providerRequestTitle,
		resolvedMetadata,
		providerStatus,
		currentMapping,
		fallbackTitle,
		sonarrFormOptions.data,
	]);
}
