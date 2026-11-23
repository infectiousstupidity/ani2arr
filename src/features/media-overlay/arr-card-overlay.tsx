import type { ReactElement, ReactNode } from "react";
import type { AniListMediaHint } from "@/anilist/types";
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
import { getCardPrimaryLabel, getCardPrimaryTitle } from "./card-primary-title";

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
		onConfigure: () => openOptionsPage({ sectionId: provider }),
		onOpenMapping,
	});
	const primaryLabelInput = {
		providerLabel: provider === "sonarr" ? "Sonarr" : "Radarr",
		state: mediaAction.status.state,
		errorSource: mediaAction.status.errorSource,
		canQuickAdd: providerTitle !== null && defaultForm !== null,
		presentation,
	};
	const primaryTitle = getCardPrimaryTitle(primaryLabelInput);
	const primaryLabel = getCardPrimaryLabel(primaryLabelInput);
	const openSetup = mediaAction.status.hasMapping ? onOpenSetup : undefined;
	const statusPrimaryAction =
		mediaAction.status.state === "in-library"
			? (openSetup ?? mediaAction.openProvider ?? mediaAction.runPrimaryAction)
			: mediaAction.runPrimaryAction;

	return (
		<CardOverlay
			providerLabel={primaryLabelInput.providerLabel}
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
				mediaAction.status.state === "unconfigured" ? undefined : onOpenMapping
			}
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
