/** Browse-card overlay selector for provider-specific card actions. */
// src/content/browse/browse-card-overlay.tsx

import { SlidersHorizontal } from "lucide-react";
import type React from "react";
import type {
	MouseEvent,
	ReactElement,
	ReactNode,
	SyntheticEvent,
} from "react";
import type { metadataHintFromAniListMetadata } from "@/anilist/title";
import type { AniListId } from "@/anilist/types";
import type {
	MediaModalMetadataHint,
	MediaModalOpenState,
} from "@/features/media-modal/types";
import { RadarrCardOverlay } from "@/features/media-overlay/radarr-card-overlay";
import {
	SeerrCardStackActions,
	SeerrStandaloneCardOverlay,
} from "@/features/media-overlay/seerr-card-overlay";
import { SonarrCardOverlay } from "@/features/media-overlay/sonarr-card-overlay";
import type { SourceIdentity } from "@/mapping/source-identity";
import { seerrMediaTypeFromAniListFormat } from "@/mapping/seerr-target";
import type { Provider } from "@/providers/types";
import { openOptionsPage } from "@/rpc/runtime-messages";
import type { MappingIdentity } from "@/rpc/types";
import type { BrowseCardPrimaryStatus, PublicOptions } from "@/settings/types";
import type { FloatingPortalContainer } from "@/shared/ui/portal-container";
import TooltipWrapper from "@/shared/ui/primitives/tooltip";
import { resolveBrowseCardProvider } from "./browse-card-provider";
import type { BrowseAdapter, HostMediaTarget } from "./types";

type MetadataHint = ReturnType<typeof metadataHintFromAniListMetadata>;

