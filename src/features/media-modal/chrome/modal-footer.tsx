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
	canRejectCandidate: boolean;
	canClearRejectedCandidate: boolean;
	canIgnoreTitle: boolean;
	isRejectingCandidate: boolean;
	isClearingRejectedCandidate: boolean;
	isIgnoring: boolean;
	canApplyMapping: boolean;
	isApplyingMapping: boolean;
	leaveMappingLabel: string;
	onRejectCandidate: () => void | Promise<void>;
	onClearRejectedCandidate: () => void | Promise<void>;
	onIgnoreTitle: () => void | Promise<void>;
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
	onOpenMapping?: (() => void) | undefined;
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
		canRejectCandidate,
		canClearRejectedCandidate,
		canIgnoreTitle,
		isRejectingCandidate,
		isClearingRejectedCandidate,
		isIgnoring,
		canApplyMapping,
		isApplyingMapping,
		leaveMappingLabel,
		onRejectCandidate,
		onClearRejectedCandidate,
		onIgnoreTitle,
		onLeaveMapping,
		onResetMapping,
		onApplyMapping,
	} = props;

	return (
		<FooterLayout
			left={
				<>
					{canIgnoreTitle ? (
						<Button
							type="button"
							onClick={() => void onIgnoreTitle()}
							variant="outline"
							size="sm"
							className="h-7 rounded-lg px-2 text-xs"
							disabled={isRejectingCandidate || isClearingRejectedCandidate}
							isLoading={isIgnoring}
						>
							Ignore title
						</Button>
					) : null}

					{canRejectCandidate ? (
						<Button
							type="button"
							onClick={() => void onRejectCandidate()}
							variant="outline"
							size="sm"
							className="h-7 rounded-lg px-2 text-xs"
							disabled={isIgnoring || isClearingRejectedCandidate}
							isLoading={isRejectingCandidate}
						>
							Not this match
						</Button>
					) : null}

					{canClearRejectedCandidate ? (
						<Button
							type="button"
							onClick={() => void onClearRejectedCandidate()}
							variant="outline"
							size="sm"
							className="h-7 rounded-lg px-2 text-xs"
							disabled={isIgnoring || isRejectingCandidate}
							isLoading={isClearingRejectedCandidate}
						>
							Clear rejected
						</Button>
					) : null}

					{manualMappingActive ? (
						<Button
							onClick={() => void onResetMapping()}
							variant="outline"
							size="sm"
							disabled={isResettingMapping}
						>
							Reset to automatic
						</Button>
					) : null}
				</>
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
	const {
		formId,
		canSubmit,
		isBusy,
		isSubmitting,
		submitLabel,
		onCancel,
		onOpenMapping,
	} = props;

	return (
		<FooterLayout
			left={
				onOpenMapping ? (
					<Button
						type="button"
						onClick={onOpenMapping}
						variant="outline"
						size="sm"
					>
						Change mapping
					</Button>
				) : null
			}
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
