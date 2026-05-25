/** Dumb setup and mapping footer controls for the media modal. */
// src/features/media-modal/chrome/modal-footer.tsx

import { AnimatePresence, LazyMotion, domMax, m } from "framer-motion";
import type { ReactNode } from "react";
import Button from "@/shared/ui/primitives/button";

type FooterLayoutProps = {
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

const FOOTER_BUTTON_CLASS = "h-11 flex-1 md:h-8 md:flex-none";
const FOOTER_AUX_BUTTON_CLASS =
	"h-11 flex-1 rounded-lg px-3 text-sm md:h-7 md:flex-none md:px-2 md:text-xs";

function FooterButtonSlot(props: { children: ReactNode }): React.JSX.Element {
	const { children } = props;

	return (
		<m.span
			layout
			initial={{ opacity: 0, y: 4 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, y: 4 }}
			transition={{ duration: 0.14 }}
			className="flex flex-1 md:flex-none"
		>
			{children}
		</m.span>
	);
}

function FooterLayout(props: FooterLayoutProps): React.JSX.Element {
	const { left, right } = props;

	return (
		<LazyMotion features={domMax}>
			<m.footer
				layout
				className="flex flex-col gap-3 bg-bg-primary px-4 py-3 md:flex-row md:items-center md:justify-between md:px-8 md:py-4"
			>
				<m.div
					layout
					className="order-1 flex w-full flex-wrap items-center gap-2 text-xs text-text-secondary md:order-1 md:w-auto"
				>
					<AnimatePresence initial={false} mode="popLayout">
						{left}
					</AnimatePresence>
				</m.div>

				<m.div
					layout
					className="order-2 flex w-full flex-wrap items-center gap-2 md:order-2 md:w-auto md:justify-end"
				>
					<AnimatePresence initial={false} mode="popLayout">
						{right}
					</AnimatePresence>
				</m.div>
			</m.footer>
		</LazyMotion>
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
					onClick={() => void onIgnoreTitle()}
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
					onClick={() => void onRejectCandidate()}
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
					onClick={() => void onClearRejectedCandidate()}
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
					onClick={() => void onResetMapping()}
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
				onClick={() => void onApplyMapping()}
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

	return (
		<FooterLayout left={leftActions} right={rightActions} />
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
		<FooterLayout left={leftActions} right={rightActions} />
	);
}
