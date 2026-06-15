/** Text button for requesting mapped movies and TV entries through Seerr. */
// src/features/seerr-request/seerr-request-button.tsx

import type { MouseEvent, ReactElement } from "react";
import { Send } from "lucide-react";
import { useSeerrMediaStatus } from "@/queries/seerr";
import { openOptionsPage } from "@/rpc/runtime-messages";
import type { RequestInSeerrInput } from "@/rpc/types";
import Button from "@/shared/ui/primitives/button";
import { getSeerrActionState } from "./seerr-action-state";

interface SeerrRequestButtonProps {
	requestInput: RequestInSeerrInput | null;
	isConfigured: boolean;
	statusEnabled?: boolean;
	portalContainer?: HTMLElement | undefined;
	onOpenModal: () => void;
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
		enabled: isConfigured && statusEnabled,
	});

	if (requestInput === null) return null;

	const actionState = getSeerrActionState({
		isConfigured,
		isRequesting: false,
		isChecking: status.isEnabled && !status.data && !status.isError,
		requestSucceeded: false,
		requestFailed: false,
		status: status.data?.status,
	});
	const handleClick = (event: MouseEvent<HTMLButtonElement>): void => {
		if (!event.isTrusted) return;

		if (!isConfigured) {
			openOptionsPage({ sectionId: "seerr" });
			return;
		}

		if (actionState.disabled || actionState.settled) return;

		onOpenModal();
	};

	return (
		<Button
			type="button"
			size="sm"
			variant="primary"
			onClick={handleClick}
			disabled={actionState.disabled}
			tooltip="Request through Seerr"
			tooltipContainer={portalContainer}
			className="h-8.75 w-full rounded-[3px] text-[14px]"
		>
			<span className="inline-flex min-w-0 items-center justify-center gap-2">
				<Send className="h-4 w-4 shrink-0" />
				<span className="truncate">{actionState.label}</span>
			</span>
		</Button>
	);
}
