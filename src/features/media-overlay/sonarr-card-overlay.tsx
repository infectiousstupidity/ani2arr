/** Sonarr browse-card overlay rendering backed by the shared media-action workflow. */
// src/features/media-overlay/sonarr-card-overlay.tsx

import type { ReactElement, ReactNode } from "react";
import type { AniListId, AniListMediaHint } from "@/anilist/types";
import type { SourceIdentity } from "@/mapping/types";
import { openOptionsPage } from "@/rpc/runtime-messages";
import { useSonarrMediaAction } from "@/features/media-action/use-sonarr-media-action";
import type { SonarrFormState } from "@/providers/sonarr/form-state";
import type { FloatingPortalContainer } from "@/shared/ui/portal-container";
import type { BadgeVisibility } from "@/settings/types";
import { SonarrIcon } from "@/options-page/components/icons";
import { getCardPrimaryTitle } from "./card-primary-title";
import { CardOverlay } from "./card-overlay";
import { useCardOverlayInViewport } from "./card-overlay-viewport";

interface SonarrCardOverlayProps {
	anilistId: AniListId;
	source?: SourceIdentity | undefined;
	title: string;
	onOpenSetup(): void;
	onOpenMapping(): void;
	isConfigured: boolean;
	defaultForm: SonarrFormState | null;
	metadata: AniListMediaHint | null;
	observeTarget?: Element | null;
	badgeVisibility?: BadgeVisibility;
	stackDirection?: "up" | "down";
	tooltipContainer?: FloatingPortalContainer;
	extraAction?: ReactNode;
}

export function SonarrCardOverlay({
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
}: SonarrCardOverlayProps): ReactElement {
	const isInViewport = useCardOverlayInViewport(observeTarget);
	const providerTitle = title.trim().length > 0 ? title : null;
	const mediaAction = useSonarrMediaAction({
		anilistId,
		source,
		displayTitle: title,
		providerTitle,
		metadata,
		isConfigured,
		defaultForm,
		enabled: isInViewport,
		onConfigure: () => openOptionsPage({ sectionId: "sonarr" }),
		onOpenMapping,
	});
	const primaryTitle = getCardPrimaryTitle({
		providerLabel: "Sonarr",
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
			openProvider={mediaAction.openProvider}
			openProviderIcon={SonarrIcon}
			extraAction={extraAction}
			badgeVisibility={badgeVisibility}
			stackDirection={stackDirection}
			tooltipContainer={tooltipContainer}
		/>
	);
}
