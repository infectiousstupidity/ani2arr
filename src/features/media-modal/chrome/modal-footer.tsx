/** Dumb setup and mapping footer controls for the media modal. */
// src/features/media-modal/chrome/modal-footer.tsx

import type { ReactNode } from "react";
import Button from "@/shared/ui/primitives/button";

type FooterLayoutProps = {
	left?: ReactNode;
	right: ReactNode;
};

type ModalFooterProps = {
	isMappingView: boolean;
	manualMappingActive: boolean;
	canShowSetup: boolean;
	isRevertingMapping: boolean;
	canSubmitMapping: boolean;
	isSubmittingMapping: boolean;
	onResetMapping: () => void | Promise<void>;
	onApplyMapping: () => void | Promise<void>;
	onShowSetup: () => void;
	onClose: () => void;
	setupFormId: string;
	setupCanSubmit: boolean;
	setupIsBusy: boolean;
	isSubmittingSetup: boolean;
	setupSubmitLabel: string;
};

function FooterLayout(props: FooterLayoutProps): React.JSX.Element {
	const { left, right } = props;

	return (
		<footer className="flex flex-wrap items-center justify-between gap-3 bg-bg-primary px-8 py-4">
			<div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
				{left}
			</div>

			<div className="flex flex-wrap items-center gap-2">{right}</div>
		</footer>
	);
}

export function ModalFooter(props: ModalFooterProps): React.JSX.Element {
	const {
		isMappingView,
		manualMappingActive,
		canShowSetup,
		isRevertingMapping,
		canSubmitMapping,
		isSubmittingMapping,
		onResetMapping,
		onApplyMapping,
		onShowSetup,
		onClose,
		setupFormId,
		setupCanSubmit,
		setupIsBusy,
		isSubmittingSetup,
		setupSubmitLabel,
	} = props;

	if (isMappingView) {
		return (
			<FooterLayout
				left={
					manualMappingActive ? (
						<Button
							onClick={() => void onResetMapping()}
							variant="outline"
							size="sm"
							disabled={isRevertingMapping}
						>
							Reset to automatic
						</Button>
					) : null
				}
				right={
					<>
						<Button
							onClick={canShowSetup ? onShowSetup : onClose}
							variant="outline"
							size="sm"
						>
							{canShowSetup ? "Back to setup" : "Exit modal"}
						</Button>
						<Button
							onClick={() => void onApplyMapping()}
							variant="primary"
							size="sm"
							disabled={!canSubmitMapping}
							isLoading={isSubmittingMapping}
						>
							Confirm Selection
						</Button>
					</>
				}
			/>
		);
	}

	return (
		<FooterLayout
			right={
				<>
					<Button
						onClick={onClose}
						variant="outline"
						size="sm"
						disabled={setupIsBusy}
					>
						Cancel
					</Button>
					<Button
						type="submit"
						form={setupFormId}
						variant="primary"
						size="sm"
						disabled={!setupCanSubmit}
						isLoading={isSubmittingSetup}
					>
						{setupSubmitLabel}
					</Button>
				</>
			}
		/>
	);
}
