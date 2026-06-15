/** Seerr browse-card request action backed by mapped movie and TV IDs. */
// src/features/media-overlay/seerr-card-overlay.tsx

import type { MouseEvent, ReactElement, SyntheticEvent } from "react";
import { Check, RotateCcw, Send, TriangleAlert } from "lucide-react";
import type { MediaActionState } from "@/features/media-action/state";
import { getSeerrActionState } from "@/features/seerr-request/seerr-action-state";
import { useSeerrMediaStatus, useSeerrTarget } from "@/queries/seerr";
import { openOptionsPage } from "@/rpc/runtime-messages";
import type { RequestInSeerrInput, MappingIdentity } from "@/rpc/types";
import TooltipWrapper from "@/shared/ui/primitives/tooltip";
import type { FloatingPortalContainer } from "@/shared/ui/portal-container";
import type { BadgeVisibility } from "@/settings/types";
import { CardOverlay } from "./card-overlay";
import { useCardOverlayInViewport } from "./card-overlay-viewport";
import type { AniListId } from "@/anilist/types";
import { resolveSeerrRequestInput } from "@/content/anilist/target-provider";

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
}

function swallowEvent(event: SyntheticEvent): void {
	event.preventDefault();
	event.stopPropagation();
}

function stopOverlayEvent(event: SyntheticEvent): void {
	event.stopPropagation();
}

type SeerrCardState = Extract<
	MediaActionState,
	"unconfigured" | "checking" | "adding" | "in-library" | "error" | "can-add"
>;

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
		enabled: input.isConfigured && input.statusEnabled === true && requestInput !== null,
	});

	const actionState = getSeerrActionState({
		isConfigured: input.isConfigured,
		isRequesting: false,
		isChecking: status.isEnabled && !status.data && !status.isError,
		requestSucceeded: false,
		requestFailed: false,
		status: status.data?.status,
	});

	const run = (): void => {
		if (requestInput === null || actionState.disabled || actionState.settled) {
			return;
		}

		if (!input.isConfigured) {
			openOptionsPage({ sectionId: "seerr" });
			return;
		}

		input.onOpenModal();
	};

	return {
		state: actionState.state,
		title: actionState.label,
		disabled: actionState.disabled,
		run,
		requestInput,
		seerrTargetQuery,
		status,
	};
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
	if (action.requestInput === null) return null;

	const handleClick = (event: MouseEvent<HTMLButtonElement>): void => {
		event.preventDefault();
		event.stopPropagation();
		if (!event.isTrusted) return;

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

export function SeerrStandaloneCardOverlay({
	anilistId,
	mappedIdentities,
	isConfigured,
	observeTarget,
	badgeVisibility,
	stackDirection,
	tooltipContainer,
	onOpenModal,
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
	if (action.requestInput === null) return null;

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
				openProvider={null}
				badgeVisibility={badgeVisibility}
				stackDirection={stackDirection}
				tooltipContainer={tooltipContainer}
			/>
		</div>
	);
}
