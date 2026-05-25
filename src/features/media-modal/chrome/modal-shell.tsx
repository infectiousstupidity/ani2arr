/** Slot-based media modal shell and modal-local portal plumbing. */
// src/features/media-modal/chrome/modal-shell.tsx

import {
	forwardRef,
	useEffect,
	type ComponentRef,
	type ComponentPropsWithoutRef,
	type ReactNode,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
	LazyMotion,
	MotionConfig,
	domAnimation,
	m,
	type Variants,
} from "framer-motion";
import { cn } from "@/shared/utils/cn";
import type { MediaModalContainer } from "../types";

export const MODAL_Z_INDEX_BASE = 2_147_483_600;
const MODAL_Z_INDEX_OVERLAY = MODAL_Z_INDEX_BASE;
const MODAL_Z_INDEX_CONTENT = MODAL_Z_INDEX_BASE + 1;
export const MODAL_Z_INDEX_FLOATING = MODAL_Z_INDEX_BASE + 2;

const CONTENT_CLASS =
	"fixed left-1/2 top-1/2 h-[100dvh] max-h-[100dvh] min-h-0 w-full max-w-none -translate-x-1/2 -translate-y-1/2 outline-none md:h-[min(80vh,calc(100dvh-2rem))] md:max-h-[calc(100dvh-2rem)] md:max-w-250";

const SHELL_CLASS =
	"flex h-full w-full min-h-0 flex-col overflow-hidden rounded-none bg-bg-primary p-0 shadow-2xl shadow-black/40 md:rounded-2xl";

const FRAME_CLASS =
	"relative flex-1 flex flex-col min-h-0 overflow-y-auto overscroll-contain touch-pan-y px-4 md:overflow-hidden md:px-8";

const WORKSPACE_CLASS =
	"mx-auto flex flex-col flex-1 w-full max-w-250 pb-4 md:h-full md:min-h-0";

const GRID_CLASS =
	"grid grid-cols-1 gap-y-4 md:h-full md:min-h-0 md:grid-cols-2 md:gap-x-6 md:gap-y-2 lg:gap-x-8";

const LEFT_PANE_CLASS =
	"order-1 flex flex-col min-h-80 min-w-0 md:col-start-1 md:row-start-1 md:h-full md:min-h-0 md:overflow-hidden md:pr-2";

const RIGHT_PANE_TOP_CLASS =
	"order-2 flex justify-center md:col-start-2 md:row-start-1 md:items-end";

const RIGHT_PANE_CLASS =
	"order-3 relative flex flex-col min-h-80 min-w-0 overscroll-contain touch-pan-y md:col-start-2 md:h-full md:min-h-0 md:overflow-y-auto";

const MODAL_SCROLL_BOUNDARY_EVENTS = ["wheel", "touchmove"] as const;

const OVERLAY_VARIANTS: Variants = {
	hidden: { opacity: 0, backdropFilter: "blur(0px)" },
	show: {
		opacity: 1,
		backdropFilter: "blur(8px)",
		transition: { duration: 0.16, ease: "easeOut" },
	},
	exit: {
		opacity: 0,
		transition: { duration: 0.08, ease: "easeIn" },
	},
};

const SHELL_VARIANTS: Variants = {
	hidden: { opacity: 0, y: 30, scale: 0.95 },
	show: {
		opacity: 1,
		y: 0,
		scale: 1,
		transition: {
			type: "spring",
			damping: 25,
			stiffness: 300,
		},
	},
	exit: {
		opacity: 0,
		y: 8,
		scale: 0.98,
		transition: { duration: 0.09, ease: "easeIn" },
	},
};

const SECTION_VARIANTS: Variants = {
	hidden: { opacity: 0, y: 15 },
	show: (delay = 0) => ({
		opacity: 1,
		y: 0,
		transition: {
			type: "spring",
			damping: 20,
			stiffness: 250,
			delay,
		},
	}),
};

const HEADER_SECTION_DELAY = 0.05;
const LEFT_PANE_SECTION_DELAY = 0.1;
const RIGHT_PANE_TOP_SECTION_DELAY = 0.12;
const RIGHT_PANE_SECTION_DELAY = 0.14;
const FOOTER_SECTION_DELAY = 0.15;

type PortalContainer = ComponentPropsWithoutRef<
	typeof Dialog.Portal
>["container"];

type ModalContentProps = ComponentPropsWithoutRef<typeof Dialog.Content> & {
	container?: PortalContainer;
	contentContainer?: HTMLDivElement | null;
};

type ModalShellProps = {
	container?: MediaModalContainer | undefined;
	contentContainer: HTMLDivElement | null;
	header: ReactNode;
	leftPane: ReactNode;
	rightPane: ReactNode;
	footer?: ReactNode | undefined;
	rightPaneTop?: ReactNode | undefined;
	onOpenChange: (open: boolean) => void;
	onEscapeKeyDown?: ModalContentProps["onEscapeKeyDown"];
};

const Modal = Dialog.Root;

function getContentContainerOwner(
	container: PortalContainer | undefined,
): HTMLElement | ShadowRoot | null {
	if (container instanceof HTMLElement || container instanceof ShadowRoot) {
		return container;
	}

	if (typeof document === "undefined") {
		return null;
	}

	return document.body;
}

