import React, { useCallback, useContext, useState } from 'react';
import ConfirmDialog from '@/shared/components/confirm-dialog';

type ConfirmOptions = {
  title?: React.ReactNode;
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
};

type ContextType = {
  confirm: (opts?: ConfirmOptions) => Promise<boolean>;
};

const ConfirmContext = React.createContext<ContextType | null>(null);

export const ConfirmProvider: React.FC<React.PropsWithChildren<unknown>> = ({ children }) => {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions | undefined>(undefined);
  const [resolver, setResolver] = useState<((value: boolean) => void) | null>(null);

  const confirm = useCallback((options?: ConfirmOptions) => {
    return new Promise<boolean>(resolve => {
      setOpts(options);
      setResolver(() => resolve);
      setOpen(true);
    });
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
    setOpts(undefined);
    setResolver(null);
  }, []);

  const handleConfirm = useCallback(() => {
    if (resolver) resolver(true);
    handleClose();
  }, [resolver, handleClose]);

  const handleCancel = useCallback(() => {
    if (resolver) resolver(false);
    handleClose();
  }, [resolver, handleClose]);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <ConfirmDialog
        open={open}
        title={opts?.title}
        description={opts?.description}
        confirmText={opts?.confirmText ?? 'Confirm'}
        cancelText={opts?.cancelText ?? 'Cancel'}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        onOpenChange={setOpen}
      />
    </ConfirmContext.Provider>
  );
};

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm must be used within a ConfirmProvider');
  }
  return ctx.confirm;
}

export default useConfirm;
