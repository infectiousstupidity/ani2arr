/** Shared visual chrome for browse-card overlay buttons and action stacks. */
// src/features/media-overlay/card-overlay.tsx

import {
	useEffect,
	useRef,
	useState,
	type ReactElement,
	type SyntheticEvent,
} from "react";
import {
	Check,
	Plus,
	RotateCcw,
	SlidersHorizontal,
	SquareArrowOutUpRight,
	TriangleAlert,
	Wrench,
} from "lucide-react";
import TooltipWrapper from "@/shared/ui/primitives/tooltip";
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
	externalHref: string | null;
	badgeVisibility?: BadgeVisibility | undefined;
	stackDirection?: "up" | "down" | undefined;
	tooltipContainer?: HTMLElement | ShadowRoot | null | undefined;
}

function getPrimaryActionIcon(actionState: MediaActionState) {
	switch (actionState) {
		case "checking":
		case "adding": { return <RotateCcw className="a2a-card-overlay__symbol a2a-rotate" aria-hidden="true" />; }
		case "in-library": { return <Check className="a2a-card-overlay__symbol" aria-hidden="true" />; }
		case "unmapped": { return <Wrench className="a2a-card-overlay__symbol" aria-hidden="true" />; }
		case "unknown":
		case "error": { return <TriangleAlert className="a2a-card-overlay__symbol" aria-hidden="true" />; }
		default: { return <Plus className="a2a-card-overlay__symbol" aria-hidden="true" />; }
	}
}

function withSwallow<T extends SyntheticEvent>(fn?: () => void) {
	return (event: T) => {
		event.preventDefault();
		event.stopPropagation();
		fn?.();
	};
}

function stopOverlayEvent(event: SyntheticEvent): void {
	event.stopPropagation();
}

function openExternalHref(href: string): void {
	try { window.open(href, "_blank", "noopener"); } catch { /* ignore */ }
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
	externalHref,
	badgeVisibility = "always",
	stackDirection = "up",
	tooltipContainer,
}: CardOverlayProps): ReactElement {
	const [stackOpen, setStackOpen] = useState(false);
	const closeTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
	const resolvedTooltipContainer =
		tooltipContainer ?? (typeof document === "undefined" ? null : document.body);
	const manualMappingLabel = hasMapping ? "Update mapping manually" : "Find match manually";

	const swallow = withSwallow();
	const openStack = () => {
		if (closeTimerRef.current !== null) {
			globalThis.clearTimeout(closeTimerRef.current);
			closeTimerRef.current = null;
		}
		setStackOpen(true);
	};
	const scheduleCloseStack = () => {
		if (closeTimerRef.current !== null) {
			globalThis.clearTimeout(closeTimerRef.current);
		}
		closeTimerRef.current = globalThis.setTimeout(() => {
			setStackOpen(false);
			closeTimerRef.current = null;
		}, 160);
	};

	useEffect(() => {
		return () => {
			if (closeTimerRef.current !== null) {
				globalThis.clearTimeout(closeTimerRef.current);
			}
		};
	}, []);

	const setupAction = showSetupAction ? (
		<TooltipWrapper content={`Open ${providerLabel} setup`} side="right" align="center" sideOffset={6} container={resolvedTooltipContainer} showArrow={false}>
			<button
				type="button"
				className="a2a-card-overlay__action a2a-card-overlay__action--advanced"
				aria-label={`Open ${providerLabel} setup`}
				onClick={withSwallow(onOpenSetup)}
				onMouseDown={swallow}
			>
				<SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
			</button>
		</TooltipWrapper>
	) : null;

	const mappingAction = showMappingAction ? (
		<TooltipWrapper content={manualMappingLabel} side="right" align="center" sideOffset={6} container={resolvedTooltipContainer} showArrow={false}>
			<button
				type="button"
				className="a2a-card-overlay__action a2a-card-overlay__action--fix"
				aria-label={manualMappingLabel}
				onClick={withSwallow(onOpenMapping)}
				onMouseDown={swallow}
			>
				<Wrench aria-hidden="true" className="h-4 w-4" />
			</button>
		</TooltipWrapper>
	) : null;

	const externalAction = externalHref ? (
		<TooltipWrapper content={`Open in ${providerLabel}`} side="right" align="center" sideOffset={6} container={resolvedTooltipContainer} showArrow={false}>
			<button
				type="button"
				className="a2a-card-overlay__action a2a-card-overlay__action--external"
				aria-label={`Open in ${providerLabel}`}
				onClick={withSwallow(() => openExternalHref(externalHref))}
				onMouseDown={swallow}
			>
				<SquareArrowOutUpRight aria-hidden="true" className="h-4 w-4" />
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
			onMouseEnter={openStack}
			onMouseLeave={scheduleCloseStack}
		>
			<div
				className="a2a-card-overlay__anchor-wrap"
				onMouseEnter={openStack}
				onMouseLeave={scheduleCloseStack}
			>
				<TooltipWrapper content={primaryTitle} side="right" align="center" sideOffset={6} container={resolvedTooltipContainer} showArrow={false}>
					<button
						type="button"
						className="a2a-card-overlay__quick"
						data-state={primaryState}
						aria-label={primaryAriaLabel}
						onClick={withSwallow(onPrimaryAction)}
						onMouseDown={swallow}
						disabled={primaryDisabled}
						aria-disabled={primaryDisabled || undefined}
					>
						{getPrimaryActionIcon(primaryState)}
					</button>
				</TooltipWrapper>
			</div>

			{setupAction || mappingAction || externalAction ? (
				<div
					className="a2a-card-overlay__stack"
					data-open={stackOpen || undefined}
					data-direction={stackDirection}
					onMouseEnter={openStack}
					onMouseLeave={scheduleCloseStack}
				>
					{stackDirection === "down" ? (
						<>{setupAction}{mappingAction}{externalAction}</>
					) : (
						<>{externalAction}{mappingAction}{setupAction}</>
					)}
				</div>
			) : null}
		</div>
	);
}
