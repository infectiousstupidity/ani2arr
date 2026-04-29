/** Renders setup and mapping footers for provider media modals. */
// src/features/media-modal/components/provider-modal-footer.tsx

import Button from "@/shared/ui/primitives/button";
import { Footer } from "./footer";

interface ProviderModalFooterProps {
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
	setupUnavailable: boolean;
	setupIsBusy: boolean;
	isSubmittingSetup: boolean;
	setupMutationsBlocked: boolean;
	setupSubmitLabel: string;
}

export function ProviderModalFooter({
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
	setupUnavailable,
	setupIsBusy,
	isSubmittingSetup,
	setupMutationsBlocked,
	setupSubmitLabel,
}: ProviderModalFooterProps): React.JSX.Element {
	if (isMappingView) {
		return (
			<Footer
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
		<Footer
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
						disabled={
							setupUnavailable || setupMutationsBlocked
						}
						isLoading={isSubmittingSetup}
					>
						{setupSubmitLabel}
					</Button>
				</>
			}
		/>
	);
}
