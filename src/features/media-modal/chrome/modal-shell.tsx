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
import { MotionConfig } from "framer-motion";
import { cn } from "@/shared/utils/cn";
import type { MediaModalContainer } from "../types";

export const MODAL_Z_INDEX_BASE = 2_147_483_600;
const MODAL_Z_INDEX_OVERLAY = MODAL_Z_INDEX_BASE;
const MODAL_Z_INDEX_CONTENT = MODAL_Z_INDEX_BASE + 1;
export const MODAL_Z_INDEX_FLOATING = MODAL_Z_INDEX_BASE + 2;

const SHELL_CLASS =
	"h-[100dvh] max-h-[100dvh] min-h-0 w-full max-w-none flex flex-col overflow-hidden rounded-none bg-bg-primary p-0 shadow-2xl shadow-black/40 md:h-[min(80vh,calc(100dvh-2rem))] md:max-h-[calc(100dvh-2rem)] md:max-w-250 md:rounded-2xl";

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
			<Dialog.Overlay
				data-testid="modal-overlay"
				className={cn(
					"fixed inset-0 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
				)}
				style={{ zIndex: MODAL_Z_INDEX_OVERLAY }}
			/>

			<Dialog.Content
				ref={ref}
				className={cn(
					"fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-bg-primary shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
					className,
				)}
				style={{ ...style, zIndex: MODAL_Z_INDEX_CONTENT }}
				{...rest}
				onTouchMove={stopModalScrollLockPropagation}
				onWheel={stopModalScrollLockPropagation}
			>
				{children}
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
			<Modal open onOpenChange={onOpenChange}>
				<ModalContent
					container={container}
					contentContainer={contentContainer}
					className={SHELL_CLASS}
					onOpenAutoFocus={(event) => event.preventDefault()}
					{...(onEscapeKeyDown ? { onEscapeKeyDown } : {})}
				>
					{header}

					<div className={FRAME_CLASS}>
						<div className={WORKSPACE_CLASS}>
							<div className={GRID_CLASS}>
								<div className={leftPaneClass}>{leftPane}</div>

								{rightPaneTop ? (
									<div className={RIGHT_PANE_TOP_CLASS}>{rightPaneTop}</div>
								) : null}

								<div className={rightPaneClass}>{rightPane}</div>
							</div>
						</div>
					</div>

					{footer}
				</ModalContent>
			</Modal>
		</MotionConfig>
	);
}
