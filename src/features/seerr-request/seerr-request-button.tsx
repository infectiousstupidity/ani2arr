/** Text button for requesting mapped movies and TV entries through Seerr. */
// src/features/seerr-request/seerr-request-button.tsx

import type { MouseEvent, ReactElement } from "react";
import { useSeerrMediaStatus } from "@/queries/seerr";
import { openSeerrPage } from "@/rpc/provider-page";
import { openOptionsPage } from "@/rpc/runtime-messages";
import type { RequestInSeerrInput } from "@/rpc/types";
import Button from "@/shared/ui/primitives/button";
import { SeerrIcon } from "@/options-page/components/icons";
import { getSeerrActionState } from "./seerr-action-state";

interface SeerrRequestButtonProps {
	requestInput: RequestInSeerrInput | null;
	isConfigured: boolean;
	statusEnabled?: boolean;
	portalContainer?: HTMLElement | undefined;
	onOpenModal: () => void;
}

interface SeerrOpenButtonProps {
	requestInput: RequestInSeerrInput | null;
	isConfigured: boolean;
	portalContainer?: HTMLElement | undefined;
}

function isTrustedClick(event: MouseEvent<HTMLButtonElement>): boolean {
	return event.nativeEvent.isTrusted === true || event.isTrusted === true;
}

export function SeerrRequestButton({
	requestInput,
	isConfigured,
	statusEnabled = true,
	portalContainer,
	onOpenModal,
}: SeerrRequestButtonProps): ReactElement | null {
	const status = useSeerrMediaStatus({
		requestInput,
		enabled: isConfigured && statusEnabled && requestInput !== null,
	});

	const hasTarget = requestInput !== null;

	const actionState = hasTarget
		? getSeerrActionState({
				isConfigured,
				isRequesting: false,
				isChecking: status.isEnabled && !status.data && !status.isError,
				requestSucceeded: false,
				requestFailed: false,
				status: status.data?.status,
			})
		: {
				state: isConfigured ? "can-add" : "unconfigured",
				label: isConfigured ? "Choose Seerr target" : "Configure Seerr",
				disabled: false,
				settled: false,
			} as const;

	const handleClick = (event: MouseEvent<HTMLButtonElement>): void => {
		if (!isTrustedClick(event)) return;

		if (!isConfigured) {
			openOptionsPage({ sectionId: "seerr" });
			return;
		}

		if (actionState.disabled) return;

		onOpenModal();
	};

	return (
		<Button
			type="button"
			size="sm"
			variant="primary"
			onClick={handleClick}
			disabled={actionState.disabled}
			tooltip={actionState.label}
			tooltipContainer={portalContainer}
			className="h-8.75 w-full rounded-[3px] text-[14px]"
		>
			<span className="inline-flex min-w-0 items-center justify-center gap-2">
				<span className="truncate">{actionState.label}</span>
			</span>
		</Button>
	);
}

export function SeerrOpenButton({
	requestInput,
	isConfigured,
	portalContainer,
}: SeerrOpenButtonProps): ReactElement | null {
	if (!isConfigured || requestInput === null) return null;

	const handleClick = (event: MouseEvent<HTMLButtonElement>): void => {
		if (!isTrustedClick(event)) return;

		openSeerrPage({
			mediaType: requestInput.mediaType,
			tmdbId: requestInput.tmdbId,
		});
	};

	return (
		<Button
			type="button"
			size="icon"
			variant="primary"
			tooltip="Open in Seerr"
			tooltipContainer={portalContainer}
			className="h-8.75 w-8.75 rounded-[3px]"
			onClick={handleClick}
		>
			<SeerrIcon className="h-4 w-4" />
		</Button>
	);
}
