/** Shared visual chrome for browse-card overlay buttons and action stacks. */
// src/features/media-overlay/card-overlay.tsx

import {
	type ComponentType,
	type ReactElement,
	type ReactNode,
	type SVGProps,
	type SyntheticEvent,
} from "react";
import {
	Check,
	Plus,
	RotateCcw,
	SlidersHorizontal,
	TriangleAlert,
	Wrench,
} from "lucide-react";
import TooltipWrapper from "@/shared/ui/primitives/tooltip";
import type { FloatingPortalContainer } from "@/shared/ui/portal-container";
import type { MediaActionState } from "@/features/media-action/state";
import type { BadgeVisibility } from "@/settings/types";

interface CardOverlayProps {
	providerLabel: string;
	primaryState: MediaActionState;
	primaryTitle: string;
	primaryAriaLabel: string;
	primaryDisabled: boolean;
	onPrimaryAction(): void;
	hasMapping: boolean;
	showSetupAction: boolean;
	onOpenSetup(): void;
	showMappingAction: boolean;
	onOpenMapping(): void;
	openProvider: (() => void) | null;
	openProviderIcon?: ComponentType<SVGProps<SVGSVGElement>> | undefined;
	extraAction?: ReactNode;
	badgeVisibility?: BadgeVisibility | undefined;
	stackDirection?: "up" | "down" | undefined;
	tooltipContainer?: FloatingPortalContainer | undefined;
}

function getPrimaryActionIcon(actionState: MediaActionState) {
	switch (actionState) {
		case "checking":
		case "adding": {
			return (
				<RotateCcw
					className="a2a-card-overlay__symbol a2a-rotate"
					aria-hidden="true"
				/>
			);
		}
		case "in-library": {
			return (
				<Check
					className="a2a-card-overlay__symbol"
					aria-hidden="true"
				/>
			);
		}
		case "unmapped": {
			return (
				<Wrench
					className="a2a-card-overlay__symbol"
					aria-hidden="true"
				/>
			);
		}
		case "unknown":
		case "error": {
			return (
				<TriangleAlert
					className="a2a-card-overlay__symbol"
					aria-hidden="true"
				/>
			);
		}
		default: {
			return (
				<Plus
					className="a2a-card-overlay__symbol"
					aria-hidden="true"
				/>
			);
		}
	}
}

function withSwallow<T extends SyntheticEvent>(fn?: () => void) {
	return (event: T) => {
		event.preventDefault();
		event.stopPropagation();
		if (!event.isTrusted) return;

		fn?.();
	};
}

function stopOverlayEvent(event: SyntheticEvent): void {
	event.stopPropagation();
}

function swallowEvent(event: SyntheticEvent): void {
	event.preventDefault();
	event.stopPropagation();
}

export function CardOverlay({
	providerLabel,
	primaryState,
	primaryTitle,
	primaryAriaLabel,
	primaryDisabled,
	onPrimaryAction,
	hasMapping,
	showSetupAction,
	onOpenSetup,
	showMappingAction,
	onOpenMapping,
	openProvider,
	openProviderIcon: OpenProviderIcon,
	extraAction,
	badgeVisibility = "always",
	stackDirection = "up",
	tooltipContainer,
}: CardOverlayProps): ReactElement {
	const resolvedTooltipContainer =
		tooltipContainer ?? (typeof document === "undefined" ? null : document.body);
	const manualMappingLabel = hasMapping
		? "Update mapping manually"
		: "Find match manually";

	const setupAction = showSetupAction ? (
		<TooltipWrapper
			content={`Open ${providerLabel} setup`}
			side="right"
			align="center"
			sideOffset={6}
			container={resolvedTooltipContainer}
			showArrow={false}
		>
			<button
				type="button"
				className="a2a-card-overlay__action a2a-card-overlay__action--advanced"
				aria-label={`Open ${providerLabel} setup`}
				onClick={withSwallow(onOpenSetup)}
				onMouseDown={swallowEvent}
			>
				<SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
			</button>
		</TooltipWrapper>
	) : null;

	const mappingAction = showMappingAction ? (
		<TooltipWrapper
			content={manualMappingLabel}
			side="right"
			align="center"
			sideOffset={6}
			container={resolvedTooltipContainer}
			showArrow={false}
		>
			<button
				type="button"
				className="a2a-card-overlay__action a2a-card-overlay__action--fix"
				aria-label={manualMappingLabel}
				onClick={withSwallow(onOpenMapping)}
				onMouseDown={swallowEvent}
			>
				<Wrench aria-hidden="true" className="h-4 w-4" />
			</button>
		</TooltipWrapper>
	) : null;

	const externalAction = openProvider && OpenProviderIcon ? (
		<TooltipWrapper
			content={`Open in ${providerLabel}`}
			side="right"
			align="center"
			sideOffset={6}
			container={resolvedTooltipContainer}
			showArrow={false}
		>
			<button
				type="button"
				className="a2a-card-overlay__action a2a-card-overlay__action--external"
				aria-label={`Open in ${providerLabel}`}
				onClick={withSwallow(openProvider)}
				onMouseDown={swallowEvent}
			>
				<OpenProviderIcon aria-hidden="true" className="h-4 w-4" />
			</button>
		</TooltipWrapper>
	) : null;

	return (
		<div
			className="a2a-card-overlay"
			data-state={primaryState}
			data-visibility={badgeVisibility}
			onClick={stopOverlayEvent}
			onDoubleClick={stopOverlayEvent}
			onKeyDown={stopOverlayEvent}
			onKeyUp={stopOverlayEvent}
			onMouseDown={stopOverlayEvent}
			onMouseUp={stopOverlayEvent}
			onPointerDown={stopOverlayEvent}
			onPointerUp={stopOverlayEvent}
		>
			<div className="a2a-card-overlay__anchor-wrap">
				<TooltipWrapper
					content={primaryTitle}
					side="right"
					align="center"
					sideOffset={6}
					container={resolvedTooltipContainer}
					showArrow={false}
				>
					<button
						type="button"
						className="a2a-card-overlay__quick"
						data-state={primaryState}
						aria-label={primaryAriaLabel}
						onClick={withSwallow(onPrimaryAction)}
						onMouseDown={swallowEvent}
						disabled={primaryDisabled}
						aria-disabled={primaryDisabled || undefined}
					>
						{getPrimaryActionIcon(primaryState)}
					</button>
				</TooltipWrapper>
			</div>

			{setupAction || mappingAction || externalAction || extraAction ? (
				<div
					className="a2a-card-overlay__stack"
					data-direction={stackDirection}
				>
					{stackDirection === "down" ? (
						<>{setupAction}{mappingAction}{externalAction}{extraAction}</>
					) : (
						<>{extraAction}{externalAction}{mappingAction}{setupAction}</>
					)}
				</div>
			) : null}
		</div>
	);
}
