/** Browse-card overlay selector for provider-specific card actions. */
// src/content/browse/browse-card-overlay.tsx

import React from "react";
import type { AniListId } from "@/anilist/types";
import type { metadataHintFromAniListMetadata } from "@/anilist/title";
import type {
	MediaModalMetadataHint,
	MediaModalOpenState,
} from "@/features/media-modal";
import { RadarrCardOverlay } from "@/features/media-overlay/radarr-card-overlay";
import {
	SeerrCardStackAction,
	SeerrStandaloneCardOverlay,
} from "@/features/media-overlay/seerr-card-overlay";
import { SonarrCardOverlay } from "@/features/media-overlay/sonarr-card-overlay";
import type { MappingIdentity } from "@/rpc/types";
import type { PublicOptions } from "@/settings/types";
import type { BrowseAdapter, HostMediaTarget } from "./types";
import { resolveBrowseCardProvider } from "./browse-card-provider";

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
	format: HostMediaTarget["format"];
	metadata: MetadataHint;
}): MediaModalMetadataHint {
	return {
		title: input.title,
		format: input.metadata?.format ?? input.format,
		coverImage: input.metadata?.coverImage ?? null,
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

function openProviderModal(input: {
	onOpenMediaModal(input: MediaModalOpenState): void;
	anilistId: AniListId;
	provider: "sonarr" | "radarr";
	initialView: "setup" | "mapping";
	metadataHint: MediaModalMetadataHint;
}): void {
	input.onOpenMediaModal({
		anilistId: input.anilistId,
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
	const provider = resolveBrowseCardProvider({
		parsed,
		metadata,
		mappedIdentities,
	});
	const seerrOptions = getSeerrOverlayOptions(publicOptions);
	const showSeerrAction = seerrOptions.enabled;
	if (!provider && !showSeerrAction) return null;

	const displayTitle = getDisplayTitle({
		metadata,
		parsedTitle: parsed.title,
	});
	const metadataHint = getModalMetadataHint({
		title: displayTitle,
		format: parsed.format ?? metadata?.format ?? null,
		metadata,
	});
	const openSeerrModal = () => {
		onOpenMediaModal({
			anilistId: parsed.anilistId,
			kind: "seerr",
			openSource: "content",
			metadataHint,
		});
	};
	const stackDirection = adapter.stackDirection ?? "up";
	const commonProps = {
		anilistId: parsed.anilistId,
		title: displayTitle,
		metadata,
		observeTarget: parsed.mountTarget,
		stackDirection,
		tooltipContainer,
	};
	const seerrAction = showSeerrAction ? (
		<SeerrCardStackAction
			anilistId={parsed.anilistId}
			mappedIdentities={mappedIdentities}
			isConfigured={seerrOptions.isConfigured}
			observeTarget={parsed.mountTarget}
			tooltipContainer={tooltipContainer}
			onOpenModal={openSeerrModal}
		/>
	) : null;

	if (provider === "sonarr") {
		const sonarrOptions = getSonarrOverlayOptions(publicOptions);
		if (sonarrOptions.enabled) {
			return (
				<SonarrCardOverlay
					{...commonProps}
					onOpenSetup={() =>
						openProviderModal({
							onOpenMediaModal,
							anilistId: parsed.anilistId,
							provider: "sonarr",
							initialView: "setup",
							metadataHint,
						})
					}
					onOpenMapping={() =>
						openProviderModal({
							onOpenMediaModal,
							anilistId: parsed.anilistId,
							provider: "sonarr",
							initialView: "mapping",
							metadataHint,
						})
					}
					isConfigured={sonarrOptions.isConfigured}
					defaultForm={sonarrOptions.defaultForm}
					badgeVisibility={sonarrOptions.visibility}
					extraAction={seerrAction}
				/>
			);
		}
	}

	if (provider === "radarr") {
		const radarrOptions = getRadarrOverlayOptions(publicOptions);
		if (radarrOptions.enabled) {
			return (
				<RadarrCardOverlay
					{...commonProps}
					onOpenSetup={() =>
						openProviderModal({
							onOpenMediaModal,
							anilistId: parsed.anilistId,
							provider: "radarr",
							initialView: "setup",
							metadataHint,
						})
					}
					onOpenMapping={() =>
						openProviderModal({
							onOpenMediaModal,
							anilistId: parsed.anilistId,
							provider: "radarr",
							initialView: "mapping",
							metadataHint,
						})
					}
					isConfigured={radarrOptions.isConfigured}
					defaultForm={radarrOptions.defaultForm}
					badgeVisibility={radarrOptions.visibility}
					extraAction={seerrAction}
				/>
			);
		}
	}

	return showSeerrAction ? (
		<SeerrStandaloneCardOverlay
			anilistId={parsed.anilistId}
			mappedIdentities={mappedIdentities}
			isConfigured={seerrOptions.isConfigured}
			observeTarget={parsed.mountTarget}
			badgeVisibility={seerrOptions.visibility}
			stackDirection={stackDirection}
			tooltipContainer={tooltipContainer}
			onOpenModal={openSeerrModal}
		/>
	) : null;
}
