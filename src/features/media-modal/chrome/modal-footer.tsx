/** Dumb setup and mapping footer controls for the media modal. */
// src/features/media-modal/chrome/modal-footer.tsx

import type { ReactNode } from "react";
import Button from "@/shared/ui/primitives/button";
import { OverwriteTargetWarning } from "../mapping/overwrite-target-warning";

type FooterLayoutProps = {
	notice?: ReactNode;
	left?: ReactNode;
	right: ReactNode;
};

type MediaModalFooterTransitionProps = {
	modeKey: string;
	children: ReactNode;
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
	overwriteTargetTitle: string | null;
	actionError: string | null;
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
	actionError: string | null;
	onCancel: () => void;
	onOpenMapping?: (() => void) | undefined;
};

const FOOTER_BUTTON_CLASS = "h-11 flex-1 md:h-8 md:flex-none";
const FOOTER_AUX_BUTTON_CLASS =
	"h-11 flex-1 rounded-lg px-3 text-sm md:h-7 md:flex-none md:px-2 md:text-xs";

function FooterButtonSlot(props: { children: ReactNode }): React.JSX.Element {
	const { children } = props;

	return (
		<span
			className="a2a-footer-button-in flex flex-1 md:flex-none"
		>
			{children}
		</span>
	);
}

function FooterLayout(props: FooterLayoutProps): React.JSX.Element {
	const { notice, left, right } = props;
	const actionRowClass = notice ? "md:row-start-2" : "md:row-start-1";

	return (
		<footer className="bg-bg-primary px-4 py-3 md:px-8 md:py-4">
			<div className="mx-auto grid w-full max-w-250 grid-cols-1 gap-3 md:grid-cols-2 md:gap-x-6 md:gap-y-3 lg:gap-x-8">
				{notice ? (
					<div className="a2a-fade-blur-in min-w-0 md:col-start-2 md:row-start-1">
						{notice}
					</div>
				) : null}

				<div
					className={`flex w-full flex-wrap items-center gap-2 text-xs text-text-secondary md:col-start-1 ${actionRowClass}`}
				>
					{left}
				</div>

				<div
					className={`flex w-full flex-wrap items-center gap-2 md:col-start-2 md:justify-end ${actionRowClass}`}
				>
					{right}
				</div>
			</div>
		</footer>
	);
}

export function MediaModalFooterTransition(
	props: MediaModalFooterTransitionProps,
): React.JSX.Element {
	const { children } = props;

	return <>{children}</>;
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
		overwriteTargetTitle,
		actionError,
		onRejectCandidate,
		onClearRejectedCandidate,
		onIgnoreTitle,
		onLeaveMapping,
		onResetMapping,
		onApplyMapping,
	} = props;
	const leftActions = [
		canIgnoreTitle ? (
			<FooterButtonSlot key="ignore-title">
				<Button
					type="button"
					onClick={(event) => {
						if (!event.isTrusted) return;

						void onIgnoreTitle();
					}}
					variant="outline"
					size="sm"
					className={FOOTER_AUX_BUTTON_CLASS}
					disabled={isRejectingCandidate || isClearingRejectedCandidate}
					isLoading={isIgnoring}
				>
					Ignore title
				</Button>
			</FooterButtonSlot>
		) : null,
		canRejectCandidate ? (
			<FooterButtonSlot key="reject-candidate">
				<Button
					type="button"
					onClick={(event) => {
						if (!event.isTrusted) return;

						void onRejectCandidate();
					}}
					variant="outline"
					size="sm"
					className={FOOTER_AUX_BUTTON_CLASS}
					disabled={isIgnoring || isClearingRejectedCandidate}
					isLoading={isRejectingCandidate}
				>
					Not this match
				</Button>
			</FooterButtonSlot>
		) : null,
		canClearRejectedCandidate ? (
			<FooterButtonSlot key="clear-rejected">
				<Button
					type="button"
					onClick={(event) => {
						if (!event.isTrusted) return;

						void onClearRejectedCandidate();
					}}
					variant="outline"
					size="sm"
					className={FOOTER_AUX_BUTTON_CLASS}
					disabled={isIgnoring || isRejectingCandidate}
					isLoading={isClearingRejectedCandidate}
				>
					Clear rejected
				</Button>
			</FooterButtonSlot>
		) : null,
		manualMappingActive ? (
			<FooterButtonSlot key="reset-mapping">
				<Button
					onClick={(event) => {
						if (!event.isTrusted) return;

						void onResetMapping();
					}}
					variant="outline"
					size="sm"
					className={FOOTER_AUX_BUTTON_CLASS}
					disabled={isResettingMapping}
				>
					Reset to automatic
				</Button>
			</FooterButtonSlot>
		) : null,
	];
	const rightActions = [
		<FooterButtonSlot key="leave-mapping">
			<Button
				onClick={onLeaveMapping}
				variant="outline"
				size="sm"
				className={FOOTER_BUTTON_CLASS}
			>
				{leaveMappingLabel}
			</Button>
		</FooterButtonSlot>,
		<FooterButtonSlot key="apply-mapping">
			<Button
				onClick={(event) => {
					if (!event.isTrusted) return;

					void onApplyMapping();
				}}
				variant="primary"
				size="sm"
				className={FOOTER_BUTTON_CLASS}
				disabled={!canApplyMapping}
				isLoading={isApplyingMapping}
			>
				Overwrite mapping
			</Button>
		</FooterButtonSlot>,
	];
	let notice: ReactNode = null;
	if (actionError) {
		notice = (
			<p
				className="rounded-md border border-error/30 bg-error/10 px-3 py-2 text-sm font-medium text-error"
				role="alert"
			>
				{actionError}
			</p>
		);
	} else if (overwriteTargetTitle) {
		notice = <OverwriteTargetWarning title={overwriteTargetTitle} />;
	}

	return (
		<FooterLayout
			notice={notice}
			left={leftActions}
			right={rightActions}
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
		actionError,
		onCancel,
		onOpenMapping,
	} = props;
	const leftActions = onOpenMapping
		? [
				<FooterButtonSlot key="change-mapping">
					<Button
						type="button"
						onClick={onOpenMapping}
						variant="outline"
						size="sm"
						className={FOOTER_AUX_BUTTON_CLASS}
					>
						Change mapping
					</Button>
				</FooterButtonSlot>,
			]
		: null;
	const rightActions = [
		<FooterButtonSlot key="cancel">
			<Button
				onClick={onCancel}
				variant="outline"
				size="sm"
				className={FOOTER_BUTTON_CLASS}
				disabled={isBusy}
			>
				Exit modal
			</Button>
		</FooterButtonSlot>,
		<FooterButtonSlot key="submit-setup">
			<Button
				type="submit"
				form={formId}
				variant="primary"
				size="sm"
				className={FOOTER_BUTTON_CLASS}
				disabled={!canSubmit}
				isLoading={isSubmitting}
			>
				{submitLabel}
			</Button>
		</FooterButtonSlot>,
	];

	return (
		<FooterLayout
			notice={
				actionError ? (
					<p
						className="rounded-md border border-error/30 bg-error/10 px-3 py-2 text-sm font-medium text-error"
						role="alert"
					>
						{actionError}
					</p>
				) : null
			}
			left={leftActions}
			right={rightActions}
		/>
	);
}
