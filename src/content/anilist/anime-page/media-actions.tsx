/** Anime-page action group for provider quick add, deep links, and manual mapping entry points. */
// src/content/anilist/anime-page/media-actions.tsx

import React from "react";
import Button from "@/shared/ui/primitives/button";
import { SquareArrowOutUpRight, ChevronDown } from "lucide-react";
import { Dropdown, DropdownItem } from "@/shared/ui/primitives/dropdown";
import type { Provider } from "@/providers/types";
import { getProviderLabel } from "@/providers/provider-labels";
import type { MediaActionState } from "@/features/media-action/state";

interface MediaActionsProps {
	provider: Provider;
	state: MediaActionState;
	errorSource: "status" | "add" | null;
	hasMapping: boolean;
	disabled: boolean;
	externalHref: string | null;
	onPrimaryAction: () => void;
	onOpenSetup: () => void;
	onOpenMapping: () => void;
	portalContainer?: HTMLElement | undefined;
}

function getPrimaryButtonText(input: {
	providerLabel: string;
	state: MediaActionState;
	errorSource: "status" | "add" | null;
}): string {
	const { providerLabel, state, errorSource } = input;

	switch (state) {
		case "unconfigured": {
			return `Configure ${providerLabel}`;
		}
		case "checking": {
			return `Checking ${providerLabel}...`;
		}
		case "in-library": {
			return `In ${providerLabel}`;
		}
		case "can-add": {
			return `Add to ${providerLabel}`;
		}
		case "unmapped": {
			return "Find match";
		}
		case "unknown": {
			return "Find match";
		}
		case "adding": {
			return "Adding...";
		}
		case "error": {
			return errorSource === "add" ? "Retry add" : "Retry check";
		}
		default: {
			return providerLabel;
		}
	}
}

function getPrimaryButtonTooltip(input: {
	providerLabel: string;
	state: MediaActionState;
	errorSource: "status" | "add" | null;
}): string | undefined {
	const { providerLabel, state, errorSource } = input;

	switch (state) {
		case "unconfigured": {
			return `Open ${providerLabel} settings to continue.`;
		}
		case "checking": {
			return `Checking ${providerLabel} status...`;
		}
		case "in-library": {
			return `Open ${providerLabel} options`;
		}
		case "unmapped": {
			return `No automatic ${providerLabel} match was found. Search manually.`;
		}
		case "unknown": {
			return `Unable to determine ${providerLabel} status right now. Search manually.`;
		}
		case "adding": {
			return `Submitting add request to ${providerLabel}...`;
		}
		case "error": {
			return errorSource === "add"
				? `Unable to add this title to ${providerLabel}. Retry the add.`
				: `Unable to determine ${providerLabel} status right now. Retry the check.`;
		}
		default: {
			return undefined;
		}
	}
}

function getLoadingText(input: {
	providerLabel: string;
	state: MediaActionState;
}): string {
	return input.state === "adding"
		? "Adding..."
		: `Checking ${input.providerLabel}...`;
}

const MediaActionGroup: React.FC<React.PropsWithChildren> = ({ children }) => (
	<div
		className="relative flex items-stretch rounded-[3px] overflow-hidden"
		role="group"
		style={{ width: "100%" }}
	>
		{children}
	</div>
);

const MediaActions: React.FC<MediaActionsProps> = ({
	provider,
	state,
	errorSource,
	hasMapping,
	disabled,
	externalHref,
	onPrimaryAction,
	onOpenSetup,
	onOpenMapping,
	portalContainer,
}) => {
	const providerLabel = getProviderLabel(provider);
	const isLoading = state === "checking" || state === "adding";
	const showSetupAction = hasMapping;
	const showMappingAction = state !== "unconfigured";
	const showExternalAction = state !== "unconfigured" && externalHref !== null;
	const hasMenu = showSetupAction || showMappingAction;
	const primaryDisabled = state === "in-library" ? false : disabled;
	const handlePrimaryAction =
		state === "in-library" ? onOpenSetup : onPrimaryAction;
	const manualMappingLabel = hasMapping
		? "Update mapping manually"
		: "Find match manually";
	const primaryButtonText = getPrimaryButtonText({
		providerLabel,
		state,
		errorSource,
	});
	const primaryButtonTooltip = getPrimaryButtonTooltip({
		providerLabel,
		state,
		errorSource,
	});

	return (
		<div
			className={`grid ${showExternalAction && externalHref ? "grid-cols-[1fr_auto] gap-3.75" : "grid-cols-1 gap-0"} items-start w-full`}
		>
			<MediaActionGroup>
				<Button
					data-testid="a2a-main-action-button"
					size="sm"
					onClick={handlePrimaryAction}
					isLoading={isLoading}
					disabled={primaryDisabled}
					{...(primaryButtonTooltip ? { tooltip: primaryButtonTooltip } : {})}
					tooltipContainer={portalContainer}
					className={`h-8.75 text-[14px] text-center px-0 pl-2.5 ${
						hasMenu
							? "flex-1 w-[calc(100%-34px)] rounded-none"
							: "w-full rounded-[3px]"
					}`}
					loadingText={getLoadingText({ providerLabel, state })}
				>
					{primaryButtonText}
				</Button>

				{hasMenu ? (
					<Dropdown
						container={portalContainer ?? null}
						trigger={
							<Button
								data-testid="a2a-actions-dropdown"
								size="icon"
								variant="primary"
								tooltipContainer={portalContainer}
								className="relative rounded-none h-8.75 w-8.5 after:content-[''] after:absolute after:inset-0 after:bg-[rgba(255,255,255,0.14)] after:pointer-events-none"
								aria-label="Actions"
							>
								<ChevronDown className="h-4 w-4" />
							</Button>
						}
					>
						{showSetupAction ? (
							<DropdownItem onSelect={onOpenSetup}>
								{providerLabel} options
							</DropdownItem>
						) : null}
						{showMappingAction ? (
							<DropdownItem onSelect={onOpenMapping}>
								{manualMappingLabel}
							</DropdownItem>
						) : null}
					</Dropdown>
				) : null}
			</MediaActionGroup>

			{showExternalAction && externalHref ? (
				<Button
					asChild
					size="icon"
					variant="primary"
					tooltip={`Open in ${providerLabel}`}
					tooltipContainer={portalContainer}
					className="h-8.75 w-8.75 rounded-[3px]"
				>
					<a href={externalHref} target="_blank" rel="noopener noreferrer">
						<SquareArrowOutUpRight className="h-4 w-4" />
					</a>
				</Button>
			) : null}
		</div>
	);
};

export default MediaActions;
