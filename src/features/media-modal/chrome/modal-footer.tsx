/** Dumb setup and mapping footer controls for the media modal. */
// src/features/media-modal/chrome/modal-footer.tsx

import type { ReactNode } from "react";
import Button from "@/shared/ui/primitives/button";

type FooterLayoutProps = {
	left?: ReactNode;
	right: ReactNode;
};

type MappingFooterProps = {
	manualMappingActive: boolean;
	isResettingMapping: boolean;
	canApplyMapping: boolean;
	isApplyingMapping: boolean;
	leaveMappingLabel: string;
	onLeaveMapping: () => void;
	onResetMapping: () => void | Promise<void>;
	onApplyMapping: () => void | Promise<void>;
};

type SetupFooterProps = {
	formId: string;
	canSubmit: boolean;
	isBusy: boolean;
	isSubmitting: boolean;
	submitLabel: string;
	onCancel: () => void;
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

export function MappingFooter(props: MappingFooterProps): React.JSX.Element {
	const {
		manualMappingActive,
		isResettingMapping,
		canApplyMapping,
		isApplyingMapping,
		leaveMappingLabel,
		onLeaveMapping,
		onResetMapping,
		onApplyMapping,
	} = props;

	return (
		<FooterLayout
			left={
				manualMappingActive ? (
					<Button
						onClick={() => void onResetMapping()}
						variant="outline"
						size="sm"
						disabled={isResettingMapping}
					>
						Reset to automatic
					</Button>
				) : null
			}
			right={
				<>
					<Button
						onClick={onLeaveMapping}
						variant="outline"
						size="sm"
					>
						{leaveMappingLabel}
					</Button>
					<Button
						onClick={() => void onApplyMapping()}
						variant="primary"
						size="sm"
						disabled={!canApplyMapping}
						isLoading={isApplyingMapping}
					>
						Confirm Selection
					</Button>
				</>
			}
		/>
	);
}

export function SetupFooter(props: SetupFooterProps): React.JSX.Element {
	const { formId, canSubmit, isBusy, isSubmitting, submitLabel, onCancel } =
		props;

	return (
		<FooterLayout
			right={
				<>
					<Button
						onClick={onCancel}
						variant="outline"
						size="sm"
						disabled={isBusy}
					>
						Cancel
					</Button>
					<Button
						type="submit"
						form={formId}
						variant="primary"
						size="sm"
						disabled={!canSubmit}
						isLoading={isSubmitting}
					>
						{submitLabel}
					</Button>
				</>
			}
		/>
	);
}
