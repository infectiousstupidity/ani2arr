import React, { useCallback, useRef } from 'react';
import Button from '@/shared/components/button';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { cn } from '@/shared/utils/cn';

const BASE_CONFIRM_Z_INDEX = 2147483620;
const CONFIRM_OVERLAY_Z_INDEX = BASE_CONFIRM_Z_INDEX;
const CONFIRM_CONTENT_Z_INDEX = BASE_CONFIRM_Z_INDEX + 1;

type ConfirmDialogProps = {
  open: boolean;
  title?: React.ReactNode;
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  container?: HTMLElement | ShadowRoot | null;
  onConfirm: () => void;
  onCancel: () => void;
  onOpenChange?: (open: boolean) => void;
};

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  container,
  onConfirm,
  onCancel,
  onOpenChange,
}: ConfirmDialogProps): React.ReactElement {
  const closeIntentRef = useRef<'confirm' | 'cancel' | null>(null);

  const portalContainer =
    container instanceof ShadowRoot
      ? (container as unknown as HTMLElement)
      : container ?? undefined;

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && closeIntentRef.current === null) {
        onCancel();
      }
      onOpenChange?.(nextOpen);
      if (!nextOpen) {
        closeIntentRef.current = null;
      }
    },
    [onCancel, onOpenChange],
  );

  const handleConfirm = useCallback(() => {
    closeIntentRef.current = 'confirm';
    onConfirm();
  }, [onConfirm]);

  const handleCancel = useCallback(() => {
    closeIntentRef.current = 'cancel';
    onCancel();
  }, [onCancel]);

  return (
    <AlertDialog.Root open={open} onOpenChange={handleOpenChange}>
      <AlertDialog.Portal
        {...(portalContainer ? { container: portalContainer as HTMLElement } : {})}
      >
        <AlertDialog.Overlay
          className={cn(
            'fixed inset-0 bg-black/60 backdrop-blur-[1px] data-[state=open]:animate-in data-[state=closed]:animate-out',
          )}
          style={{ zIndex: CONFIRM_OVERLAY_Z_INDEX }}
        />

        <AlertDialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 bg-bg-primary p-6 shadow-lg outline-none sm:rounded-lg',
          )}
          style={{ zIndex: CONFIRM_CONTENT_Z_INDEX }}
        >
          {title ? (
            <AlertDialog.Title className="text-lg font-semibold tracking-tight text-text-primary">
              {title}
            </AlertDialog.Title>
          ) : null}
          {description ? (
            <AlertDialog.Description className="mt-2 text-sm text-text-secondary">
              {description}
            </AlertDialog.Description>
          ) : null}

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:space-x-2 sm:gap-0">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary" type="button" onClick={handleCancel} autoFocus>
                {cancelText}
              </Button>
            </AlertDialog.Cancel>

            <AlertDialog.Action asChild>
              <Button type="button" onClick={handleConfirm} className="bg-error text-white">
                {confirmText}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
