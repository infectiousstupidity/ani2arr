// src/ui/Modal.tsx
import React, { forwardRef, memo, FC, PropsWithChildren, HTMLAttributes } from 'react';
import * as Dialog from '@radix-ui/react-dialog';

/**
 * Simple className merge utility to replace 'clsx' if not installed.
 * Accepts any number of strings, ignores falsy values.
 */
function clsx(...args: (string | undefined | false | null)[]) {
  return args.filter(Boolean).join(' ');
}

type ModalProps = React.ComponentPropsWithoutRef<typeof Dialog.Root>;

const Modal: FC<PropsWithChildren<ModalProps>> = ({ children, ...props }) => (
  <Dialog.Root {...props}>{children}</Dialog.Root>
);

const ModalTrigger = Dialog.Trigger;

const ModalContent = forwardRef<
  React.ComponentRef<typeof Dialog.Content>,
  // Add the 'container' prop to the type definition
  React.ComponentPropsWithoutRef<typeof Dialog.Content> & { container?: HTMLElement | null | undefined }
>(({ className, children, container, ...props }, ref) => (
  // Pass the container prop to the Dialog.Portal
  <Dialog.Portal container={container ?? undefined}>
    <Dialog.Overlay
      className={clsx(
        'fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
      )}
    />
    <Dialog.Content
      ref={ref}
      className={clsx(
        'fixed left-1/2 top-1/2 z-50 grid w-[480px] -translate-x-1/2 -translate-y-1/2 gap-4 border bg-bg-primary p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg',
        className
      )}
      aria-modal="true"
      aria-labelledby="modal-title"
      aria-describedby="modal-description"
      {...props}
    >
      {children}
    </Dialog.Content>
  </Dialog.Portal>
));
ModalContent.displayName = 'ModalContent';

const ModalFooter: FC<HTMLAttributes<HTMLDivElement>> = memo(
  ({ className, ...props }) => (
    <div
      className={clsx('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)}
      {...props}
    />
  )
);
ModalFooter.displayName = 'ModalFooter';

const ModalTitle = forwardRef<
  React.ComponentRef<typeof Dialog.Title>,
  React.ComponentPropsWithoutRef<typeof Dialog.Title>
>(({ className, ...props }, ref) => (
  <Dialog.Title
    ref={ref}
    className={clsx('text-lg text-text-primary g-none tracking-tight', className)}
    {...props}
  />
));
ModalTitle.displayName = 'ModalTitle';

const ModalDescription = forwardRef<
  React.ComponentRef<typeof Dialog.Description>,
  React.ComponentPropsWithoutRef<typeof Dialog.Description>
>(({ className, ...props }, ref) => (
  <Dialog.Description
    ref={ref}
    className={clsx('text-sm text-text-secondary', className)}
    {...props}
  />
));
ModalDescription.displayName = 'ModalDescription';

export {
  Modal,
  ModalTrigger,
  ModalContent,
  ModalFooter,
  ModalTitle,
  ModalDescription,
};