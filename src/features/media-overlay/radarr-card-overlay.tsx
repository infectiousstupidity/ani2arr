/** Radarr browse-card overlay rendering backed by the shared media-action workflow. */
// src/features/media-overlay/radarr-card-overlay.tsx

import type { ReactElement, ReactNode } from "react";
import type { AniListId, AniListMediaHint } from "@/anilist/types";
import { useRadarrMediaAction } from "@/features/media-action/use-radarr-media-action";
import { RadarrIcon } from "@/features/provider-ui/provider-icons";
import type { SourceIdentity } from "@/mapping/source-identity";
import type { RadarrFormState } from "@/providers/radarr/form-state";
import { openOptionsPage } from "@/rpc/runtime-messages";
import type { BadgeVisibility } from "@/settings/types";
import type { FloatingPortalContainer } from "@/shared/ui/portal-container";
import { CardOverlay } from "./card-overlay";
import { useCardOverlayInViewport } from "./card-overlay-viewport";
import { getCardPrimaryLabel, getCardPrimaryTitle } from "./card-primary-title";

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
	presentation?: "status-column" | "action-row" | undefined;
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
	presentation,
}: RadarrCardOverlayProps): ReactElement {
	const isInViewport = useCardOverlayInViewport(observeTarget);
	const providerTitle = title.trim().length > 0 ? title : null;
	const identity = anilistId === undefined ? { source } : { source, anilistId };
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
	const primaryLabelInput = {
		providerLabel: "Radarr",
		state: mediaAction.status.state,
		errorSource: mediaAction.status.errorSource,
		canQuickAdd: providerTitle !== null && defaultForm !== null,
		presentation,
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
			providerLabel="Radarr"
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
			openProviderIcon={RadarrIcon}
			extraAction={extraAction}
			badgeVisibility={badgeVisibility}
			stackDirection={stackDirection}
			tooltipContainer={tooltipContainer}
			presentation={presentation}
		/>
	);
}
