/** Sonarr browse-card overlay rendering backed by the shared media-action workflow. */
// src/features/media-overlay/sonarr-card-overlay.tsx

import type { ReactElement } from "react";
import { browser } from "wxt/browser";
import type { AniListId } from "@/anilist/anilist-id";
import type { AniListMediaHint } from "@/anilist/schemas/media.schema";
import { useSonarrMediaAction } from "@/features/media-action/use-sonarr-media-action";
import type { MediaActionState } from "@/features/media-action/state";
import type { SonarrFormState } from "@/providers/sonarr/form-state";
import type { BadgeVisibility } from "@/settings/types";
import { CardOverlay } from "./card-overlay";
import { useCardOverlayInViewport } from "./card-overlay-viewport";

interface SonarrCardOverlayProps {
	anilistId: AniListId;
	title: string;
	onOpenSetup(): void;
	onOpenMapping(): void;
	isConfigured: boolean;
	defaultForm: SonarrFormState | null;
	metadata: AniListMediaHint | null;
	observeTarget?: Element | null;
	badgeVisibility?: BadgeVisibility;
	stackDirection?: "up" | "down";
	tooltipContainer?: HTMLElement | ShadowRoot | null;
}

function openSonarrOptions(): void {
	void browser.runtime
		.sendMessage({
			_a2a: true,
			type: "OPEN_OPTIONS_PAGE",
			sectionId: "sonarr",
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
			return "Configure Sonarr before adding";
		}
		case "checking": {
			return "Checking Sonarr status.";
		}
		case "adding": {
			return "Adding to Sonarr.";
		}
		case "error": {
			return input.errorSource === "add"
				? "Retry Sonarr add"
				: "Retry Sonarr status check";
		}
		case "unmapped":
		case "unknown": {
			return "Find Sonarr match manually";
		}
		case "in-library": {
			return "Already in Sonarr";
		}
		case "can-add": {
			return input.canQuickAdd
				? "Quick add to Sonarr"
				: "Sonarr defaults unavailable";
		}
	}
}

export function SonarrCardOverlay({
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
}: SonarrCardOverlayProps): ReactElement {
	const isInViewport = useCardOverlayInViewport(observeTarget);
	const providerTitle = title.trim().length > 0 ? title : null;
	const mediaAction = useSonarrMediaAction({
		anilistId,
		displayTitle: title,
		providerTitle,
		metadata,
		isConfigured,
		defaultForm,
		enabled: isInViewport,
		onConfigure: openSonarrOptions,
		onOpenMapping,
	});
	const primaryTitle = getPrimaryTitle({
		state: mediaAction.status.state,
		errorSource: mediaAction.status.errorSource,
		canQuickAdd: providerTitle !== null && defaultForm !== null,
	});

	return (
		<CardOverlay
			providerLabel="Sonarr"
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