export interface BrowseCardOverlayProps {
	parsed: HostMediaTarget;
	adapter: BrowseAdapter;
	publicOptions: PublicOptions | undefined;
	mappedIdentities: readonly MappingIdentity[];
	metadata: MetadataHint;
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
	metadata: MetadataHint;
}): MediaModalMetadataHint {
	return {
		title: input.title,
		format: input.parsedFormat ?? input.metadata?.format ?? null,
		coverImage: input.metadata?.coverImage ?? null,
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

function isTrustedClick(event: MouseEvent<HTMLButtonElement>): boolean {
	return event.nativeEvent.isTrusted === true || event.isTrusted === true;
}

function swallowEvent(event: SyntheticEvent): void {
	event.preventDefault();
	event.stopPropagation();
}

function ProviderStackAction(props: {
	label: string;
	tooltipContainer: FloatingPortalContainer | undefined;
	onClick: () => void;
}): ReactElement {
	const { label, tooltipContainer, onClick } = props;

	const handleClick = (event: MouseEvent<HTMLButtonElement>): void => {
		event.preventDefault();
		event.stopPropagation();
		if (!isTrustedClick(event)) return;

		onClick();
	};

	return (
		<TooltipWrapper
			content={label}
			side="right"
			align="center"
			sideOffset={6}
			container={tooltipContainer ?? null}
			showArrow={false}
		>
			<button
				type="button"
				className="a2a-card-overlay__action a2a-card-overlay__action--advanced"
				aria-label={label}
				onClick={handleClick}
				onMouseDown={swallowEvent}
			>
				<SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
			</button>
		</TooltipWrapper>
	);
}

function getProviderStackAction(input: {
	isConfigured: boolean;
	anilistId: AniListId | undefined;
	configuredLabel: string;
	configureLabel: string;
	tooltipContainer: FloatingPortalContainer | undefined;
	onOpen(): void;
	onConfigure(): void;
}): ReactNode {
	if (input.isConfigured && input.anilistId === undefined) return null;

	return (
		<ProviderStackAction
			label={input.isConfigured ? input.configuredLabel : input.configureLabel}
			tooltipContainer={input.tooltipContainer}
			onClick={input.isConfigured ? input.onOpen : input.onConfigure}
		/>
	);
}

function openProviderModal(input: {
	onOpenMediaModal(input: MediaModalOpenState): void;
	anilistId: AniListId | undefined;
	source: SourceIdentity;
	provider: Provider;
	initialView: "setup" | "mapping";
	metadataHint: MediaModalMetadataHint;
}): void {
	if (input.anilistId === undefined) return;

	input.onOpenMediaModal({
		anilistId: input.anilistId,
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
	anilistId: AniListId | undefined;
	source: SourceIdentity;
	metadataHint: MediaModalMetadataHint;
}): void {
	input.onOpenMediaModal({
		...(input.anilistId === undefined ? {} : { anilistId: input.anilistId }),
		source: input.source,
		kind: "seerr",
		openSource: "content",
		metadataHint: input.metadataHint,
	});
}

// eslint-disable-next-line complexity -- Provider selection stays easier to follow in one component.
export function BrowseCardOverlay({
	parsed,
	adapter,
	publicOptions,
	mappedIdentities,
	metadata,
	onOpenMediaModal,
	tooltipContainer,
}: BrowseCardOverlayProps): React.ReactElement | null {
	const anilistId = parsed.anilistId;
	const rawProvider = resolveBrowseCardProvider({
		parsed,
		metadata,
		mappedIdentities,
	});

	const sonarrOpts = getSonarrOverlayOptions(publicOptions);
	const radarrOpts = getRadarrOverlayOptions(publicOptions);
	const seerrOpts = getSeerrOverlayOptions(publicOptions);

	const activeArr = getActiveArrProvider(
		rawProvider,
		sonarrOpts.enabled,
		radarrOpts.enabled,
	);
	const seerrEnabled = seerrOpts.enabled;

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
		metadata,
	});
	const seerrMediaType = seerrMediaTypeFromAniListFormat(
		parsed.format ?? metadata?.format ?? null,
	);

	const openArrModal = (
		provider: Provider,
		initialView: "setup" | "mapping",
	): void => {
		openProviderModal({
			onOpenMediaModal,
			anilistId,
			source: parsed.source,
			provider,
			initialView,
			metadataHint,
		});
	};

	const handleOpenSeerrModal = (): void => {
		openSeerrModal({
			onOpenMediaModal,
			anilistId,
			source: parsed.source,
			metadataHint,
		});
	};

	let arrStackAction: ReactNode = null;

	if (activeArr === "sonarr") {
		arrStackAction = getProviderStackAction({
			isConfigured: sonarrOpts.isConfigured,
			anilistId,
			configuredLabel: "Sonarr options",
			configureLabel: "Configure Sonarr",
			tooltipContainer,
			onOpen: () => openArrModal("sonarr", "setup"),
			onConfigure: () => openOptionsPage({ sectionId: "sonarr" }),
		});
	} else if (activeArr === "radarr") {
		arrStackAction = getProviderStackAction({
			isConfigured: radarrOpts.isConfigured,
			anilistId,
			configuredLabel: "Radarr options",
			configureLabel: "Configure Radarr",
			tooltipContainer,
			onOpen: () => openArrModal("radarr", "setup"),
			onConfigure: () => openOptionsPage({ sectionId: "radarr" }),
		});
	}

	const stackDirection = adapter.stackDirection ?? "up";

	const seerrStackActions: ReactNode = seerrEnabled ? (
		<SeerrCardStackActions
			source={parsed.source}
			{...(anilistId === undefined ? {} : { anilistId })}
			title={displayTitle}
			metadata={metadata}
			mediaType={seerrMediaType}
			isConfigured={seerrOpts.isConfigured}
			observeTarget={parsed.mountTarget}
			tooltipContainer={tooltipContainer}
			onOpenModal={handleOpenSeerrModal}
			stackDirection={stackDirection}
			presentation={parsed.presentation}
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
		anilistId,
		source: parsed.source,
		title: displayTitle,
		metadata,
		observeTarget: parsed.mountTarget,
		stackDirection,
		tooltipContainer,
		presentation: parsed.presentation,
	};

	if (showSeerrMain) {
		return (
			<SeerrStandaloneCardOverlay
				source={parsed.source}
				{...(anilistId === undefined ? {} : { anilistId })}
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
