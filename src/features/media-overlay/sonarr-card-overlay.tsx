/** Sonarr browse-card overlay rendering backed by the shared media-action workflow. */
// src/features/media-overlay/sonarr-card-overlay.tsx

import type { ReactElement, ReactNode } from "react";
import type { AniListId, AniListMediaHint } from "@/anilist/types";
import type { SourceIdentity } from "@/mapping/source-identity";
import { openOptionsPage } from "@/rpc/runtime-messages";
import { useSonarrMediaAction } from "@/features/media-action/use-sonarr-media-action";
import type { SonarrFormState } from "@/providers/sonarr/form-state";
import type { FloatingPortalContainer } from "@/shared/ui/portal-container";
import type { BadgeVisibility } from "@/settings/types";
import { SonarrIcon } from "@/features/provider-ui/provider-icons";
import { getCardPrimaryLabel, getCardPrimaryTitle } from "./card-primary-title";
import { CardOverlay } from "./card-overlay";
import { useCardOverlayInViewport } from "./card-overlay-viewport";

interface SonarrCardOverlayProps {
	anilistId?: AniListId | undefined;
	source: SourceIdentity;
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
	presentation?: "status-column" | undefined;
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
	presentation,
}: SonarrCardOverlayProps): ReactElement {
	const isInViewport = useCardOverlayInViewport(observeTarget);
	const providerTitle = title.trim().length > 0 ? title : null;
	const identity =
		anilistId === undefined ? { source } : { source, anilistId };
	const mediaAction = useSonarrMediaAction({
		...identity,
		displayTitle: title,
		providerTitle,
		metadata,
		isConfigured,
		defaultForm,
		enabled: isInViewport,
		onConfigure: () => openOptionsPage({ sectionId: "sonarr" }),
		onOpenMapping,
	});
	const primaryLabelInput = {
		providerLabel: "Sonarr",
		state: mediaAction.status.state,
		errorSource: mediaAction.status.errorSource,
		canQuickAdd: providerTitle !== null && defaultForm !== null,
	};
	const primaryTitle = getCardPrimaryTitle(primaryLabelInput);
	const primaryLabel = getCardPrimaryLabel(primaryLabelInput);
	const openSetup =
		anilistId !== undefined && mediaAction.status.hasMapping
			? onOpenSetup
			: undefined;
	const statusPrimaryAction =
		mediaAction.status.state === "in-library"
			? (openSetup ?? mediaAction.openProvider ?? mediaAction.runPrimaryAction)
			: mediaAction.runPrimaryAction;

	return (
		<CardOverlay
			providerLabel="Sonarr"
			primaryState={mediaAction.status.state}
			primaryTitle={primaryTitle}
			primaryLabel={primaryLabel}
			primaryDisabled={mediaAction.status.disabled}
			onPrimaryAction={mediaAction.runPrimaryAction}
			statusPrimaryDisabled={
				mediaAction.status.state === "in-library"
					? false
					: mediaAction.status.disabled
			}
			onStatusPrimaryAction={statusPrimaryAction}
			hasMapping={mediaAction.status.hasMapping}
			onOpenSetup={openSetup}
			onOpenMapping={
				anilistId !== undefined && mediaAction.status.state !== "unconfigured"
					? onOpenMapping
					: undefined
			}
			openProvider={mediaAction.openProvider}
			openProviderIcon={SonarrIcon}
			extraAction={extraAction}
			badgeVisibility={badgeVisibility}
			stackDirection={stackDirection}
			tooltipContainer={tooltipContainer}
			presentation={presentation}
		/>
	);
}
