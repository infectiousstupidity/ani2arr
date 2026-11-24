/** Browse-card overlay selector for provider-specific card actions. */
// src/content/browse/browse-card-overlay.tsx

import { SlidersHorizontal } from "lucide-react";
import type React from "react";
import type { ReactNode } from "react";
import type { metadataHintFromAniListMetadata } from "@/anilist/title";
import type {
	MediaModalMetadataHint,
	MediaModalOpenState,
} from "@/features/media-modal/types";
import { getArrSetupLabel } from "@/features/media-action/labels";
import { CardStackButton } from "@/features/media-overlay/card-overlay";
import { RadarrCardOverlay } from "@/features/media-overlay/radarr-card-overlay";
import {
	SeerrCardStackActions,
	SeerrStandaloneCardOverlay,
} from "@/features/media-overlay/seerr-card-overlay";
import { SonarrCardOverlay } from "@/features/media-overlay/sonarr-card-overlay";
import type { SourceIdentity } from "@/mapping/source-identity";
import type { Provider } from "@/providers/types";
import { openOptionsPage } from "@/rpc/runtime-messages";
import type { MappingIdentity } from "@/rpc/types";
import type { BrowseCardPrimaryStatus, PublicOptions } from "@/settings/types";
import { resolveBrowseCardRoute } from "./browse-card-provider";
import type { BrowseAdapter, HostMediaTarget } from "./types";

type MetadataHint = ReturnType<typeof metadataHintFromAniListMetadata>;

export interface BrowseCardOverlayProps {
	parsed: HostMediaTarget;
	adapter: BrowseAdapter;
	publicOptions: PublicOptions | undefined;
	mappedIdentities: readonly MappingIdentity[];
	metadata: MetadataHint;
	/** The card's mapping identities are still loading, so its route may change. */
	routePending: boolean;
	onOpenMediaModal(input: MediaModalOpenState): void;
	tooltipContainer: HTMLElement | ShadowRoot | null;
}

function getDisplayTitle(input: {
	metadata: MetadataHint;
	parsedTitle: string;
}): string {
	const titles = input.metadata?.titles;
	return (
		titles?.english?.trim() ||
		titles?.romaji?.trim() ||
		titles?.native?.trim() ||
		input.parsedTitle
	);
}

function getModalMetadataHint(input: {
	title: string;
	parsedFormat: HostMediaTarget["format"] | undefined;
	parsedCoverImage: HostMediaTarget["coverImage"];
	metadata: MetadataHint;
}): MediaModalMetadataHint {
	return {
		title: input.title,
		format: input.parsedFormat ?? input.metadata?.format ?? null,
		coverImage:
			input.metadata?.coverImage ?? input.parsedCoverImage ?? null,
	};
}

function getPrimaryStatus(
	publicOptions: PublicOptions | undefined,
): BrowseCardPrimaryStatus {
	return publicOptions?.ui?.browseCards.primaryStatus ?? "arr";
}

function getEffectivePrimaryStatus(input: {
	preferred: BrowseCardPrimaryStatus;
	arrEnabled: boolean;
	arrConfigured: boolean;
	seerrEnabled: boolean;
	seerrConfigured: boolean;
}): BrowseCardPrimaryStatus | null {
	const arrReady = input.arrEnabled && input.arrConfigured;
	const seerrReady = input.seerrEnabled && input.seerrConfigured;

	if (arrReady !== seerrReady) {
		return arrReady ? "arr" : "seerr";
	}

	if (input.preferred === "arr" && input.arrEnabled) return "arr";
	if (input.preferred === "seerr" && input.seerrEnabled) return "seerr";

	if (input.arrEnabled) return "arr";
	if (input.seerrEnabled) return "seerr";

	return null;
}

function getActiveArrProvider(
	provider: string | null,
	sonarrEnabled: boolean,
	radarrEnabled: boolean,
): Provider | "none" {
	if (provider === "sonarr" && sonarrEnabled) return "sonarr";
	if (provider === "radarr" && radarrEnabled) return "radarr";
	return "none";
}

function getBrowseRouteState(input: {
	provider: Provider | null;
	seerrMediaType: "movie" | "tv" | null;
	sonarrEnabled: boolean;
	radarrEnabled: boolean;
	seerrEnabled: boolean;
}) {
	return {
		activeArr: getActiveArrProvider(
			input.provider,
			input.sonarrEnabled,
			input.radarrEnabled,
		),
		seerrEnabled: input.seerrEnabled && input.seerrMediaType !== null,
	};
}

