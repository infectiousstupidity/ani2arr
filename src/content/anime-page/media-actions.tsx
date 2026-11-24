/** Anime-page action group for provider quick add, deep links, and manual mapping entry points. */
// src/content/anime-page/media-actions.tsx

import React, { type MouseEvent } from "react";
import Button from "@/shared/ui/primitives/button";
import { ChevronDown } from "lucide-react";
import { Dropdown, DropdownItem } from "@/shared/ui/primitives/dropdown";
import type { Provider } from "@/providers/types";
import { getProviderLabel } from "@/providers/provider-labels";
import {
	getArrMappingLabel,
	getArrPrimaryLabel,
	getArrPrimaryTooltip,
	getArrSetupLabel,
	getOpenProviderLabel,
} from "@/features/media-action/labels";
import type { MediaActionState } from "@/features/media-action/state";
import { RadarrIcon, SonarrIcon } from "@/features/provider-ui/provider-icons";

interface MediaActionsProps {
	provider: Provider;
	compact?: boolean;
	state: MediaActionState;
	errorSource: "status" | "add" | null;
	hasMapping: boolean;
	canQuickAdd: boolean;
	disabled: boolean;
	openProvider: (() => void) | null;
	onPrimaryAction: () => void;
	onOpenSetup?: (() => void) | undefined;
	onOpenMapping?: (() => void) | undefined;
	portalContainer?: HTMLElement | undefined;
}

const MEDIA_ACTION_CLASS_NAMES = {
	compact: {
		externalGap: "gap-2",
		primary: "h-6.5 text-[11px] pl-2",
		menuWidth: "w-[calc(100%-26px)]",
		dropdown: "h-6.5 w-6.5",
		chevron: "h-3 w-3",
		external: "h-6.5 w-6.5",
		providerIcon: "h-3.5 w-3.5",
	},
	default: {
		externalGap: "gap-3.75",
		primary: "h-8.75 text-[14px] pl-2.5",
		menuWidth: "w-[calc(100%-34px)]",
		dropdown: "h-8.75 w-8.5",
		chevron: "h-4 w-4",
		external: "h-8.75 w-8.75",
		providerIcon: "h-4 w-4",
	},
} as const;

function renderProviderOpenIcon(
	provider: Provider,
	className: string,
): React.ReactElement {
	switch (provider) {
		case "sonarr": {
			return <SonarrIcon className={className} />;
		}
		case "radarr": {
			return <RadarrIcon className={className} />;
		}
	}
}

function getMenuActions(input: {
	state: MediaActionState;
	hasMapping: boolean;
	onOpenSetup: (() => void) | undefined;
	onOpenMapping: (() => void) | undefined;
}): {
	setup: (() => void) | undefined;
	mapping: (() => void) | undefined;
} {
	const mappingIsPrimary = ["unconfigured", "unmapped", "unknown"].includes(
		input.state,
	);

	return {
		setup: input.hasMapping ? input.onOpenSetup : undefined,
		mapping: mappingIsPrimary ? undefined : input.onOpenMapping,
	};
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
	compact = false,
	state,
	errorSource,
	hasMapping,
	canQuickAdd,
	disabled,
	openProvider,
	onPrimaryAction,
	onOpenSetup,
	onOpenMapping,
	portalContainer,
}) => {
	const classNames = MEDIA_ACTION_CLASS_NAMES[compact ? "compact" : "default"];
	const providerLabel = getProviderLabel(provider);
	const isLoading = state === "checking" || state === "adding";
	const menuActions = getMenuActions({
		state,
		hasMapping,
		onOpenSetup,
		onOpenMapping,
	});
	const showExternalAction = state !== "unconfigured" && openProvider !== null;
	const hasMenu =
		menuActions.setup !== undefined || menuActions.mapping !== undefined;
	const handlePrimaryClick = (event: MouseEvent<HTMLButtonElement>): void => {
		if (!event.isTrusted) return;

		onPrimaryAction();
	};
	const handleProviderOpenClick = (
		event: MouseEvent<HTMLButtonElement>,
	): void => {
		if (!event.isTrusted) return;

		openProvider?.();
	};
	const labelInput = { providerLabel, state, errorSource, canQuickAdd };
	const primaryButtonText = getArrPrimaryLabel(labelInput);

	const primaryTooltip = getArrPrimaryTooltip(labelInput);

	return (
		<div
			className={`grid ${showExternalAction ? `grid-cols-[1fr_auto] ${classNames.externalGap}` : "grid-cols-1 gap-0"} items-start w-full`}
		>
			<MediaActionGroup>
				<Button
					data-testid="a2a-main-action-button"
					size="sm"
					onClick={handlePrimaryClick}
					isLoading={isLoading}
					disabled={disabled}
					{...(primaryTooltip === undefined ? {} : { tooltip: primaryTooltip })}
					tooltipContainer={portalContainer}
					className={`${classNames.primary} text-center px-0 ${
						hasMenu
							? `flex-1 ${classNames.menuWidth} rounded-none`
							: "w-full rounded-[3px]"
					}`}
					loadingText={primaryButtonText}
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
								className={`relative rounded-none ${classNames.dropdown} after:content-[''] after:absolute after:inset-0 after:bg-[rgba(255,255,255,0.14)] after:pointer-events-none`}
								aria-label="Actions"
							>
								<ChevronDown className={classNames.chevron} />
							</Button>
						}
					>
						{menuActions.setup ? (
							<DropdownItem onSelect={menuActions.setup}>
								{getArrSetupLabel(providerLabel)}
							</DropdownItem>
						) : null}
						{menuActions.mapping ? (
							<DropdownItem onSelect={menuActions.mapping}>
								{getArrMappingLabel(hasMapping)}
							</DropdownItem>
						) : null}
					</Dropdown>
				) : null}
			</MediaActionGroup>

			{showExternalAction ? (
				<Button
					type="button"
					size="icon"
					variant="primary"
					tooltip={getOpenProviderLabel(providerLabel)}
					tooltipContainer={portalContainer}
					className={`${classNames.external} rounded-[3px]`}
					onClick={handleProviderOpenClick}
				>
					{renderProviderOpenIcon(provider, classNames.providerIcon)}
				</Button>
			) : null}
		</div>
	);
};

export default MediaActions;
