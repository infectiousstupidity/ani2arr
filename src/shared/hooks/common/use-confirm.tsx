import React, { useCallback, useContext, useState } from 'react';
import ConfirmDialog from '@/shared/ui/primitives/confirm-dialog';

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

type ConfirmProviderProps = React.PropsWithChildren<{
  portalContainer?: HTMLElement | ShadowRoot | null;
}>;

export const ConfirmProvider: React.FC<ConfirmProviderProps> = ({ children, portalContainer }) => {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions | undefined>(undefined);
  const [resolver, setResolver] = useState<((value: boolean) => void) | null>(null);

  const confirm = useCallback((options?: ConfirmOptions) => {
    return new Promise<boolean>(resolvePromise => {
      setOpts(options);
      setResolver(() => resolvePromise);
      setOpen(true);
    });
  }, []);

  const handleResolve = useCallback(
    (value: boolean) => {
      if (resolver) {
        resolver(value);
      }
      setOpen(false);
      setOpts(undefined);
      setResolver(null);
    },
    [resolver],
  );

  const handleConfirm = useCallback(() => {
    handleResolve(true);
  }, [handleResolve]);

  const handleCancel = useCallback(() => {
    handleResolve(false);
  }, [handleResolve]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && open) {
        handleResolve(false);
        return;
      }
      setOpen(nextOpen);
    },
    [handleResolve, open],
  );

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
        onOpenChange={handleOpenChange}
        container={portalContainer ?? null}
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
