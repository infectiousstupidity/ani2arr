/** Local options-page confirmation dialog built on Radix AlertDialog primitives. */
// src/options-page/components/ui/alert-dialog.tsx

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { Button } from "./button";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  cancelText?: string;
  confirmText?: string;
  onConfirm: () => void;
  isDestructive?: boolean;
}

export const ConfirmDialog = ({
  open,
  onOpenChange,
  title,
  description,
  cancelText = "Cancel",
  confirmText = "Confirm",
  onConfirm,
  isDestructive = false,
}: ConfirmDialogProps) => {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <AlertDialog.Content className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border border-border-primary bg-bg-secondary p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-2xl">
          <div className="flex flex-col space-y-2 text-center sm:text-left">
            <AlertDialog.Title className="text-lg font-semibold text-text-primary">
              {title}
            </AlertDialog.Title>
            <AlertDialog.Description className="text-sm text-text-secondary">
              {description}
            </AlertDialog.Description>
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">
            <AlertDialog.Cancel asChild>
              <Button variant="outline" className="mt-2 sm:mt-0">
                {cancelText}
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button
                variant={isDestructive ? "destructive" : "primary"}
                onClick={onConfirm}
              >
                {confirmText}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
};
