/** Seerr browse-card request action backed by mapped movie and TV IDs. */
// src/features/media-overlay/seerr-card-overlay.tsx

import type {
	MouseEvent,
	ReactElement,
	ReactNode,
	SyntheticEvent,
} from "react";
import {
	Check,
	CircleDashed,
	RotateCcw,
	Send,
	TriangleAlert,
} from "lucide-react";
import type { AniListId } from "@/anilist/types";
import type { MediaActionState } from "@/features/media-action/state";
import { getSeerrActionState } from "@/features/seerr-request/seerr-action-state";
import { toSeerrRequestInput } from "@/features/seerr-request/seerr-request-input";
import type { SeerrMediaStatus } from "@/providers/seerr/types";
import { useSeerrMediaStatus, useSeerrTarget } from "@/queries/seerr";
import { openSeerrPage } from "@/rpc/provider-page";
import { openOptionsPage } from "@/rpc/runtime-messages";
import type { BadgeVisibility } from "@/settings/types";
import type { FloatingPortalContainer } from "@/shared/ui/portal-container";
import TooltipWrapper from "@/shared/ui/primitives/tooltip";
import { SeerrIcon } from "@/features/provider-ui/provider-icons";
import { CardOverlay } from "./card-overlay";
import { useCardOverlayInViewport } from "./card-overlay-viewport";

interface SeerrCardActionProps {
	anilistId: AniListId;
	isConfigured: boolean;
	observeTarget?: Element | null | undefined;
	tooltipContainer?: FloatingPortalContainer | undefined;
	statusEnabled?: boolean;
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
	"unconfigured" | "checking" | "adding" | "in-library" | "error" | "can-add"
>;

type SeerrCardAction = ReturnType<typeof useSeerrCardAction>;

function swallowEvent(event: SyntheticEvent): void {
	event.preventDefault();
	event.stopPropagation();
}

function stopOverlayEvent(event: SyntheticEvent): void {
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
		case "checking":
		case "adding": {
			return (
				<RotateCcw
					className="h-4 w-4 a2a-rotate"
					aria-hidden="true"
				/>
			);
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

function useSeerrCardAction(input: SeerrCardActionProps) {
	const seerrTargetQuery = useSeerrTarget(input.anilistId, {
		enabled: input.isConfigured && input.statusEnabled === true,
	});

	const requestInput = toSeerrRequestInput(seerrTargetQuery.data ?? null);

	const status = useSeerrMediaStatus({
		requestInput,
		enabled:
			input.isConfigured &&
			input.statusEnabled === true &&
			requestInput !== null,
	});

	const seerrStatus = status.data?.status;

	const actionState =
		input.isConfigured && requestInput === null
			? {
					state: "can-add" as const,
					label: "Choose Seerr target",
					disabled: false,
					settled: false,
				}
			: getSeerrActionState({
					isConfigured: input.isConfigured,
					isRequesting: false,
					isChecking: status.isEnabled && !status.data && !status.isError,
					requestSucceeded: false,
					requestFailed: false,
					status: seerrStatus,
				});

	const openSeerr =
		input.isConfigured && requestInput !== null
			? () =>
					openSeerrPage({
						mediaType: requestInput.mediaType,
						tmdbId: requestInput.tmdbId,
					})
			: null;

	const run = (): void => {
		if (!input.isConfigured) {
			openOptionsPage({ sectionId: "seerr" });
			return;
		}

		if (actionState.disabled) return;

		input.onOpenModal();
	};

	return {
		state: actionState.state,
		title: actionState.label,
		disabled: actionState.disabled,
		status: seerrStatus,
		run,
		requestInput,
		openSeerr,
	};
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

		action.run();
	};

	return (
		<TooltipWrapper
			content={action.title}
			side="right"
			align="center"
			sideOffset={6}
			container={tooltipContainer ?? null}
			showArrow={false}
		>
			<button
				type="button"
				className="a2a-card-overlay__action a2a-card-overlay__action--seerr"
				aria-label={action.title}
				onClick={handleClick}
				onMouseDown={swallowEvent}
				disabled={action.disabled}
				aria-disabled={action.disabled || undefined}
			>
				{getSeerrCardIcon({
					state: action.state,
					status: action.status,
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
	if (!action.openSeerr) return null;

	const handleClick = (event: MouseEvent<HTMLButtonElement>): void => {
		event.preventDefault();
		event.stopPropagation();
		if (!isTrustedClick(event)) return;

		action.openSeerr?.();
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
	anilistId,
	isConfigured,
	observeTarget,
	tooltipContainer,
	onOpenModal,
	stackDirection = "up",
	presentation,
}: SeerrCardStackActionsProps): ReactElement | null {
	const isInViewport = useCardOverlayInViewport(observeTarget);
	const action = useSeerrCardAction({
		anilistId,
		isConfigured,
		statusEnabled: isInViewport,
		onOpenModal,
		observeTarget,
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
				primaryState={action.state}
				primaryTitle={action.title}
				primaryLabel={action.title}
				primaryDisabled={action.disabled}
				onPrimaryAction={action.run}
				hasMapping={true}
				openProvider={
					presentation === "status-column" ? action.openSeerr : null
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
		<SeerrStackOpenButton
			action={action}
			tooltipContainer={tooltipContainer}
		/>
	);

	return stackDirection === "down" ? (
		<>{requestButton}{openButton}</>
	) : (
		<>{openButton}{requestButton}</>
	);
}

export function SeerrStandaloneCardOverlay({
	anilistId,
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
	const action = useSeerrCardAction({
		anilistId,
		isConfigured,
		statusEnabled: isInViewport,
		onOpenModal,
		observeTarget,
	});

	if (
		!isInViewport &&
		presentation !== "status-column" &&
		presentation !== "action-row"
	) {
		return null;
	}

	return (
		<div
			onClick={stopOverlayEvent}
			onDoubleClick={stopOverlayEvent}
			onKeyDown={stopOverlayEvent}
			onKeyUp={stopOverlayEvent}
			onMouseDown={stopOverlayEvent}
			onMouseUp={stopOverlayEvent}
			onPointerDown={stopOverlayEvent}
			onPointerUp={stopOverlayEvent}
		>
			<CardOverlay
				providerLabel="Seerr"
				primaryState={action.state}
				primaryTitle={action.title}
				primaryLabel={action.title}
				primaryDisabled={action.disabled}
				onPrimaryAction={action.run}
				hasMapping={true}
				openProvider={
					presentation === "action-row" ? null : action.openSeerr
				}
				openProviderIcon={SeerrIcon}
				extraAction={extraAction}
				badgeVisibility={badgeVisibility}
				stackDirection={stackDirection}
				tooltipContainer={tooltipContainer}
				presentation={presentation}
			/>
		</div>
	);
}
