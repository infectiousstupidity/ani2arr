/** Sonarr media modal data and setup wiring; shared composition lives in ArrModalFrame. */
// src/features/media-modal/sonarr/sonarr-modal.tsx

import { useMemo } from "react";
import { sourceIdentityKey } from "@/mapping/source-identity";
import { getProviderRouteSlug } from "@/providers/provider-route-slug";
import { parseTvdbIdOrNull } from "@/providers/schemas";
import { createDefaultSonarrFormState as defaultSonarrFormState } from "@/providers/sonarr/form-state";
import { useSeriesStatus, useSonarrFormResources } from "@/queries/sonarr";
import type { GetSeriesStatusOutput } from "@/rpc/types";
import { ArrModalFrame } from "../arr-modal-frame";
import { pickProviderPoster } from "../helpers";
import { useContentPortalContainer } from "../hooks/use-content-portal-container";
import { useMediaModalBaseData } from "../hooks/use-media-modal-base-data";
import type { MediaModalTargetSummary, SonarrModalProps } from "../types";
import { SonarrMappingPanel } from "./sonarr-mapping-panel";
import { useSonarrSetupForm } from "./sonarr-setup-form";
import {
	canShowSonarrSetup,
	getSonarrSetupTarget,
} from "./sonarr-setup-values";

const PROVIDER = "sonarr" as const;
const SETUP_FORM_ID = "sonarr-setup-form";

type SonarrStatusSeries = NonNullable<GetSeriesStatusOutput["series"]>;

function getEpisodeCount(series: SonarrStatusSeries): number | undefined {
	return (
		series.statistics?.episodeCount ??
		series.statistics?.totalEpisodeCount ??
		("episodeCount" in series ? series.episodeCount : undefined)
	);
}

function getEpisodeFileCount(series: SonarrStatusSeries): number | undefined {
	return (
		series.statistics?.episodeFileCount ??
		("episodeFileCount" in series ? series.episodeFileCount : undefined)
	);
}

function getCurrentTargetDetails(input: {
	series: SonarrStatusSeries;
}): Partial<MediaModalTargetSummary> {
	const { series } = input;
	const episodeCount = getEpisodeCount(series);
	const episodeFileCount = getEpisodeFileCount(series);
	const providerRouteSlug = getProviderRouteSlug(PROVIDER, series) ?? undefined;
	const posterUrl = pickProviderPoster(series);
	const providerFolderName = "folder" in series ? series.folder : undefined;
	const year = "year" in series ? series.year : undefined;
	const typeLabel = "seriesType" in series ? series.seriesType : undefined;

	return {
		...(providerFolderName ? { providerFolderName } : {}),
		...(year === undefined ? {} : { year }),
		...(typeLabel ? { typeLabel } : {}),
		...(providerRouteSlug ? { providerRouteSlug } : {}),
		...(posterUrl ? { posterUrl } : {}),
		...(series.status ? { statusLabel: series.status } : {}),
		...(episodeCount === undefined ? {} : { episodeCount }),
		...(episodeFileCount === undefined ? {} : { episodeFileCount }),
		...("overview" in series && series.overview
			? { overview: series.overview }
			: {}),
	};
}

function getCurrentTarget(input: {
	status: GetSeriesStatusOutput | null;
}): MediaModalTargetSummary | null {
	const { status } = input;
	const series = status?.series;
	const tvdbId = parseTvdbIdOrNull(
		status?.mapping.kind === "mapped" ? status.mapping.providerId : undefined,
	);
	if (!series || tvdbId === null) return null;

	return {
		provider: PROVIDER,
		providerId: tvdbId,
		title: series.title,
		isInLibrary: status.isInLibrary === true,
		...getCurrentTargetDetails({
			series,
		}),
	};
}

export function SonarrModal({
	state,
	onClose,
	container,
}: SonarrModalProps): React.JSX.Element {
	const { source, metadataHint } = state;
	const contentContainer = useContentPortalContainer();
	const base = useMediaModalBaseData({
		source,
		metadataHint: metadataHint ?? null,
	});
	const isConfigured = base.options?.providers.sonarr.isConfigured === true;
	const formResources = useSonarrFormResources({ enabled: isConfigured });
	const statusPayload = useMemo(
		() => ({
			source,
			...(base.statusTitle === undefined ? {} : { title: base.statusTitle }),
			metadata: base.statusMetadata,
		}),
		[base.statusMetadata, base.statusTitle, source],
	);
	const status = useSeriesStatus(statusPayload, {
		enabled: isConfigured && base.statusReady,
		force_verify: true,
	});
	const verificationSettled = status.isFetchedAfterMount || status.isError;
	const rawStatus = status.data ?? null;
	const verificationFailed =
		verificationSettled && (status.isError || rawStatus?.isInLibrary === null);
	const identityKey = sourceIdentityKey(source);
	const storedDefaults =
		base.options?.providers.sonarr.defaults ?? defaultSonarrFormState();
	const setupTarget = useMemo(
		() =>
			getSonarrSetupTarget({
				identityKey,
				status: rawStatus,
				targetTitle: base.providerRequestTitle,
				storedDefaults,
			}),
		[identityKey, base.providerRequestTitle, rawStatus, storedDefaults],
	);
	const setupTargetLoading =
		isConfigured && setupTarget === null && !verificationSettled;
	const setupForm = useSonarrSetupForm({
		formId: SETUP_FORM_ID,
		source,
		target: setupTarget,
		providerPayloadTitle: base.providerPayloadTitle,
		fallbackLookupTitle: base.fallbackLookupTitle,
		resolvedMetadata: base.resolvedMetadata,
		isConfigured,
		formResources: formResources.data ?? null,
		portalContainer: contentContainer,
		targetLoading: setupTargetLoading,
		verificationFailed,
		verificationSettled,
		onClose,
	});

	return (
		<ArrModalFrame
			state={state}
			onClose={onClose}
			container={container}
			contentContainer={contentContainer}
			anilistHeaderData={base.anilistHeaderData}
			currentTarget={getCurrentTarget({ status: rawStatus })}
			manualMappingActive={
				rawStatus?.mapping.kind === "mapped" &&
				rawStatus.mapping.source === "manual"
			}
			verificationSettled={verificationSettled}
			canShowSetup={canShowSonarrSetup({ isConfigured, status: rawStatus })}
			setupTargetLoading={setupTargetLoading}
			setupFormId={SETUP_FORM_ID}
			setupForm={setupForm}
			MappingPanel={SonarrMappingPanel}
		/>
	);
}
