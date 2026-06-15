/** Seerr modal footer actions for request and target correction views. */
// src/features/media-modal/seerr/seerr-footer.tsx

import Button from "@/shared/ui/primitives/button";
import {
	AUX_BUTTON_CLASS,
	FOOTER_BUTTON_CLASS,
} from "./seerr-modal.constants";

type SeerrView = "request" | "change-target";

export function SeerrFooter(props: {
	view: SeerrView;
	isManualTarget: boolean;
	canSaveTvTarget: boolean;
	canRequest: boolean;
	isBusy: boolean;
	isRequesting: boolean;
	requestLabel: string;
	onClose: () => void;
	onChangeTarget: () => void;
	onBackToRequest: () => void;
	onClearManualTarget: () => void;
	onSaveTvTarget: () => void;
	onRequest: () => void;
}): React.JSX.Element {
	const {
		view,
		isManualTarget,
		canSaveTvTarget,
		canRequest,
		isBusy,
		isRequesting,
		requestLabel,
		onClose,
		onChangeTarget,
		onBackToRequest,
		onClearManualTarget,
		onSaveTvTarget,
		onRequest,
	} = props;

	return (
		<footer className="bg-bg-primary px-4 py-3 md:px-8 md:py-4">
			<div className="mx-auto grid w-full max-w-250 grid-cols-1 gap-3 md:grid-cols-2 md:gap-x-6 md:gap-y-3 lg:gap-x-8">
				<div className="flex w-full flex-wrap items-center gap-2 text-xs text-text-secondary md:col-start-1 md:row-start-1">
					{view === "request" ? (
						<Button
							type="button"
							variant="outline"
							size="sm"
							className={AUX_BUTTON_CLASS}
							onClick={onChangeTarget}
						>
							Change Seerr target
						</Button>
					) : null}
					{view === "request" && isManualTarget ? (
						<Button
							type="button"
							variant="outline"
							size="sm"
							className={AUX_BUTTON_CLASS}
							disabled={isBusy}
							onClick={onClearManualTarget}
						>
							Clear manual target
						</Button>
					) : null}
				</div>
				<div className="flex w-full flex-wrap items-center gap-2 md:col-start-2 md:row-start-1 md:justify-end">
					<Button
						type="button"
						variant="outline"
						size="sm"
						className={FOOTER_BUTTON_CLASS}
						disabled={isBusy}
						onClick={view === "request" ? onClose : onBackToRequest}
					>
						{view === "request" ? "Exit modal" : "Back to request"}
					</Button>
					{view === "request" ? (
						<Button
							type="button"
							variant="primary"
							size="sm"
							className={FOOTER_BUTTON_CLASS}
							disabled={!canRequest || isBusy}
							isLoading={isRequesting}
							loadingText="Requesting..."
							onClick={onRequest}
						>
							{requestLabel}
						</Button>
					) : (
						<Button
							type="button"
							variant="primary"
							size="sm"
							className={FOOTER_BUTTON_CLASS}
							disabled={!canSaveTvTarget || isBusy}
							onClick={onSaveTvTarget}
						>
							Save TV target
						</Button>
					)}
				</div>
			</div>
		</footer>
	);
}
