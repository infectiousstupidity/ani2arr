import React from 'react';
import Button from '@/shared/components/button';
import {
  Modal,
  ModalContent,
  ModalTitle,
  ModalDescription,
  ModalFooter,
} from '@/features/media-modal/components/modal';

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
    <Modal open={open} {...(onOpenChange && { onOpenChange })}>
      <ModalContent>
        {title ? <ModalTitle>{title}</ModalTitle> : null}
        {description ? <ModalDescription>{description}</ModalDescription> : null}
        <ModalFooter>
          <Button variant="secondary" type="button" onClick={onCancel}>
            {cancelText}
          </Button>
          <Button type="button" onClick={onConfirm} className="text-white bg-error">
            {confirmText}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
