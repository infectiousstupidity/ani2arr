/** Radarr media modal data and setup wiring; shared composition lives in ArrModalFrame. */
// src/features/media-modal/radarr/radarr-modal.tsx

import { useMemo } from "react";
import { sourceIdentityKey } from "@/mapping/source-identity";
import { getProviderRouteSlug } from "@/providers/provider-route-slug";
import { createDefaultRadarrFormState as defaultRadarrFormState } from "@/providers/radarr/form-state";
import { parseTmdbIdOrNull } from "@/providers/schemas";
import { useMovieStatus, useRadarrFormResources } from "@/queries/radarr";
import type { GetMovieStatusOutput } from "@/rpc/types";
import { ArrModalFrame } from "../arr-modal-frame";
import { pickProviderPoster } from "../helpers";
import { useContentPortalContainer } from "../hooks/use-content-portal-container";
import { useMediaModalBaseData } from "../hooks/use-media-modal-base-data";
import type { MediaModalTargetSummary, RadarrModalProps } from "../types";
import { RadarrMappingPanel } from "./radarr-mapping-panel";
import { useRadarrSetupForm } from "./radarr-setup-form";
import {
	canShowRadarrSetup,
	getRadarrSetupTarget,
} from "./radarr-setup-values";

const PROVIDER = "radarr" as const;
const SETUP_FORM_ID = "radarr-setup-form";

function getCurrentTarget(input: {
	status: GetMovieStatusOutput | null;
}): MediaModalTargetSummary | null {
	const { status } = input;
	const movie = status?.movie;
	const tmdbId = parseTmdbIdOrNull(
		status?.mapping.kind === "mapped" ? status.mapping.providerId : undefined,
	);
	if (!movie || tmdbId === null) return null;

	const providerRouteSlug = getProviderRouteSlug(PROVIDER, movie) ?? undefined;
	const posterUrl = pickProviderPoster(movie);

	return {
		provider: PROVIDER,
		providerId: tmdbId,
		title: movie.title,
		isInLibrary: status.isInLibrary === true,
		typeLabel: "Movie",
		...(movie.folderName ? { providerFolderName: movie.folderName } : {}),
		...(movie.year === undefined ? {} : { year: movie.year }),
		...(providerRouteSlug ? { providerRouteSlug } : {}),
		...(posterUrl ? { posterUrl } : {}),
		...(movie.status ? { statusLabel: movie.status } : {}),
		...("overview" in movie && movie.overview
			? { overview: movie.overview }
			: {}),
		...("runtime" in movie && movie.runtime !== undefined
			? { runtimeMinutes: movie.runtime }
			: {}),
		...(movie.hasFile === undefined ? {} : { hasFile: movie.hasFile }),
	};
}

export function RadarrModal({
	state,
	onClose,
	container,
}: RadarrModalProps): React.JSX.Element {
	const { source, metadataHint } = state;
	const contentContainer = useContentPortalContainer();
	const base = useMediaModalBaseData({
		source,
		metadataHint: metadataHint ?? null,
	});
	const isConfigured = base.options?.providers.radarr.isConfigured === true;
	const formResources = useRadarrFormResources({ enabled: isConfigured });
	const statusPayload = useMemo(
		() => ({
			source,
			...(base.statusTitle === undefined ? {} : { title: base.statusTitle }),
			metadata: base.statusMetadata,
		}),
		[base.statusMetadata, base.statusTitle, source],
	);
	const status = useMovieStatus(statusPayload, {
		enabled: isConfigured && base.statusReady,
		force_verify: true,
	});
	const verificationSettled = status.isFetchedAfterMount || status.isError;
	const rawStatus = status.data ?? null;
	const verificationFailed =
		verificationSettled && (status.isError || rawStatus?.isInLibrary === null);
	const identityKey = sourceIdentityKey(source);
	const storedDefaults =
		base.options?.providers.radarr.defaults ?? defaultRadarrFormState();
	const setupTarget = useMemo(
		() =>
			getRadarrSetupTarget({
				identityKey,
				status: rawStatus,
				targetTitle: base.providerRequestTitle,
				storedDefaults,
			}),
		[identityKey, base.providerRequestTitle, rawStatus, storedDefaults],
	);
	const setupTargetLoading =
		isConfigured && setupTarget === null && !verificationSettled;
	const setupForm = useRadarrSetupForm({
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
			canShowSetup={canShowRadarrSetup({ isConfigured, status: rawStatus })}
			setupTargetLoading={setupTargetLoading}
			setupFormId={SETUP_FORM_ID}
			setupForm={setupForm}
			MappingPanel={RadarrMappingPanel}
		/>
	);
}
