/** Owns the modal primitive wrappers and modal-local portal mount plumbing. */
// src/features/media-modal/dialog.tsx

import React, { forwardRef, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "@/shared/utils/cn";

export const Modal = Dialog.Root;

type PortalContainer =
  React.ComponentPropsWithoutRef<typeof Dialog.Portal>["container"];

const MODAL_Z_INDEX_BASE = 2_147_483_600;
const MODAL_Z_INDEX_OVERLAY = MODAL_Z_INDEX_BASE;
const MODAL_Z_INDEX_CONTENT = MODAL_Z_INDEX_BASE + 1;
export const MODAL_Z_INDEX_FLOATING = MODAL_Z_INDEX_BASE + 2;

type ModalContentProps =
  React.ComponentPropsWithoutRef<typeof Dialog.Content> & {
    container?: PortalContainer;
    contentContainer?: HTMLDivElement | null;
  };

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

export const ModalContent = forwardRef<
  React.ComponentRef<typeof Dialog.Content>,
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
          "fixed left-1/2 top-1/2 grid -translate-x-1/2 -translate-y-1/2 gap-4 bg-bg-primary p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
          className,
        )}
        style={{ ...style, zIndex: MODAL_Z_INDEX_CONTENT }}
        {...rest}
      >
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  );
});
