// src/features/media-modal/hooks/sonarr/use-sonarr-modal-read-data.ts

import { useMemo } from "react";
import type { AniListId } from "@/anilist";
import {
	mergeMetadataHints,
	metadataFromMediaObject,
	metadataHintFromAniListMetadata,
} from "@/anilist/metadata-hints";
import { resolveTitlePreference } from "@/anilist/title-preference";
import { defaultSonarrFormState, usePublicOptions } from "@/options";
import type { CheckSeriesStatusResponse } from "@/rpc/types";
import { useSeriesStatus, useSonarrFormOptions } from "@/queries/sonarr";
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
	type SonarrLaunchSnapshot,
} from "../../launch-snapshot";

const OPTIMISTIC_MAPPING_STATUS_FLAG = "__ani2arrOptimisticMappingStatus";

type OptimisticMappingStatus = {
	[OPTIMISTIC_MAPPING_STATUS_FLAG]?: true;
};

function isOptimisticMappingStatus(
	status: CheckSeriesStatusResponse | null | undefined,
): boolean {
	return (
		(status as OptimisticMappingStatus | null | undefined)?.[
			OPTIMISTIC_MAPPING_STATUS_FLAG
		] === true
	);
}

function createFallbackLaunchSnapshot(
	status: CheckSeriesStatusResponse | null,
): SonarrLaunchSnapshot {
	return createLaunchSnapshot({
		provider: "sonarr",
		status,
		source: "unknown",
		verifiedAt: null,
	});
}

export function useSonarrModalReadData(input: {
	anilistId: AniListId;
	launchStatus?: CheckSeriesStatusResponse | null;
	launchSnapshot?: SonarrLaunchSnapshot | null;
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
			options?.providers.sonarr.preferredAniListTitleLanguage ?? "english";
		const resolvedTitle = resolveTitlePreference({
			titles,
			preferred: preferredLang,
			fallback,
		});

		return {
			resolvedMetadata: resolved,
			providerRequestTitle: resolvedTitle.primary,
			fallbackTitle: fallback,
			baseUrl: getProviderBaseUrl("sonarr", options),
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

	const isConfigured = options?.providers.sonarr.isConfigured === true;
	const sonarrFormOptions = useSonarrFormOptions({ enabled: isConfigured });

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

	const sonarrStatus = useSeriesStatus(statusPayload, {
		enabled: isConfigured,
		force_verify: shouldForceVerify,
	});

	const hasUsableVerifiedStatus =
		sonarrStatus.isFetchedAfterMount ||
		isOptimisticMappingStatus(sonarrStatus.data);
	const verificationSettled =
		!shouldForceVerify || hasUsableVerifiedStatus || sonarrStatus.isError;
	const verifiedStatus = hasUsableVerifiedStatus
		? (sonarrStatus.data ?? null)
		: null;
	const providerStatus = verifiedStatus ?? effectiveLaunchSnapshot.status;

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

	return useMemo(() => {
		const storedDefaults =
			options?.providers.sonarr.defaults ?? defaultSonarrFormState();
		const verificationFailed =
			shouldForceVerify &&
			verificationSettled &&
			(sonarrStatus.isError || verifiedStatus?.isInLibrary === null);

		return {
			provider: "sonarr" as const,
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
			providerFormOptions: sonarrFormOptions.data ?? null,
		};
	}, [
		options?.providers.sonarr.defaults,
		verificationSettled,
		shouldForceVerify,
		sonarrStatus.isError,
		verifiedStatus?.isInLibrary,
		anilistId,
		baseUrl,
		isConfigured,
		launchTitle,
		anilistMedia,
		providerRequestTitle,
		resolvedMetadata,
		format,
		providerStatus,
		currentMapping,
		fallbackTitle,
		sonarrFormOptions.data,
	]);
}
