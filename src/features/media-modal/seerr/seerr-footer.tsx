/** Seerr modal footer actions for request and target correction views. */
// src/features/media-modal/seerr/seerr-footer.tsx

import Button from "@/shared/ui/primitives/button";
import {
	AUX_BUTTON_CLASS,
	FOOTER_BUTTON_CLASS,
} from "./seerr-modal.constants";

type SeerrFooterProps =
	| {
			view: "request";
			isManualTarget: boolean;
			canRequest: boolean;
			isBusy: boolean;
			isRequesting: boolean;
			requestLabel: string;
			onClose: () => void;
			onChangeTarget: () => void;
			onClearManualTarget: () => void;
			onRequest: () => void;
	  }
	| {
			view: "change-target";
			canSaveTvTarget: boolean;
			isBusy: boolean;
			onBackToRequest: () => void;
			onSaveTvTarget: () => void;
	  };

export function SeerrFooter(props: SeerrFooterProps): React.JSX.Element {
	return (
		<footer className="bg-bg-primary px-4 py-3 md:px-8 md:py-4">
			<div className="mx-auto grid w-full max-w-250 grid-cols-1 gap-3 md:grid-cols-2 md:gap-x-6 md:gap-y-3 lg:gap-x-8">
				<div className="flex w-full flex-wrap items-center gap-2 text-xs text-text-secondary md:col-start-1 md:row-start-1">
					{props.view === "request" ? (
						<Button
							type="button"
							variant="outline"
							size="sm"
							className={AUX_BUTTON_CLASS}
							onClick={props.onChangeTarget}
						>
							Change Seerr target
						</Button>
					) : null}
					{props.view === "request" && props.isManualTarget ? (
						<Button
							type="button"
							variant="outline"
							size="sm"
							className={AUX_BUTTON_CLASS}
							disabled={props.isBusy}
							onClick={props.onClearManualTarget}
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
						disabled={props.isBusy}
						onClick={
							props.view === "request"
								? props.onClose
								: props.onBackToRequest
						}
					>
						{props.view === "request" ? "Exit modal" : "Back to request"}
					</Button>
					{props.view === "request" ? (
						<Button
							type="button"
							variant="primary"
							size="sm"
							className={FOOTER_BUTTON_CLASS}
							disabled={!props.canRequest || props.isBusy}
							isLoading={props.isRequesting}
							loadingText="Requesting..."
							onClick={props.onRequest}
						>
							{props.requestLabel}
						</Button>
					) : (
						<Button
							type="button"
							variant="primary"
							size="sm"
							className={FOOTER_BUTTON_CLASS}
							disabled={!props.canSaveTvTarget || props.isBusy}
							onClick={props.onSaveTvTarget}
						>
							Save TV target
						</Button>
					)}
				</div>
			</div>
		</footer>
	);
}