function getSonarrOverlayOptions(publicOptions: PublicOptions | undefined) {
	const browseOptions = publicOptions?.ui?.browseCards.sonarr;
	return {
		enabled: browseOptions?.enabled ?? true,
		visibility: browseOptions?.visibility ?? "always",
		isConfigured: publicOptions?.providers.sonarr.isConfigured === true,
		defaultForm: publicOptions?.providers.sonarr.defaults ?? null,
	};
}

function getRadarrOverlayOptions(publicOptions: PublicOptions | undefined) {
	const browseOptions = publicOptions?.ui?.browseCards.radarr;
	return {
		enabled: browseOptions?.enabled ?? true,
		visibility: browseOptions?.visibility ?? "always",
		isConfigured: publicOptions?.providers.radarr.isConfigured === true,
		defaultForm: publicOptions?.providers.radarr.defaults ?? null,
	};
}

function getSeerrOverlayOptions(publicOptions: PublicOptions | undefined) {
	const browseOptions = publicOptions?.ui?.browseCards.seerr;
	return {
		enabled: browseOptions?.enabled ?? true,
		visibility: browseOptions?.visibility ?? "always",
		isConfigured: publicOptions?.seerr.isConfigured === true,
	};
}

function getProviderStackAction(input: {
	isConfigured: boolean;
	providerLabel: string;
	onOpen(): void;
	onConfigure(): void;
}): ReactNode {
	return (
		<CardStackButton
			label={
				input.isConfigured
					? getArrSetupLabel(input.providerLabel)
					: `Configure ${input.providerLabel}…`
			}
			modifier="advanced"
			icon={<SlidersHorizontal aria-hidden="true" className="h-4 w-4" />}
			onClick={input.isConfigured ? input.onOpen : input.onConfigure}
		/>
	);
}

function openProviderModal(input: {
	onOpenMediaModal(input: MediaModalOpenState): void;
	source: SourceIdentity;
	provider: Provider;
	initialView: "setup" | "mapping";
	metadataHint: MediaModalMetadataHint;
}): void {
	input.onOpenMediaModal({
		source: input.source,
		kind: "provider",
		provider: input.provider,
		initialView: input.initialView,
		openSource: "content",
		metadataHint: input.metadataHint,
	});
}

function openSeerrModal(input: {
	onOpenMediaModal(input: MediaModalOpenState): void;
	source: SourceIdentity;
	mediaType: "movie" | "tv";
	metadataHint: MediaModalMetadataHint;
}): void {
	input.onOpenMediaModal({
		source: input.source,
		kind: "seerr",
		mediaType: input.mediaType,
		openSource: "content",
		metadataHint: input.metadataHint,
	});
}

