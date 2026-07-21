/** Browse-card overlay selector for provider-specific card actions. */
// src/content/browse/browse-card-overlay.tsx

import React, {
	type MouseEvent,
	type ReactElement,
	type ReactNode,
	type SyntheticEvent,
} from "react";
import { SlidersHorizontal } from "lucide-react";
import type { AniListId } from "@/anilist/types";
import type { SourceIdentity } from "@/mapping/source-identity";
import type { metadataHintFromAniListMetadata } from "@/anilist/title";
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
import { openOptionsPage } from "@/rpc/runtime-messages";
import type { MappingIdentity } from "@/rpc/types";
import type { PublicOptions } from "@/settings/types";
import type { FloatingPortalContainer } from "@/shared/ui/portal-container";
import TooltipWrapper from "@/shared/ui/primitives/tooltip";
import type { BrowseAdapter, HostMediaTarget } from "./types";
import { resolveBrowseCardProvider } from "./browse-card-provider";
import type { Provider } from "@/providers/types";

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

function getPrimaryStatus(publicOptions: PublicOptions | undefined): string {
	return publicOptions?.ui?.browseCards.primaryStatus ?? "arr";
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

function openProviderModal(input: {
	onOpenMediaModal(input: MediaModalOpenState): void;
	anilistId: AniListId;
	source: SourceIdentity;
	provider: Provider;
	initialView: "setup" | "mapping";
	metadataHint: MediaModalMetadataHint;
}): void {
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

export function BrowseCardOverlay({
	parsed,
	adapter,
	publicOptions,
	mappedIdentities,
	metadata,
	onOpenMediaModal,
	tooltipContainer,
}: BrowseCardOverlayProps): React.ReactElement | null {
	/** MAL v1 uses source identity internally, but content actions still require an AniList crosswalk. */
	const anilistId = parsed.anilistId;
	if (anilistId === undefined) return null;

	const rawProvider = resolveBrowseCardProvider({ parsed, metadata, mappedIdentities });

	const sonarrOpts = getSonarrOverlayOptions(publicOptions);
	const radarrOpts = getRadarrOverlayOptions(publicOptions);
	const seerrOpts = getSeerrOverlayOptions(publicOptions);

	const activeArr = getActiveArrProvider(rawProvider, sonarrOpts.enabled, radarrOpts.enabled);
	const seerrEnabled = seerrOpts.enabled;

	if (activeArr === "none" && !seerrEnabled) return null;

	const displayTitle = getDisplayTitle({ metadata, parsedTitle: parsed.title });
	const metadataHint = getModalMetadataHint({
		title: displayTitle,
		parsedFormat: parsed.format,
		metadata,
	});

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

	const openSeerrModal = () => {
		onOpenMediaModal({
			anilistId,
			source: parsed.source,
			kind: "seerr",
			openSource: "content",
			metadataHint,
		});
	};

	let arrStackAction: ReactNode = null;

	if (activeArr === "sonarr") {
		const isConfig = sonarrOpts.isConfigured;
		arrStackAction = (
			<ProviderStackAction
				label={isConfig ? "Sonarr options" : "Configure Sonarr"}
				tooltipContainer={tooltipContainer}
				onClick={
					isConfig
						? () => openArrModal("sonarr", "setup")
						: () => openOptionsPage({ sectionId: "sonarr" })
				}
			/>
		);
	} else if (activeArr === "radarr") {
		const isConfig = radarrOpts.isConfigured;
		arrStackAction = (
			<ProviderStackAction
				label={isConfig ? "Radarr options" : "Configure Radarr"}
				tooltipContainer={tooltipContainer}
				onClick={
					isConfig
						? () => openArrModal("radarr", "setup")
						: () => openOptionsPage({ sectionId: "radarr" })
				}
			/>
		);
	}

	const stackDirection = adapter.stackDirection ?? "up";

	const seerrStackActions: ReactNode =
		seerrEnabled ? (
			<SeerrCardStackActions
				anilistId={anilistId}
				isConfigured={seerrOpts.isConfigured}
				observeTarget={parsed.mountTarget}
				tooltipContainer={tooltipContainer}
				onOpenModal={openSeerrModal}
				stackDirection={stackDirection}
			/>
		) : null;

	const primaryStatus = getPrimaryStatus(publicOptions);
	const showSeerrMain = seerrEnabled && (primaryStatus === "seerr" || activeArr === "none");

	const commonProps = {
		anilistId,
		source: parsed.source,
		title: displayTitle,
		metadata,
		observeTarget: parsed.mountTarget,
		stackDirection,
		tooltipContainer,
	};

	if (showSeerrMain) {
		return (
			<SeerrStandaloneCardOverlay
				anilistId={anilistId}
				isConfigured={seerrOpts.isConfigured}
				observeTarget={parsed.mountTarget}
				badgeVisibility={seerrOpts.visibility}
				stackDirection={stackDirection}
				tooltipContainer={tooltipContainer}
				onOpenModal={openSeerrModal}
				extraAction={arrStackAction}
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
