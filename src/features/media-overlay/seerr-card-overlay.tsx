/** Seerr browse-card request action backed by mapped movie and TV IDs. */
// src/features/media-overlay/seerr-card-overlay.tsx

import {
	Check,
	CircleDashed,
	RotateCcw,
	Send,
	TriangleAlert,
} from "lucide-react";
import type {
	MouseEvent,
	ReactElement,
	ReactNode,
	SyntheticEvent,
} from "react";
import type { AniListId, AniListMediaHint } from "@/anilist/types";
import {
	type SeerrMediaAction,
	useSeerrMediaAction,
} from "@/features/media-action/use-seerr-media-action";
import type { MediaActionState } from "@/features/media-action/state";
import { SeerrIcon } from "@/features/provider-ui/provider-icons";
import type { SourceIdentity } from "@/mapping/source-identity";
import type { SeerrMediaStatus, SeerrMediaType } from "@/providers/seerr/types";
import type { BadgeVisibility } from "@/settings/types";
import type { FloatingPortalContainer } from "@/shared/ui/portal-container";
import TooltipWrapper from "@/shared/ui/primitives/tooltip";
import { CardOverlay } from "./card-overlay";
import { useCardOverlayInViewport } from "./card-overlay-viewport";

interface SeerrCardActionProps {
	source: SourceIdentity;
	anilistId?: AniListId | undefined;
	title: string;
	metadata: AniListMediaHint | null;
	mediaType: SeerrMediaType | null;
	isConfigured: boolean;
	observeTarget?: Element | null | undefined;
	tooltipContainer?: FloatingPortalContainer | undefined;
	onOpenModal: () => void;
}

interface SeerrCardStackActionsProps extends SeerrCardActionProps {
	stackDirection?: "up" | "down" | undefined;
	presentation?: "status-column" | "action-row" | undefined;
}

interface SeerrStandaloneCardOverlayProps extends SeerrCardActionProps {
	badgeVisibility?: BadgeVisibility;
	stackDirection?: "up" | "down";
	extraAction?: ReactNode;
	presentation?: "status-column" | "action-row" | undefined;
}

type SeerrCardState = Extract<
	MediaActionState,
	"unconfigured" | "checking" | "in-library" | "error" | "can-add"
>;

type SeerrCardAction = SeerrMediaAction;

function swallowEvent(event: SyntheticEvent): void {
	event.preventDefault();
	event.stopPropagation();
}

function isTrustedClick(event: MouseEvent<HTMLButtonElement>): boolean {
	return event.nativeEvent.isTrusted === true || event.isTrusted === true;
}

function getSeerrCardIcon(input: {
	state: SeerrCardState;
	status: SeerrMediaStatus | undefined;
}): ReactElement {
	if (input.status === "partial") {
		return <CircleDashed className="h-4 w-4" aria-hidden="true" />;
	}

	switch (input.state) {
		case "checking": {
			return <RotateCcw className="h-4 w-4 a2a-rotate" aria-hidden="true" />;
		}
		case "in-library": {
			return <Check className="h-4 w-4" aria-hidden="true" />;
		}
		case "error": {
			return <TriangleAlert className="h-4 w-4" aria-hidden="true" />;
		}
		default: {
			return <Send className="h-4 w-4" aria-hidden="true" />;
		}
	}
}

function SeerrStackRequestButton(props: {
	action: SeerrCardAction;
	tooltipContainer?: FloatingPortalContainer | undefined;
}): ReactElement {
	const { action, tooltipContainer } = props;

	const handleClick = (event: MouseEvent<HTMLButtonElement>): void => {
		event.preventDefault();
		event.stopPropagation();
		if (!isTrustedClick(event)) return;

		action.runPrimaryAction();
	};

	return (
		<TooltipWrapper
			content={action.visualTitle}
			side="right"
			align="center"
			sideOffset={6}
			container={tooltipContainer ?? null}
			showArrow={false}
		>
			<button
				type="button"
				className="a2a-card-overlay__action a2a-card-overlay__action--seerr"
				aria-label={action.visualTitle}
				onClick={handleClick}
				onMouseDown={swallowEvent}
				disabled={action.status.disabled}
				aria-disabled={action.status.disabled || undefined}
			>
				{getSeerrCardIcon({
					state: action.status.state,
					status: action.visualStatus,
				})}
			</button>
		</TooltipWrapper>
	);
}

