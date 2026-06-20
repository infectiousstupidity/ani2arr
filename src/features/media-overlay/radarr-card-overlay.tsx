/** Radarr browse-card overlay rendering backed by the shared media-action workflow. */
// src/features/media-overlay/radarr-card-overlay.tsx

import type { ReactElement, ReactNode } from "react";
import type { AniListId, AniListMediaHint } from "@/anilist/types";
import type { SourceIdentity } from "@/mapping/types";
import { openOptionsPage } from "@/rpc/runtime-messages";
import { useRadarrMediaAction } from "@/features/media-action/use-radarr-media-action";
import type { RadarrFormState } from "@/providers/radarr/form-state";
import type { FloatingPortalContainer } from "@/shared/ui/portal-container";
import type { BadgeVisibility } from "@/settings/types";
import { RadarrIcon } from "@/options-page/components/icons";
import { getCardPrimaryTitle } from "./card-primary-title";
import { CardOverlay } from "./card-overlay";
import { useCardOverlayInViewport } from "./card-overlay-viewport";

interface RadarrCardOverlayProps {
	anilistId?: AniListId | undefined;
	source: SourceIdentity;
	title: string;
	onOpenSetup(): void;
	onOpenMapping(): void;
	isConfigured: boolean;
	defaultForm: RadarrFormState | null;
	metadata: AniListMediaHint | null;
	observeTarget?: Element | null;
	badgeVisibility?: BadgeVisibility;
	stackDirection?: "up" | "down";
	tooltipContainer?: FloatingPortalContainer;
	extraAction?: ReactNode;
}

export function RadarrCardOverlay({
	anilistId,
	source,
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
	extraAction,
}: RadarrCardOverlayProps): ReactElement {
	const isInViewport = useCardOverlayInViewport(observeTarget);
	const providerTitle = title.trim().length > 0 ? title : null;
	const identity =
		anilistId === undefined ? { source } : { source, anilistId };
	const mediaAction = useRadarrMediaAction({
		...identity,
		displayTitle: title,
		providerTitle,
		metadata,
		isConfigured,
		defaultForm,
		enabled: isInViewport,
		onConfigure: () => openOptionsPage({ sectionId: "radarr" }),
		onOpenMapping,
	});
	const primaryTitle = getCardPrimaryTitle({
		providerLabel: "Radarr",
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
			showSetupAction={anilistId !== undefined && mediaAction.status.hasMapping}
			onOpenSetup={onOpenSetup}
			showMappingAction={
				anilistId !== undefined && mediaAction.status.state !== "unconfigured"
			}
			onOpenMapping={onOpenMapping}
			openProvider={mediaAction.openProvider}
			openProviderIcon={RadarrIcon}
			extraAction={extraAction}
			badgeVisibility={badgeVisibility}
			stackDirection={stackDirection}
			tooltipContainer={tooltipContainer}
		/>
	);
}
