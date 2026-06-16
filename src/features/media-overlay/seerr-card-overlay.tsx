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
	RotateCcw,
	Send,
	SquareArrowOutUpRight,
	TriangleAlert,
} from "lucide-react";
import type { AniListId } from "@/anilist/types";
import { resolveSeerrRequestInput } from "@/content/anilist/target-provider";
import type { MediaActionState } from "@/features/media-action/state";
import { getSeerrActionState } from "@/features/seerr-request/seerr-action-state";
import { useSeerrMediaStatus, useSeerrTarget } from "@/queries/seerr";
import { openSeerrPage } from "@/rpc/provider-page";
import { openOptionsPage } from "@/rpc/runtime-messages";
import type { MappingIdentity, RequestInSeerrInput } from "@/rpc/types";
import type { BadgeVisibility } from "@/settings/types";
import type { FloatingPortalContainer } from "@/shared/ui/portal-container";
import TooltipWrapper from "@/shared/ui/primitives/tooltip";
import { CardOverlay } from "./card-overlay";
import { useCardOverlayInViewport } from "./card-overlay-viewport";

interface SeerrCardActionProps {
	anilistId: AniListId;
	mappedIdentities: readonly MappingIdentity[];
	isConfigured: boolean;
	observeTarget?: Element | null | undefined;
	tooltipContainer?: FloatingPortalContainer | undefined;
	statusEnabled?: boolean;
	onOpenModal: () => void;
}

interface SeerrStandaloneCardOverlayProps extends SeerrCardActionProps {
	badgeVisibility?: BadgeVisibility;
	stackDirection?: "up" | "down";
	extraAction?: ReactNode;
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

function getSeerrCardIcon(state: SeerrCardState): ReactElement {
	switch (state) {
		case "checking":
		case "adding": {
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

function useSeerrCardAction(input: SeerrCardActionProps) {
	const seerrTargetQuery = useSeerrTarget(input.anilistId, {
		enabled: input.isConfigured && input.statusEnabled === true,
	});

	const seerrRequestTarget = seerrTargetQuery.data ?? null;

	const requestInput: RequestInSeerrInput | null = resolveSeerrRequestInput({
		anilistId: input.anilistId,
		mappedIdentities: input.mappedIdentities,
		seerrRequestTarget,
	});

	const status = useSeerrMediaStatus({
		requestInput,
		enabled:
			input.isConfigured &&
			input.statusEnabled === true &&
			requestInput !== null,
	});

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
					status: status.data?.status,
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
				{getSeerrCardIcon(action.state)}
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
				<SquareArrowOutUpRight className="h-4 w-4" aria-hidden="true" />
			</button>
		</TooltipWrapper>
	);
}

export function SeerrCardStackAction({
	anilistId,
	mappedIdentities,
	isConfigured,
	observeTarget,
	tooltipContainer,
	onOpenModal,
}: SeerrCardActionProps): ReactElement | null {
	const isInViewport = useCardOverlayInViewport(observeTarget);
	const action = useSeerrCardAction({
		anilistId,
		mappedIdentities,
		isConfigured,
		statusEnabled: isInViewport,
		onOpenModal,
		observeTarget,
	});

	if (!isInViewport) return null;

	return (
		<SeerrStackRequestButton
			action={action}
			tooltipContainer={tooltipContainer}
		/>
	);
}

export function SeerrCardStackActions({
	anilistId,
	mappedIdentities,
	isConfigured,
	observeTarget,
	tooltipContainer,
	onOpenModal,
}: SeerrCardActionProps): ReactElement | null {
	const isInViewport = useCardOverlayInViewport(observeTarget);
	const action = useSeerrCardAction({
		anilistId,
		mappedIdentities,
		isConfigured,
		statusEnabled: isInViewport,
		onOpenModal,
		observeTarget,
	});

	if (!isInViewport) return null;

	return (
		<>
			<SeerrStackRequestButton
				action={action}
				tooltipContainer={tooltipContainer}
			/>
			<SeerrStackOpenButton
				action={action}
				tooltipContainer={tooltipContainer}
			/>
		</>
	);
}

export function SeerrStandaloneCardOverlay({
	anilistId,
	mappedIdentities,
	isConfigured,
	observeTarget,
	badgeVisibility,
	stackDirection,
	tooltipContainer,
	onOpenModal,
	extraAction,
}: SeerrStandaloneCardOverlayProps): ReactElement | null {
	const isInViewport = useCardOverlayInViewport(observeTarget);
	const action = useSeerrCardAction({
		anilistId,
		mappedIdentities,
		isConfigured,
		statusEnabled: isInViewport,
		onOpenModal,
		observeTarget,
	});

	if (!isInViewport) return null;

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
				primaryAriaLabel={action.title}
				primaryDisabled={action.disabled}
				onPrimaryAction={action.run}
				hasMapping={true}
				showSetupAction={false}
				onOpenSetup={() => {}}
				showMappingAction={false}
				onOpenMapping={() => {}}
				openProvider={action.openSeerr}
				extraAction={extraAction}
				badgeVisibility={badgeVisibility}
				stackDirection={stackDirection}
				tooltipContainer={tooltipContainer}
			/>
		</div>
	);
}
