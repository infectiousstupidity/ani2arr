/** Radarr browse-card overlay rendering backed by the shared media-action workflow. */
// src/features/media-overlay/radarr-card-overlay.tsx

import type { ReactElement } from "react";
import { browser } from "wxt/browser";
import type { AniListId } from "@/anilist/anilist-id";
import type { AniListMediaHint } from "@/anilist/schemas/media.schema";
import { useRadarrMediaAction } from "@/features/media-action/use-radarr-media-action";
import type { MediaActionState } from "@/features/media-action/state";
import type { RadarrFormState } from "@/providers/radarr/form-state";
import type { BadgeVisibility } from "@/settings/types";
import { CardOverlay } from "./card-overlay";
import { useCardOverlayInViewport } from "./card-overlay-viewport";

interface RadarrCardOverlayProps {
	anilistId: AniListId;
	title: string;
	onOpenSetup(): void;
	onOpenMapping(): void;
	isConfigured: boolean;
	defaultForm: RadarrFormState | null;
	metadata: AniListMediaHint | null;
	observeTarget?: Element | null;
	badgeVisibility?: BadgeVisibility;
	stackDirection?: "up" | "down";
	tooltipContainer?: HTMLElement | ShadowRoot | null;
}

function openRadarrOptions(): void {
	void browser.runtime
		.sendMessage({
			_a2a: true,
			type: "OPEN_OPTIONS_PAGE",
			sectionId: "radarr",
			timestamp: Date.now(),
		})
		.catch(() => {});
}

function getPrimaryTitle(input: {
	state: MediaActionState;
	errorSource: "status" | "add" | null;
	canQuickAdd: boolean;
}): string {
	switch (input.state) {
		case "unconfigured": {
			return "Configure Radarr before adding";
		}
		case "checking": {
			return "Checking Radarr status.";
		}
		case "adding": {
			return "Adding to Radarr.";
		}
		case "error": {
			return input.errorSource === "add"
				? "Retry Radarr add"
				: "Retry Radarr status check";
		}
		case "unmapped":
		case "unknown": {
			return "Find Radarr match manually";
		}
		case "in-library": {
			return "Already in Radarr";
		}
		case "can-add": {
			return input.canQuickAdd
				? "Quick add to Radarr"
				: "Radarr defaults unavailable";
		}
	}
}

export function RadarrCardOverlay({
	anilistId,
	title,
	onOpenSetup,
	onOpenMapping,
	isConfigured,
	defaultForm,
	metadata,
	observeTarget,
	badgeVisibility,
	stackDirection,
	tooltipContainer,
}: RadarrCardOverlayProps): ReactElement {
	const isInViewport = useCardOverlayInViewport(observeTarget);
	const providerTitle = title.trim().length > 0 ? title : null;
	const mediaAction = useRadarrMediaAction({
		anilistId,
		displayTitle: title,
		providerTitle,
		metadata,
		isConfigured,
		defaultForm,
		enabled: isInViewport,
		onConfigure: openRadarrOptions,
		onOpenMapping,
	});
	const primaryTitle = getPrimaryTitle({
		state: mediaAction.status.state,
		errorSource: mediaAction.status.errorSource,
		canQuickAdd: providerTitle !== null && defaultForm !== null,
	});

	return (
		<CardOverlay
			providerLabel="Radarr"
			primaryState={mediaAction.status.state}
			primaryTitle={primaryTitle}
			primaryAriaLabel={primaryTitle}
			primaryDisabled={mediaAction.status.disabled}
			onPrimaryAction={mediaAction.runPrimaryAction}
			hasMapping={mediaAction.status.hasMapping}
			showSetupAction={mediaAction.status.hasMapping}
			onOpenSetup={onOpenSetup}
			showMappingAction={mediaAction.status.state !== "unconfigured"}
			onOpenMapping={onOpenMapping}
			externalHref={mediaAction.externalHref}
			badgeVisibility={badgeVisibility}
			stackDirection={stackDirection}
			tooltipContainer={tooltipContainer}
		/>
	);
}
