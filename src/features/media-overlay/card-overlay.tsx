/** Shared visual chrome for browse-card overlay buttons and action stacks. */
// src/features/media-overlay/card-overlay.tsx

import {
	type ComponentType,
	type ReactElement,
	type ReactNode,
	type SVGProps,
	type SyntheticEvent,
} from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
	Check,
	ChevronDown,
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
	primaryLabel?: string;
	primaryDisabled: boolean;
	onPrimaryAction(): void;
	statusPrimaryDisabled?: boolean;
	onStatusPrimaryAction?: (() => void) | undefined;
	hasMapping: boolean;
	onOpenSetup?: (() => void) | undefined;
	onOpenMapping?: (() => void) | undefined;
	openProvider: (() => void) | null;
	openProviderIcon?: ComponentType<SVGProps<SVGSVGElement>> | undefined;
	extraAction?: ReactNode;
	badgeVisibility?: BadgeVisibility | undefined;
	stackDirection?: "up" | "down" | undefined;
	tooltipContainer?: FloatingPortalContainer | undefined;
	presentation?: "status-column" | "action-row" | undefined;
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

function StatusColumnMenu(props: {
	providerLabel: string;
	setupAction: (() => void) | undefined;
	mappingAction: (() => void) | undefined;
	openProvider: (() => void) | null;
	mappingLabel: string;
	container: FloatingPortalContainer | null;
}): ReactElement | null {
	const {
		providerLabel,
		setupAction,
		mappingAction,
		openProvider,
		mappingLabel,
		container,
	} = props;
	if (!setupAction && !mappingAction && !openProvider) return null;

	return (
		<DropdownMenu.Root>
			<DropdownMenu.Trigger asChild>
				<button
					type="button"
					className="a2a-card-overlay__menu-trigger"
					aria-label={`${providerLabel} actions`}
				>
					<ChevronDown aria-hidden="true" />
				</button>
			</DropdownMenu.Trigger>
			<DropdownMenu.Portal container={container}>
				<DropdownMenu.Content
					className="a2a-card-overlay__menu-content"
					side="bottom"
					align="end"
					sideOffset={4}
				>
					{setupAction ? (
						<DropdownMenu.Item
							className="a2a-card-overlay__menu-item"
							onSelect={setupAction}
						>
							{providerLabel} options
						</DropdownMenu.Item>
					) : null}
					{mappingAction ? (
						<DropdownMenu.Item
							className="a2a-card-overlay__menu-item"
							onSelect={mappingAction}
						>
							{mappingLabel}
						</DropdownMenu.Item>
					) : null}
					{openProvider ? (
						<DropdownMenu.Item
							className="a2a-card-overlay__menu-item"
							onSelect={openProvider}
						>
							Open in {providerLabel}
						</DropdownMenu.Item>
					) : null}
				</DropdownMenu.Content>
			</DropdownMenu.Portal>
		</DropdownMenu.Root>
	);
}

interface StatusColumnOverlayProps extends CardOverlayProps {
	resolvedTooltipContainer: FloatingPortalContainer | null;
	statusMappingLabel: string;
	statusSetupAction: (() => void) | undefined;
	statusMappingAction: (() => void) | undefined;
}

function StatusColumnOverlay({
	providerLabel,
	primaryState,
	primaryTitle,
	primaryLabel,
	primaryDisabled,
	onPrimaryAction,
	statusPrimaryDisabled,
	onStatusPrimaryAction,
	openProvider,
	extraAction,
	resolvedTooltipContainer,
	statusMappingLabel,
	statusSetupAction,
	statusMappingAction,
}: StatusColumnOverlayProps): ReactElement {
	const hasMenu =
		statusSetupAction !== undefined ||
		statusMappingAction !== undefined ||
		openProvider !== null;

	return (
		<div
			className="a2a-card-overlay"
			data-state={primaryState}
			data-presentation="status-column"
			onClick={stopOverlayEvent}
			onDoubleClick={stopOverlayEvent}
			onKeyDown={stopOverlayEvent}
			onKeyUp={stopOverlayEvent}
			onMouseDown={stopOverlayEvent}
			onMouseUp={stopOverlayEvent}
			onPointerDown={stopOverlayEvent}
			onPointerUp={stopOverlayEvent}
		>
			<div className="a2a-card-overlay__status-row">
				<div
					className="a2a-card-overlay__status-main"
					data-has-menu={hasMenu || undefined}
				>
					<button
						type="button"
						className="a2a-card-overlay__status-primary"
						data-state={primaryState}
						onClick={withSwallow(onStatusPrimaryAction ?? onPrimaryAction)}
						onMouseDown={swallowEvent}
						disabled={statusPrimaryDisabled ?? primaryDisabled}
						aria-disabled={
							(statusPrimaryDisabled ?? primaryDisabled) || undefined
						}
					>
						{primaryLabel ?? primaryTitle}
					</button>
					<StatusColumnMenu
						providerLabel={providerLabel}
						setupAction={statusSetupAction}
						mappingAction={statusMappingAction}
						openProvider={openProvider}
						mappingLabel={statusMappingLabel}
						container={resolvedTooltipContainer}
					/>
				</div>
			</div>
			{extraAction}
		</div>
	);
}

