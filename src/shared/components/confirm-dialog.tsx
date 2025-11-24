import React from 'react';
import Button from '@/shared/components/button';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { cn } from '@/shared/utils/cn';

type ConfirmDialogProps = {
  open: boolean;
  title?: React.ReactNode;
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
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
  onConfirm,
  onCancel,
  onOpenChange,
}: ConfirmDialogProps): React.ReactElement {
  return (
    <AlertDialog.Root open={open} {...(onOpenChange ? { onOpenChange } : {})}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay
          className={cn(
            'fixed inset-0 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out',
          )}
        />

        <AlertDialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg gap-4 bg-bg-primary p-6 shadow-lg sm:rounded-lg',
          )}
        >
          {title ? <AlertDialog.Title className="text-lg font-semibold text-text-primary tracking-tight">{title}</AlertDialog.Title> : null}
          {description ? <AlertDialog.Description className="text-sm text-text-secondary mt-2">{description}</AlertDialog.Description> : null}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-6">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary" type="button" onClick={onCancel}>
                {cancelText}
              </Button>
            </AlertDialog.Cancel>

            <AlertDialog.Action asChild>
              <Button type="button" onClick={onConfirm} className="text-white bg-error">
                {confirmText}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
