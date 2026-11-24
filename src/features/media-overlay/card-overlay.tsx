/** Shared visual chrome for browse-card overlay buttons and action stacks. */
// src/features/media-overlay/card-overlay.tsx

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
	Check,
	ChevronDown,
	Plus,
	RotateCcw,
	Settings,
	SlidersHorizontal,
	TriangleAlert,
	Wrench,
} from "lucide-react";
import type {
	ComponentType,
	ReactElement,
	ReactNode,
	SVGProps,
	SyntheticEvent,
} from "react";
import {
	getArrMappingLabel,
	getArrSetupLabel,
	getOpenProviderLabel,
} from "@/features/media-action/labels";
import type { MediaActionState } from "@/features/media-action/state";
import type { BadgeVisibility } from "@/settings/types";
import type { FloatingPortalContainer } from "@/shared/ui/portal-container";
import TooltipWrapper from "@/shared/ui/primitives/tooltip";

interface CardOverlayProps {
	providerLabel: string;
	primaryState: MediaActionState;
	primaryLabel: string;
	primaryIcon?: ReactNode;
	primaryTone?: "partial";
	primaryDisabled: boolean;
	onPrimaryAction(): void;
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

function getPrimaryActionIcon(
	actionState: MediaActionState,
	primaryIcon?: ReactNode,
) {
	if (primaryIcon !== undefined) return primaryIcon;

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
			return <Check className="a2a-card-overlay__symbol" aria-hidden="true" />;
		}
		case "unmapped": {
			return <Wrench className="a2a-card-overlay__symbol" aria-hidden="true" />;
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
		case "unconfigured": {
			return (
				<Settings className="a2a-card-overlay__symbol" aria-hidden="true" />
			);
		}
		default: {
			return <Plus className="a2a-card-overlay__symbol" aria-hidden="true" />;
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

export function CardStackButton(props: {
	label: string;
	icon: ReactNode;
	modifier: "advanced" | "fix" | "external" | "seerr";
	onClick(): void;
	disabled?: boolean;
}): ReactElement {
	const { label, icon, modifier, onClick, disabled = false } = props;

	return (
		<button
			type="button"
			className={`a2a-card-overlay__action a2a-card-overlay__action--${modifier}`}
			onClick={withSwallow(onClick)}
			onMouseDown={swallowEvent}
			disabled={disabled}
			aria-disabled={disabled || undefined}
		>
			<span className="a2a-card-overlay__icon">{icon}</span>
			<span className="a2a-card-overlay__label">{label}</span>
		</button>
	);
}

function StatusColumnMenu(props: {
	providerLabel: string;
	setupAction: (() => void) | undefined;
	mappingAction: (() => void) | undefined;
	openProvider: (() => void) | null;
	hasMapping: boolean;
	container: FloatingPortalContainer | null;
}): ReactElement | null {
	const {
		providerLabel,
		setupAction,
		mappingAction,
		openProvider,
		hasMapping,
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
							{getArrSetupLabel(providerLabel)}
						</DropdownMenu.Item>
					) : null}
					{mappingAction ? (
						<DropdownMenu.Item
							className="a2a-card-overlay__menu-item"
							onSelect={mappingAction}
						>
							{getArrMappingLabel(hasMapping)}
						</DropdownMenu.Item>
					) : null}
					{openProvider ? (
						<DropdownMenu.Item
							className="a2a-card-overlay__menu-item"
							onSelect={openProvider}
						>
							{getOpenProviderLabel(providerLabel)}
						</DropdownMenu.Item>
					) : null}
				</DropdownMenu.Content>
			</DropdownMenu.Portal>
		</DropdownMenu.Root>
	);
}

interface StatusColumnOverlayProps extends CardOverlayProps {
	resolvedTooltipContainer: FloatingPortalContainer | null;
}

function StatusColumnOverlay({
	providerLabel,
	primaryState,
	primaryLabel,
	primaryDisabled,
	onPrimaryAction,
	hasMapping,
	onOpenSetup,
	onOpenMapping,
	openProvider,
	extraAction,
	resolvedTooltipContainer,
}: StatusColumnOverlayProps): ReactElement {
	const hasMenu =
		onOpenSetup !== undefined ||
		onOpenMapping !== undefined ||
		openProvider !== null;

	return (
		<fieldset
			aria-label={`${providerLabel} actions`}
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
						onClick={withSwallow(onPrimaryAction)}
						onMouseDown={swallowEvent}
						disabled={primaryDisabled}
						aria-disabled={primaryDisabled || undefined}
					>
						{primaryLabel}
					</button>
					<StatusColumnMenu
						providerLabel={providerLabel}
						setupAction={onOpenSetup}
						mappingAction={onOpenMapping}
						openProvider={openProvider}
						hasMapping={hasMapping}
						container={resolvedTooltipContainer}
					/>
				</div>
			</div>
			{extraAction}
		</fieldset>
	);
}

function ActionRowOverlay({
	providerLabel,
	primaryState,
	primaryLabel,
	primaryDisabled,
	onPrimaryAction,
	openProvider,
	openProviderIcon: OpenProviderIcon,
	extraAction,
	tooltipContainer,
}: CardOverlayProps): ReactElement {
	const externalTitle = getOpenProviderLabel(providerLabel);

	return (
		<fieldset
			aria-label={`${providerLabel} actions`}
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
			<button
				type="button"
				className="a2a-card-overlay__row-primary"
				data-state={primaryState}
				onClick={withSwallow(onPrimaryAction)}
				onMouseDown={swallowEvent}
				disabled={primaryDisabled}
				aria-disabled={primaryDisabled || undefined}
			>
				{primaryLabel}
			</button>
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
		</fieldset>
	);
}

function CardOverlayChrome(props: CardOverlayProps): ReactElement {
	const {
		providerLabel,
		primaryState,
		primaryLabel,
		primaryIcon,
		primaryTone,
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
	const setupLabel = getArrSetupLabel(providerLabel);
	const mappingLabel = getArrMappingLabel(hasMapping);
	const externalLabel = getOpenProviderLabel(providerLabel);
	if (presentation === "status-column") {
		return (
			<StatusColumnOverlay
				{...props}
				resolvedTooltipContainer={resolvedTooltipContainer}
			/>
		);
	}

	const setupAction = onOpenSetup ? (
		<CardStackButton
			label={setupLabel}
			modifier="advanced"
			icon={<SlidersHorizontal aria-hidden="true" className="h-4 w-4" />}
			onClick={onOpenSetup}
		/>
	) : null;

	const mappingAction = onOpenMapping ? (
		<CardStackButton
			label={mappingLabel}
			modifier="fix"
			icon={<Wrench aria-hidden="true" className="h-4 w-4" />}
			onClick={onOpenMapping}
		/>
	) : null;

	const externalAction =
		openProvider && OpenProviderIcon ? (
			<CardStackButton
				label={externalLabel}
				modifier="external"
				icon={<OpenProviderIcon aria-hidden="true" className="h-4 w-4" />}
				onClick={openProvider}
			/>
		) : null;

	return (
		<fieldset
			aria-label={`${providerLabel} actions`}
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
				<button
					type="button"
					className="a2a-card-overlay__quick"
					data-state={primaryState}
					data-tone={primaryTone}
					onClick={withSwallow(onPrimaryAction)}
					onMouseDown={swallowEvent}
					disabled={primaryDisabled}
					aria-disabled={primaryDisabled || undefined}
				>
					<span className="a2a-card-overlay__icon">
						{getPrimaryActionIcon(primaryState, primaryIcon)}
					</span>
					<span className="a2a-card-overlay__label">{primaryLabel}</span>
				</button>
			</div>

			{setupAction || mappingAction || externalAction || extraAction ? (
				<div
					className="a2a-card-overlay__stack"
					data-direction={stackDirection}
				>
					{stackDirection === "down" ? (
						<>
							{setupAction}
							{mappingAction}
							{externalAction}
							{extraAction}
						</>
					) : (
						<>
							{extraAction}
							{externalAction}
							{mappingAction}
							{setupAction}
						</>
					)}
				</div>
			) : null}
		</fieldset>
	);
}

export function CardOverlay(props: CardOverlayProps): ReactElement {
	return props.presentation === "action-row" ? (
		<ActionRowOverlay {...props} />
	) : (
		<CardOverlayChrome {...props} />
	);
}