function attachContentContainer(
	contentContainerOwner: { append(node: HTMLDivElement): void } | null,
	contentContainer: { remove(): void } | null | undefined,
): (() => void) | undefined {
	if (!contentContainer || !contentContainerOwner) {
		return undefined;
	}

	contentContainerOwner.append(contentContainer as HTMLDivElement);

	return () => {
		contentContainer.remove();
	};
}

function stopModalScrollLockPropagation(event: {
	stopPropagation(): void;
}): void {
	// Current Radix + Shadow DOM integration: keep modal scroll events away from document scroll lock.
	event.stopPropagation();
}

function attachModalScrollBoundary(
	contentContainer: HTMLDivElement | null | undefined,
): (() => void) | undefined {
	if (!contentContainer) {
		return undefined;
	}

	for (const eventName of MODAL_SCROLL_BOUNDARY_EVENTS) {
		contentContainer.addEventListener(eventName, stopModalScrollLockPropagation);
	}

	return () => {
		for (const eventName of MODAL_SCROLL_BOUNDARY_EVENTS) {
			contentContainer.removeEventListener(
				eventName,
				stopModalScrollLockPropagation,
			);
		}
	};
}

const ModalContent = forwardRef<
	ComponentRef<typeof Dialog.Content>,
	ModalContentProps
>(function ModalContent(props, ref): React.JSX.Element {
	const {
		className,
		children,
		container,
		contentContainer,
		style,
		...rest
	} = props;

	const contentContainerOwner = getContentContainerOwner(container);

	useEffect(() => {
		return attachContentContainer(contentContainerOwner, contentContainer);
	}, [contentContainer, contentContainerOwner]);

	useEffect(() => {
		return attachModalScrollBoundary(contentContainer);
	}, [contentContainer]);

	return (
		<Dialog.Portal container={container}>
			<Dialog.Overlay asChild>
				<m.div
					data-testid="modal-overlay"
					className="fixed inset-0 bg-black/60"
					style={{ zIndex: MODAL_Z_INDEX_OVERLAY }}
					variants={OVERLAY_VARIANTS}
					initial="hidden"
					animate="show"
					exit="exit"
				/>
			</Dialog.Overlay>

			<Dialog.Content
				ref={ref}
				className={CONTENT_CLASS}
				style={{ ...style, zIndex: MODAL_Z_INDEX_CONTENT }}
				{...rest}
				onTouchMove={stopModalScrollLockPropagation}
				onWheel={stopModalScrollLockPropagation}
			>
				<m.div
					className={className}
					variants={SHELL_VARIANTS}
					initial="hidden"
					animate="show"
					exit="exit"
				>
					{children}
				</m.div>
			</Dialog.Content>
		</Dialog.Portal>
	);
});

export function ModalShell(props: ModalShellProps): React.JSX.Element {
	const {
		container,
		contentContainer,
		header,
		leftPane,
		rightPane,
		footer,
		rightPaneTop,
		onOpenChange,
		onEscapeKeyDown,
	} = props;
	const leftPaneClass = cn(
		LEFT_PANE_CLASS,
		rightPaneTop ? "md:row-span-2" : "",
	);
	const rightPaneClass = cn(
		RIGHT_PANE_CLASS,
		rightPaneTop ? "md:row-start-2" : "md:row-start-1",
	);

	return (
		<MotionConfig reducedMotion="user">
			<LazyMotion features={domAnimation}>
				<Modal open onOpenChange={onOpenChange}>
					<ModalContent
						container={container}
						contentContainer={contentContainer}
						className={SHELL_CLASS}
						onOpenAutoFocus={(event) => event.preventDefault()}
						{...(onEscapeKeyDown ? { onEscapeKeyDown } : {})}
					>
						<m.div
							className="shrink-0"
							variants={SECTION_VARIANTS}
							custom={HEADER_SECTION_DELAY}
						>
							{header}
						</m.div>

						<div className={FRAME_CLASS}>
							<div className={WORKSPACE_CLASS}>
								<div className={GRID_CLASS}>
									<m.div
										className={leftPaneClass}
										variants={SECTION_VARIANTS}
										custom={LEFT_PANE_SECTION_DELAY}
									>
										{leftPane}
									</m.div>

									{rightPaneTop ? (
										<m.div
											className={RIGHT_PANE_TOP_CLASS}
											variants={SECTION_VARIANTS}
											custom={RIGHT_PANE_TOP_SECTION_DELAY}
										>
											{rightPaneTop}
										</m.div>
									) : null}

									<m.div
										className={rightPaneClass}
										variants={SECTION_VARIANTS}
										custom={RIGHT_PANE_SECTION_DELAY}
									>
										{rightPane}
									</m.div>
								</div>
							</div>
						</div>

						{footer ? (
							<m.div
								className="shrink-0"
								variants={SECTION_VARIANTS}
								custom={FOOTER_SECTION_DELAY}
							>
								{footer}
							</m.div>
						) : null}
					</ModalContent>
				</Modal>
			</LazyMotion>
		</MotionConfig>
	);
}