function SeerrStackOpenButton(props: {
	action: SeerrCardAction;
	tooltipContainer?: FloatingPortalContainer | undefined;
}): ReactElement | null {
	const { action, tooltipContainer } = props;
	if (!action.openProvider) return null;

	const handleClick = (event: MouseEvent<HTMLButtonElement>): void => {
		event.preventDefault();
		event.stopPropagation();
		if (!isTrustedClick(event)) return;

		action.openProvider?.();
	};

	return (
		<TooltipWrapper
			content="Open in Seerr"
			side="right"
			align="center"
			sideOffset={6}
			container={tooltipContainer ?? null}
			showArrow={false}
		>
			<button
				type="button"
				className="a2a-card-overlay__action a2a-card-overlay__action--external"
				aria-label="Open in Seerr"
				onClick={handleClick}
				onMouseDown={swallowEvent}
			>
				<SeerrIcon className="h-4 w-4" aria-hidden="true" />
			</button>
		</TooltipWrapper>
	);
}

export function SeerrCardStackActions({
	source,
	anilistId,
	title,
	metadata,
	mediaType,
	isConfigured,
	observeTarget,
	tooltipContainer,
	onOpenModal,
	stackDirection = "up",
	presentation,
}: SeerrCardStackActionsProps): ReactElement | null {
	const isInViewport = useCardOverlayInViewport(observeTarget);
	const action = useSeerrMediaAction({
		source,
		anilistId,
		title,
		metadata,
		mediaType,
		isConfigured,
		enabled: isInViewport,
		onOpenModal,
	});

	if (
		!isInViewport &&
		presentation !== "status-column" &&
		presentation !== "action-row"
	) {
		return null;
	}

	if (presentation === "status-column" || presentation === "action-row") {
		return (
			<CardOverlay
				providerLabel="Seerr"
				primaryState={action.status.state}
				primaryTitle={action.visualTitle}
				primaryLabel={action.status.label}
				primaryIcon={
					action.visualStatus === "partial" ? (
						<CircleDashed
							className="a2a-card-overlay__symbol"
							aria-hidden="true"
						/>
					) : undefined
				}
				{...(action.visualStatus === "partial"
					? { primaryTone: "partial" as const }
					: {})}
				primaryDisabled={action.status.disabled}
				onPrimaryAction={action.runPrimaryAction}
				hasMapping={true}
				openProvider={
					presentation === "status-column" ? action.openProvider : null
				}
				openProviderIcon={SeerrIcon}
				tooltipContainer={tooltipContainer}
				presentation={presentation}
			/>
		);
	}

	const requestButton = (
		<SeerrStackRequestButton
			action={action}
			tooltipContainer={tooltipContainer}
		/>
	);
	const openButton = (
		<SeerrStackOpenButton action={action} tooltipContainer={tooltipContainer} />
	);

	return stackDirection === "down" ? (
		<>
			{requestButton}
			{openButton}
		</>
	) : (
		<>
			{openButton}
			{requestButton}
		</>
	);
}

export function SeerrStandaloneCardOverlay({
	source,
	anilistId,
	title,
	metadata,
	mediaType,
	isConfigured,
	observeTarget,
	badgeVisibility,
	stackDirection,
	tooltipContainer,
	onOpenModal,
	extraAction,
	presentation,
}: SeerrStandaloneCardOverlayProps): ReactElement | null {
	const isInViewport = useCardOverlayInViewport(observeTarget);
	const action = useSeerrMediaAction({
		source,
		anilistId,
		title,
		metadata,
		mediaType,
		isConfigured,
		enabled: isInViewport,
		onOpenModal,
	});

	if (
		!isInViewport &&
		presentation !== "status-column" &&
		presentation !== "action-row"
	) {
		return null;
	}

	return (
		<CardOverlay
			providerLabel="Seerr"
			primaryState={action.status.state}
			primaryTitle={action.visualTitle}
			primaryLabel={action.status.label}
			primaryIcon={
				action.visualStatus === "partial" ? (
					<CircleDashed
						className="a2a-card-overlay__symbol"
						aria-hidden="true"
					/>
				) : undefined
			}
			{...(action.visualStatus === "partial"
				? { primaryTone: "partial" as const }
				: {})}
			primaryDisabled={action.status.disabled}
			onPrimaryAction={action.runPrimaryAction}
			hasMapping={true}
			openProvider={presentation === "action-row" ? null : action.openProvider}
			openProviderIcon={SeerrIcon}
			extraAction={extraAction}
			badgeVisibility={badgeVisibility}
			stackDirection={stackDirection}
			tooltipContainer={tooltipContainer}
			presentation={presentation}
		/>
	);
}
