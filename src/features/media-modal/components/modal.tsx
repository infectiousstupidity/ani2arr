// src/features/media-modal/components/modal.tsx
import React, {
  forwardRef,
  memo,
  type HTMLAttributes,
  type PropsWithChildren,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "@/shared/utils/cn";


type ModalProps = React.ComponentPropsWithoutRef<typeof Dialog.Root>;

export function Modal(
  props: PropsWithChildren<ModalProps>,
): React.JSX.Element {
  const { children, ...rest } = props;
  return <Dialog.Root {...rest}>{children}</Dialog.Root>;
}

export const ModalTrigger = Dialog.Trigger;

const BASE_MODAL_Z_INDEX = 2147483600;
const MODAL_OVERLAY_Z_INDEX = BASE_MODAL_Z_INDEX;
const MODAL_CONTENT_Z_INDEX = BASE_MODAL_Z_INDEX + 1;

type ModalContentProps =
  React.ComponentPropsWithoutRef<typeof Dialog.Content> & {
    container?: HTMLElement | null;
  };

export const ModalContent = forwardRef<
  React.ComponentRef<typeof Dialog.Content>,
  ModalContentProps
>(function ModalContent(
  props,
  ref,
): React.JSX.Element {
  const { className, children, container, style, ...rest } = props;

  const contentStyle: React.CSSProperties | undefined = style
    ? { ...style, zIndex: MODAL_CONTENT_Z_INDEX }
    : { zIndex: MODAL_CONTENT_Z_INDEX };

  return (
    <Dialog.Portal container={container ?? undefined}>
      <Dialog.Overlay
        data-testid="modal-overlay"
        className={cn(
          "fixed inset-0 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        )}
        style={{ zIndex: MODAL_OVERLAY_Z_INDEX }}
      />
      <Dialog.Content
        ref={ref}
        className={cn(
          "fixed left-1/2 top-1/2 grid -translate-x-1/2 -translate-y-1/2 gap-4 border bg-bg-primary p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
          className,
        )}
        style={contentStyle}
        {...rest}
      >
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  );
});

type ModalFooterProps = HTMLAttributes<HTMLDivElement>;

export const ModalFooter = memo(function ModalFooter(
  props: ModalFooterProps,
): React.JSX.Element {
  const { className, ...rest } = props;
  return (
    <div
      className={cn(
        "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
        className,
      )}
      {...rest}
    />
  );
});

type ModalTitleProps = React.ComponentPropsWithoutRef<typeof Dialog.Title>;

export const ModalTitle = forwardRef<
  React.ComponentRef<typeof Dialog.Title>,
  ModalTitleProps
>(function ModalTitle(
  props,
  ref,
): React.JSX.Element {
  const { className, ...rest } = props;
  return (
    <Dialog.Title
      ref={ref}
      className={cn("text-lg font-semibold text-text-primary tracking-tight", className)}
      {...rest}
    />
  );
});

type ModalDescriptionProps =
  React.ComponentPropsWithoutRef<typeof Dialog.Description>;

export const ModalDescription = forwardRef<
  React.ComponentRef<typeof Dialog.Description>,
  ModalDescriptionProps
>(function ModalDescription(
  props,
  ref,
): React.JSX.Element {
  const { className, ...rest } = props;
  return (
    <Dialog.Description
      ref={ref}
      className={cn("text-sm text-text-secondary", className)}
      {...rest}
    />
  );
});