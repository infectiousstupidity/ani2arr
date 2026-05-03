// src/features/media-modal/hooks/radarr/use-radarr-modal-read-data.ts

import { useMemo } from "react";
import type { AniListId } from "@/anilist";
import {
	mergeMetadataHints,
	metadataFromMediaObject,
	metadataHintFromAniListMetadata,
} from "@/anilist/metadata-hints";
import { resolveTitlePreference } from "@/anilist/title-preference";
import { defaultRadarrFormState, usePublicOptions } from "@/options";
import type { CheckMovieStatusResponse } from "@/rpc/types";
import {
	useMovieStatus,
	useRadarrMetadata,
} from "@/providers/hooks/radarr.queries";
import { getProviderBaseUrl } from "@/options/provider-config";
import { useAniListMedia, useAniListMetadataBatch } from "@/shared/queries";
import * as manualMappingHelpers from "@/features/media-modal/mapping-search/current-mapping";
import {
	buildAniListHeaderData,
	extractTitles,
	getMediaFormat,
	pickString,
} from "../../media-modal-data";
import {
	createLaunchSnapshot,
	shouldForceVerifyOnModalOpen,
	type RadarrLaunchSnapshot,
} from "../../launch-snapshot";

const OPTIMISTIC_MAPPING_STATUS_FLAG = "__ani2arrOptimisticMappingStatus";

type OptimisticMappingStatus = {
	[OPTIMISTIC_MAPPING_STATUS_FLAG]?: true;
};

function isOptimisticMappingStatus(
	status: CheckMovieStatusResponse | null | undefined,
): boolean {
	return (
		(status as OptimisticMappingStatus | null | undefined)?.[
			OPTIMISTIC_MAPPING_STATUS_FLAG
		] === true
	);
}

function createFallbackLaunchSnapshot(
	status: CheckMovieStatusResponse | null,
): RadarrLaunchSnapshot {
	return createLaunchSnapshot({
		provider: "radarr",
		status,
		source: "unknown",
		verifiedAt: null,
	});
}

export function useRadarrModalReadData(input: {
	anilistId: AniListId;
	launchStatus?: CheckMovieStatusResponse | null;
	launchSnapshot?: RadarrLaunchSnapshot | null;
	launchTitle?: string;
	launchMetadata?: ReturnType<typeof metadataFromMediaObject>;
}) {
	const {
		anilistId,
		launchStatus = null,
		launchSnapshot = null,
		launchTitle,
		launchMetadata = null,
	} = input;
	const { data: options } = usePublicOptions();

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
		const resolved = mergeMetadataHints(
			mergeMetadataHints(canonical, launchMetadata),
			mediaMeta,
		);

		const titles = extractTitles({ anilistMedia, resolvedMetadata: resolved });
		const fmt = getMediaFormat({
			canonicalMetadata: canonical,
			anilistMedia,
			resolvedMetadata: resolved,
		});

		const fallback =
			pickString(launchTitle, titles.english, titles.romaji, titles.native) ??
			`AniList #${anilistId}`;
		const preferredLang =
			options?.providers.radarr.preferredAniListTitleLanguage ?? "english";
		const resolvedTitle = resolveTitlePreference({
			titles,
			preferred: preferredLang,
			fallback,
		});

		return {
			resolvedMetadata: resolved,
			providerRequestTitle: resolvedTitle.primary,
			fallbackTitle: fallback,
			baseUrl: getProviderBaseUrl("radarr", options),
			format: fmt,
		};
	}, [
		anilistId,
		anilistMedia,
		launchMetadata,
		launchTitle,
		metadataBatch.data,
		options,
	]);

	const isConfigured = options?.providers.radarr.isConfigured === true;
	const radarrMetadata = useRadarrMetadata({ enabled: isConfigured });

	const statusPayload = useMemo(
		() => ({
			anilistId,
			title: fallbackTitle,
			metadata: resolvedMetadata,
		}),
		[anilistId, fallbackTitle, resolvedMetadata],
	);

	const effectiveLaunchSnapshot = useMemo(
		() => launchSnapshot ?? createFallbackLaunchSnapshot(launchStatus),
		[launchSnapshot, launchStatus],
	);
	const shouldForceVerify = shouldForceVerifyOnModalOpen(
		effectiveLaunchSnapshot,
	);

	const radarrStatus = useMovieStatus(statusPayload, {
		enabled: isConfigured,
		force_verify: shouldForceVerify,
	});

	const hasUsableVerifiedStatus =
		radarrStatus.isFetchedAfterMount ||
		isOptimisticMappingStatus(radarrStatus.data);
	const verificationSettled =
		!shouldForceVerify || hasUsableVerifiedStatus || radarrStatus.isError;
	const verifiedStatus = hasUsableVerifiedStatus
		? (radarrStatus.data ?? null)
		: null;
	const providerStatus = verifiedStatus ?? effectiveLaunchSnapshot.status;

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

	return useMemo(() => {
		const storedDefaults =
			options?.providers.radarr.defaults ?? defaultRadarrFormState();
		const verificationFailed =
			shouldForceVerify &&
			verificationSettled &&
			(radarrStatus.isError || verifiedStatus?.isInLibrary === null);

		return {
			provider: "radarr" as const,
			anilistId,
			baseUrl,
			isConfigured,
			anilistHeaderData: buildAniListHeaderData({
				title:
					pickString(
						launchTitle,
						anilistMedia?.title?.english,
						anilistMedia?.title?.romaji,
						anilistMedia?.title?.native,
					) ?? providerRequestTitle,
				anilistMedia,
				resolvedMetadata,
				format,
			}),
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
			providerMetadata: radarrMetadata.data ?? null,
		};
	}, [
		anilistId,
		anilistMedia,
		baseUrl,
		currentMapping,
		providerStatus,
		fallbackTitle,
		format,
		isConfigured,
		launchTitle,
		options?.providers.radarr.defaults,
		providerRequestTitle,
		radarrMetadata.data,
		shouldForceVerify,
		radarrStatus.isError,
		resolvedMetadata,
		verificationSettled,
		verifiedStatus?.isInLibrary,
	]);
}
