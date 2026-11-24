import type { ReactElement, ReactNode } from "react";
import type { AniListMediaHint } from "@/anilist/types";
import { getArrPrimaryLabel } from "@/features/media-action/labels";
import type {
	MediaAction,
	MediaActionInputBase,
} from "@/features/media-action/use-media-action";
import { SonarrIcon, RadarrIcon } from "@/features/provider-ui/provider-icons";
import type { SourceIdentity } from "@/mapping/source-identity";
import { openOptionsPage } from "@/rpc/runtime-messages";
import type { BadgeVisibility } from "@/settings/types";
import type { FloatingPortalContainer } from "@/shared/ui/portal-container";
import { CardOverlay } from "./card-overlay";
import { useCardOverlayInViewport } from "./card-overlay-viewport";

export interface ArrCardOverlayProps<TForm> {
	source: SourceIdentity;
	title: string;
	onOpenSetup(): void;
	onOpenMapping(): void;
	isConfigured: boolean;
	defaultForm: TForm | null;
	metadata: AniListMediaHint | null;
	observeTarget?: Element | null;
	badgeVisibility?: BadgeVisibility;
	stackDirection?: "up" | "down";
	tooltipContainer?: FloatingPortalContainer;
	extraAction?: ReactNode;
	presentation?: "status-column" | "action-row" | undefined;
	/** Hold the status fetch while the card's provider route is still loading. */
	statusBlocked?: boolean | undefined;
}

export function ArrCardOverlay<TForm>({
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
	statusBlocked,
	provider,
	useAction,
}: ArrCardOverlayProps<TForm> & {
	provider: "sonarr" | "radarr";
	useAction: (input: MediaActionInputBase<TForm>) => MediaAction;
}): ReactElement {
	const isInViewport = useCardOverlayInViewport(observeTarget);
	const providerTitle = title.trim().length > 0 ? title : null;
	const mediaAction = useAction({
		source,
		displayTitle: title,
		providerTitle,
		metadata,
		isConfigured,
		defaultForm,
		enabled: isInViewport,
		statusBlocked: statusBlocked === true,
		onConfigure: () => openOptionsPage({ sectionId: provider }),
		onOpenMapping,
		onOpenSetup,
	});
	const providerLabel = provider === "sonarr" ? "Sonarr" : "Radarr";
	const primaryLabel = getArrPrimaryLabel({
		providerLabel,
		state: mediaAction.status.state,
		errorSource: mediaAction.status.errorSource,
		canQuickAdd: providerTitle !== null && defaultForm !== null,
	});
	const hasMappingAction =
		mediaAction.status.state !== "unconfigured" &&
		mediaAction.status.state !== "unmapped" &&
		mediaAction.status.state !== "unknown";

	return (
		<CardOverlay
			providerLabel={providerLabel}
			primaryState={mediaAction.status.state}
			primaryLabel={primaryLabel}
			primaryDisabled={mediaAction.status.disabled}
			onPrimaryAction={mediaAction.runPrimaryAction}
			hasMapping={mediaAction.status.hasMapping}
			onOpenSetup={mediaAction.status.hasMapping ? onOpenSetup : undefined}
			onOpenMapping={hasMappingAction ? onOpenMapping : undefined}
			openProvider={mediaAction.openProvider}
			openProviderIcon={provider === "sonarr" ? SonarrIcon : RadarrIcon}
			extraAction={extraAction}
			badgeVisibility={badgeVisibility}
			stackDirection={stackDirection}
			tooltipContainer={tooltipContainer}
			presentation={presentation}
		/>
	);
}
