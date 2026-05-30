/** Browse-card overlay selector for provider-specific card actions. */
// src/content/browse/browse-card-overlay.tsx

import React from "react";
import type { AniListId } from "@/anilist/anilist-id";
import type { metadataHintFromAniListMetadata } from "@/anilist/metadata-hints";
import type {
	MediaModalMetadataHint,
	MediaModalOpenState,
} from "@/features/media-modal";
import { RadarrCardOverlay } from "@/features/media-overlay/radarr-card-overlay";
import { SonarrCardOverlay } from "@/features/media-overlay/sonarr-card-overlay";
import type { EffectiveMappingPresence } from "@/mapping/queries/mapping-identities";
import type { PublicOptions } from "@/settings";
import { resolveAniListTargetProvider } from "@/content/anilist/target-provider";
import type { BrowseAdapter, HostMediaTarget } from "./types";

type MetadataHint = ReturnType<typeof metadataHintFromAniListMetadata>;

interface BrowseOverlayCommonProps {
	anilistId: AniListId;
	title: string;
	onOpenSetup(): void;
	onOpenMapping(): void;
	metadata: MetadataHint;
	observeTarget: Element;
	stackDirection: "up" | "down";
	tooltipContainer: HTMLElement | ShadowRoot | null;
}

export interface BrowseCardOverlayProps {
	parsed: HostMediaTarget;
	adapter: BrowseAdapter;
	publicOptions: PublicOptions | undefined;
	mappedIdentities: readonly EffectiveMappingPresence[];
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

function renderSonarrOverlay(input: {
	publicOptions: PublicOptions | undefined;
	commonProps: BrowseOverlayCommonProps;
}): React.ReactElement | null {
	const browseOptions = input.publicOptions?.ui?.browseCards.sonarr;
	if ((browseOptions?.enabled ?? true) === false) return null;

	return (
		<SonarrCardOverlay
			{...input.commonProps}
			isConfigured={input.publicOptions?.providers.sonarr.isConfigured === true}
			defaultForm={input.publicOptions?.providers.sonarr.defaults ?? null}
			badgeVisibility={browseOptions?.visibility ?? "always"}
		/>
	);
}

function renderRadarrOverlay(input: {
	publicOptions: PublicOptions | undefined;
	commonProps: BrowseOverlayCommonProps;
}): React.ReactElement | null {
	const browseOptions = input.publicOptions?.ui?.browseCards.radarr;
	if ((browseOptions?.enabled ?? true) === false) return null;

	return (
		<RadarrCardOverlay
			{...input.commonProps}
			isConfigured={input.publicOptions?.providers.radarr.isConfigured === true}
			defaultForm={input.publicOptions?.providers.radarr.defaults ?? null}
			badgeVisibility={browseOptions?.visibility ?? "always"}
		/>
	);
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
	const provider = resolveAniListTargetProvider({
		anilistId: parsed.anilistId,
		format: parsed.format,
		mappedIdentities,
	});
	if (!provider) {
		return null;
	}

	const displayTitle = getDisplayTitle({
		metadata,
		parsedTitle: parsed.title,
	});
	const metadataHint = getModalMetadataHint({
		title: displayTitle,
		format: parsed.format,
		metadata,
	});
	const openSetup = () => {
		onOpenMediaModal({
			anilistId: parsed.anilistId,
			provider,
			initialView: "setup",
			openSource: "content",
			metadataHint,
		});
	};
	const openMapping = () => {
		onOpenMediaModal({
			anilistId: parsed.anilistId,
			provider,
			initialView: "mapping",
			openSource: "content",
			metadataHint,
		});
	};
	const commonProps: BrowseOverlayCommonProps = {
		anilistId: parsed.anilistId,
		title: displayTitle,
		onOpenSetup: openSetup,
		onOpenMapping: openMapping,
		metadata,
		observeTarget: parsed.mountTarget,
		stackDirection: adapter.stackDirection ?? "up",
		tooltipContainer,
	};

	if (provider === "sonarr") {
		return renderSonarrOverlay({ publicOptions, commonProps });
	}

	return renderRadarrOverlay({ publicOptions, commonProps });
}
