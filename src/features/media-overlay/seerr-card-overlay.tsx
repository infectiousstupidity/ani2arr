/** Seerr browse-card request action backed by mapped movie and TV IDs. */
// src/features/media-overlay/seerr-card-overlay.tsx

import {
	Ban,
	Check,
	CircleDashed,
	RotateCcw,
	Send,
	Wrench,
} from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useState } from "react";
import type { AniListMediaHint } from "@/anilist/types";
import {
	type SeerrMediaAction,
	useSeerrMediaAction,
} from "@/features/media-action/use-seerr-media-action";
import { getOpenProviderLabel } from "@/features/media-action/labels";
import { SeerrIcon } from "@/features/provider-ui/provider-icons";
import type { SeerrActionState } from "@/features/seerr-request/seerr-action-state";
import type { SourceIdentity } from "@/mapping/source-identity";
import type { SeerrMediaStatus, SeerrMediaType } from "@/providers/seerr/types";
import type { BadgeVisibility } from "@/settings/types";
import type { FloatingPortalContainer } from "@/shared/ui/portal-container";
import { CardOverlay, CardStackButton } from "./card-overlay";
import { useCardOverlayInViewport } from "./card-overlay-viewport";

interface SeerrCardActionProps {
	source: SourceIdentity;
	title: string;
	metadata: AniListMediaHint | null;
	mediaType: SeerrMediaType | null;
	isConfigured: boolean;
	observeTarget?: Element | null | undefined;
	/** Hold the status fetch while the card's provider route is still loading. */
	statusBlocked?: boolean | undefined;
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

type SeerrCardState = SeerrActionState["state"];

type SeerrCardAction = SeerrMediaAction;

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
		case "unmapped": {
			return <Wrench className="h-4 w-4" aria-hidden="true" />;
		}
		case "unknown": {
			return <Ban className="h-4 w-4" aria-hidden="true" />;
		}
		default: {
			return <Send className="h-4 w-4" aria-hidden="true" />;
		}
	}
}

/** Overrides the default badge icon where Seerr differs from the arr states. */
function getSeerrPrimaryIcon(action: SeerrCardAction): ReactNode {
	if (action.visualStatus === "partial") {
		return (
			<CircleDashed className="a2a-card-overlay__symbol" aria-hidden="true" />
		);
	}

	if (action.status.state === "unknown") {
		return <Ban className="a2a-card-overlay__symbol" aria-hidden="true" />;
	}

	return undefined;
}

function SeerrStackRequestButton(props: {
	action: SeerrCardAction;
}): ReactElement {
	const { action } = props;

	return (
		<CardStackButton
			label={action.status.label}
			modifier="seerr"
			icon={getSeerrCardIcon({
				state: action.status.state,
				status: action.visualStatus,
			})}
			onClick={action.runPrimaryAction}
			disabled={action.status.disabled}
		/>
	);
}

function SeerrStackOpenButton(props: {
	action: SeerrCardAction;
}): ReactElement | null {
	const { openProvider } = props.action;
	if (!openProvider) return null;

	return (
		<CardStackButton
			label={getOpenProviderLabel("Seerr")}
			modifier="external"
			icon={<SeerrIcon className="h-4 w-4" aria-hidden="true" />}
			onClick={openProvider}
		/>
	);
}

export function SeerrCardStackActions({
	source,
	title,
	metadata,
	mediaType,
	isConfigured,
	observeTarget,
	tooltipContainer,
	onOpenModal,
	stackDirection = "up",
	presentation,
	statusBlocked,
}: SeerrCardStackActionsProps): ReactElement | null {
	const isInViewport = useCardOverlayInViewport(observeTarget);
	const [engaged, setEngaged] = useState(false);
	const isInline =
		presentation === "status-column" || presentation === "action-row";

	useEffect(() => {
		if (isInline || engaged || !observeTarget) return;
		const target = observeTarget.closest(".media-card") ?? observeTarget;
		if (target.matches(":hover, :focus-within")) {
			// Capture engagement that happened before the listeners were attached.
			// eslint-disable-next-line react-hooks/set-state-in-effect
			setEngaged(true);
			return;
		}
		const engage = () => setEngaged(true);
		target.addEventListener("pointerenter", engage);
		target.addEventListener("focusin", engage);
		return () => {
			target.removeEventListener("pointerenter", engage);
			target.removeEventListener("focusin", engage);
		};
	}, [engaged, isInline, observeTarget]);

	const action = useSeerrMediaAction({
		source,
		title,
		metadata,
		mediaType,
		isConfigured,
		enabled: isInViewport && (isInline || engaged),
		statusBlocked: statusBlocked === true,
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
				primaryLabel={action.status.label}
				primaryIcon={getSeerrPrimaryIcon(action)}
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

	const requestButton = <SeerrStackRequestButton action={action} />;
	const openButton = <SeerrStackOpenButton action={action} />;

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
	statusBlocked,
}: SeerrStandaloneCardOverlayProps): ReactElement | null {
	const isInViewport = useCardOverlayInViewport(observeTarget);
	const action = useSeerrMediaAction({
		source,
		title,
		metadata,
		mediaType,
		isConfigured,
		enabled: isInViewport,
		statusBlocked: statusBlocked === true,
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
			primaryLabel={action.status.label}
			primaryIcon={getSeerrPrimaryIcon(action)}
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
