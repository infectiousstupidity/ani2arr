/** Builds Radarr modal read-side data from options, AniList metadata, and status queries. */
// src/features/media-modal/hooks/radarr/use-radarr-modal-read-data.ts

import { useMemo } from "react";
import type { AniListId } from "@/anilist";
import {
	mergeMetadataHints,
	metadataFromMediaObject,
	metadataHintFromAniListMetadata,
} from "@/anilist/metadata-hints";
import { resolveTitlePreference } from "@/anilist/title-preference";
import { defaultRadarrFormState } from "@/settings";
import { useMovieStatus, useRadarrFormOptions } from "@/queries/radarr";
import { useAniListMedia, useAniListMetadataBatch } from "@/queries/anilist";
import { useProviderBaseUrl } from "@/queries/provider-base-url";
import { usePublicOptions } from "@/queries/options";
import * as manualMappingHelpers from "@/features/media-modal/mapping-search/current-mapping";
import {
	buildAniListHeaderData,
	extractTitles,
	getMediaFormat,
	pickString,
} from "../../media-modal-data";
import type { MediaModalMetadataHint } from "../../types";

export function useRadarrModalReadData(input: {
	anilistId: AniListId;
	metadataHint?: MediaModalMetadataHint | null;
}) {
	const { anilistId, metadataHint = null } = input;
	const { data: options } = usePublicOptions();
	const isConfigured = options?.providers.radarr.isConfigured === true;
	const providerBaseUrl = useProviderBaseUrl("radarr", {
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

	const radarrFormOptions = useRadarrFormOptions({ enabled: isConfigured });

	const statusPayload = useMemo(
		() => ({
			anilistId,
			title: fallbackTitle,
			metadata: resolvedMetadata,
		}),
		[anilistId, fallbackTitle, resolvedMetadata],
	);

	const radarrStatus = useMovieStatus(statusPayload, {
		enabled: isConfigured,
		force_verify: true,
	});

	const hasUsableVerifiedStatus = radarrStatus.isFetchedAfterMount;
	const verificationSettled = hasUsableVerifiedStatus || radarrStatus.isError;
	const verifiedStatus = hasUsableVerifiedStatus
		? (radarrStatus.data ?? null)
		: null;
	const providerStatus = verifiedStatus;

	const currentMapping = useMemo(
		() =>
			manualMappingHelpers.deriveCurrentMapping({
				provider: "radarr",
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
			options?.providers.radarr.defaults ?? defaultRadarrFormState();
		const verificationFailed =
			verificationSettled &&
			(radarrStatus.isError || verifiedStatus?.isInLibrary === null);

		return {
			provider: "radarr" as const,
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
			providerFormOptions: radarrFormOptions.data ?? null,
		};
	}, [
		anilistId,
		anilistHeaderData,
		baseUrl,
		currentMapping,
		providerStatus,
		fallbackTitle,
		isConfigured,
		options?.providers.radarr.defaults,
		providerRequestTitle,
		radarrFormOptions.data,
		radarrStatus.isError,
		resolvedMetadata,
		verificationSettled,
		verifiedStatus?.isInLibrary,
	]);
}