function ActionRowOverlay({
	providerLabel,
	primaryState,
	primaryTitle,
	primaryLabel,
	primaryDisabled,
	onPrimaryAction,
	statusPrimaryDisabled,
	onStatusPrimaryAction,
	openProvider,
	openProviderIcon: OpenProviderIcon,
	extraAction,
	tooltipContainer,
}: CardOverlayProps): ReactElement {
	const disabled = statusPrimaryDisabled ?? primaryDisabled;
	const externalTitle = `Open in ${providerLabel}`;

	return (
		<div
			className="a2a-card-overlay"
			data-state={primaryState}
			data-presentation="action-row"
			onClick={stopOverlayEvent}
			onDoubleClick={stopOverlayEvent}
			onKeyDown={stopOverlayEvent}
			onKeyUp={stopOverlayEvent}
			onMouseDown={stopOverlayEvent}
			onMouseUp={stopOverlayEvent}
			onPointerDown={stopOverlayEvent}
			onPointerUp={stopOverlayEvent}
		>
			<TooltipWrapper
				content={primaryTitle}
				side="top"
				align="center"
				sideOffset={6}
				container={tooltipContainer ?? null}
				showArrow={false}
			>
				<button
					type="button"
					className="a2a-card-overlay__row-primary"
					data-state={primaryState}
					aria-label={primaryTitle}
					onClick={withSwallow(onStatusPrimaryAction ?? onPrimaryAction)}
					onMouseDown={swallowEvent}
					disabled={disabled}
					aria-disabled={disabled || undefined}
				>
					{primaryLabel ?? primaryTitle}
				</button>
			</TooltipWrapper>
			{openProvider && OpenProviderIcon ? (
				<TooltipWrapper
					content={externalTitle}
					side="top"
					align="center"
					sideOffset={6}
					container={tooltipContainer ?? null}
					showArrow={false}
				>
					<button
						type="button"
						className="a2a-card-overlay__row-external"
						aria-label={externalTitle}
						onClick={withSwallow(openProvider)}
						onMouseDown={swallowEvent}
					>
						<OpenProviderIcon aria-hidden="true" />
					</button>
				</TooltipWrapper>
			) : null}
			{extraAction}
		</div>
	);
}

function CardOverlayChrome(props: CardOverlayProps): ReactElement {
	const {
		providerLabel,
		primaryState,
		primaryTitle,
		primaryDisabled,
		onPrimaryAction,
		hasMapping,
		onOpenSetup,
		onOpenMapping,
		openProvider,
		openProviderIcon: OpenProviderIcon,
		extraAction,
		badgeVisibility = "always",
		stackDirection = "up",
		tooltipContainer,
		presentation,
	} = props;
	const resolvedTooltipContainer =
		tooltipContainer ??
		(typeof document === "undefined" ? null : document.body);
	const manualMappingLabel = hasMapping
		? "Update mapping manually"
		: "Find match manually";
	const statusMappingLabel = hasMapping ? "Update mapping" : "Find match";
	const statusSetupAction = hasMapping ? onOpenSetup : undefined;
	const statusMappingAction =
		primaryState === "unconfigured" ? undefined : onOpenMapping;
	if (presentation === "status-column") {
		return (
			<StatusColumnOverlay
				{...props}
				resolvedTooltipContainer={resolvedTooltipContainer}
				statusMappingLabel={statusMappingLabel}
				statusSetupAction={statusSetupAction}
				statusMappingAction={statusMappingAction}
			/>
		);
	}

	const setupAction = onOpenSetup ? (
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

	const mappingAction = onOpenMapping ? (
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
						aria-label={primaryTitle}
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

export function CardOverlay(props: CardOverlayProps): ReactElement {
	return props.presentation === "action-row" ? (
		<ActionRowOverlay {...props} />
	) : (
		<CardOverlayChrome {...props} />
	);
}