export function BrowseCardOverlay({
	parsed,
	adapter,
	publicOptions,
	mappedIdentities,
	metadata,
	routePending,
	onOpenMediaModal,
	tooltipContainer,
}: BrowseCardOverlayProps): React.ReactElement | null {
	const route = resolveBrowseCardRoute({
		parsed,
		metadata,
		mappedIdentities,
	});
	const rawProvider = route?.provider ?? null;

	const sonarrOpts = getSonarrOverlayOptions(publicOptions);
	const radarrOpts = getRadarrOverlayOptions(publicOptions);
	const seerrOpts = getSeerrOverlayOptions(publicOptions);

	const seerrMediaType = route?.seerrMediaType ?? null;
	const { activeArr, seerrEnabled } = getBrowseRouteState({
		provider: rawProvider,
		seerrMediaType,
		sonarrEnabled: sonarrOpts.enabled,
		radarrEnabled: radarrOpts.enabled,
		seerrEnabled: seerrOpts.enabled,
	});

	if (activeArr === "none" && !seerrEnabled) return null;

	let arrConfigured = false;
	if (activeArr === "sonarr") arrConfigured = sonarrOpts.isConfigured;
	else if (activeArr === "radarr") arrConfigured = radarrOpts.isConfigured;

	const effectivePrimaryStatus = getEffectivePrimaryStatus({
		preferred: getPrimaryStatus(publicOptions),
		arrEnabled: activeArr !== "none",
		arrConfigured,
		seerrEnabled,
		seerrConfigured: seerrOpts.isConfigured,
	});

	const displayTitle = getDisplayTitle({
		metadata,
		parsedTitle: parsed.title,
	});
	const metadataHint = getModalMetadataHint({
		title: displayTitle,
		parsedFormat: parsed.format,
		parsedCoverImage: parsed.coverImage,
		metadata,
	});
	const openArrModal = (
		provider: Provider,
		initialView: "setup" | "mapping",
	): void => {
		openProviderModal({
			onOpenMediaModal,
			source: parsed.source,
			provider,
			initialView,
			metadataHint,
		});
	};

	const handleOpenSeerrModal = (): void => {
		if (seerrMediaType === null) return;
		openSeerrModal({
			onOpenMediaModal,
			source: parsed.source,
			mediaType: seerrMediaType,
			metadataHint,
		});
	};

	let arrStackAction: ReactNode = null;

	if (activeArr === "sonarr") {
		arrStackAction = getProviderStackAction({
			isConfigured: sonarrOpts.isConfigured,
			providerLabel: "Sonarr",
			onOpen: () => openArrModal("sonarr", "setup"),
			onConfigure: () => openOptionsPage({ sectionId: "sonarr" }),
		});
	} else if (activeArr === "radarr") {
		arrStackAction = getProviderStackAction({
			isConfigured: radarrOpts.isConfigured,
			providerLabel: "Radarr",
			onOpen: () => openArrModal("radarr", "setup"),
			onConfigure: () => openOptionsPage({ sectionId: "radarr" }),
		});
	}

	const stackDirection = adapter.stackDirection ?? "up";

	const seerrStackActions: ReactNode = seerrEnabled ? (
		<SeerrCardStackActions
			source={parsed.source}
			title={displayTitle}
			metadata={metadata}
			mediaType={seerrMediaType}
			isConfigured={seerrOpts.isConfigured}
			observeTarget={parsed.mountTarget}
			tooltipContainer={tooltipContainer}
			onOpenModal={handleOpenSeerrModal}
			stackDirection={stackDirection}
			presentation={parsed.presentation}
			statusBlocked={routePending}
		/>
	) : null;

	const usesFloatingOverlay =
		parsed.presentation !== "status-column" &&
		parsed.presentation !== "action-row";

	const showSeerrMain =
		seerrEnabled &&
		(activeArr === "none" ||
			(usesFloatingOverlay && effectivePrimaryStatus === "seerr"));

	const commonProps = {
		source: parsed.source,
		title: displayTitle,
		metadata,
		observeTarget: parsed.mountTarget,
		stackDirection,
		tooltipContainer,
		presentation: parsed.presentation,
		statusBlocked: routePending,
	};

	if (showSeerrMain) {
		return (
			<SeerrStandaloneCardOverlay
				source={parsed.source}
				title={displayTitle}
				metadata={metadata}
				mediaType={seerrMediaType}
				isConfigured={seerrOpts.isConfigured}
				observeTarget={parsed.mountTarget}
				badgeVisibility={seerrOpts.visibility}
				stackDirection={stackDirection}
				tooltipContainer={tooltipContainer}
				onOpenModal={handleOpenSeerrModal}
				extraAction={arrStackAction}
				presentation={parsed.presentation}
				statusBlocked={routePending}
			/>
		);
	}

	if (activeArr === "sonarr") {
		return (
			<SonarrCardOverlay
				{...commonProps}
				onOpenSetup={() => openArrModal("sonarr", "setup")}
				onOpenMapping={() => openArrModal("sonarr", "mapping")}
				isConfigured={sonarrOpts.isConfigured}
				defaultForm={sonarrOpts.defaultForm}
				badgeVisibility={sonarrOpts.visibility}
				extraAction={seerrStackActions}
			/>
		);
	}

	if (activeArr === "radarr") {
		return (
			<RadarrCardOverlay
				{...commonProps}
				onOpenSetup={() => openArrModal("radarr", "setup")}
				onOpenMapping={() => openArrModal("radarr", "mapping")}
				isConfigured={radarrOpts.isConfigured}
				defaultForm={radarrOpts.defaultForm}
				badgeVisibility={radarrOpts.visibility}
				extraAction={seerrStackActions}
			/>
		);
	}

	return null;
}
