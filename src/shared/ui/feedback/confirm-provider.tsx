/** Shared confirmation dialog provider and action state. */
// src/shared/ui/feedback/confirm-provider.tsx

import { useCallback, useMemo, useRef, useState, type PropsWithChildren } from 'react';

import ConfirmDialog from '@/shared/ui/primitives/confirm-dialog';
import type { FloatingPortalContainer } from '@/shared/ui/portal-container';

import { ConfirmContext, type ConfirmOptions } from './confirm-context';

type ConfirmProviderProps = PropsWithChildren<{
  portalContainer?: FloatingPortalContainer | undefined;
}>;

export function ConfirmProvider({
  children,
  portalContainer,
}: ConfirmProviderProps) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>();
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const resolveConfirm = useCallback((value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setOpen(false);
    setOptions(undefined);
  }, []);

  const confirm = useCallback((nextOptions?: ConfirmOptions) => {
    return new Promise<boolean>(resolve => {
      resolverRef.current?.(false);
      resolverRef.current = resolve;
      setOptions(nextOptions);
      setOpen(true);
    });
  }, []);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        resolveConfirm(false);
        return;
      }

      setOpen(true);
    },
    [resolveConfirm],
  );

  const contextValue = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext value={contextValue}>
      {children}

      <ConfirmDialog
        open={open}
        title={options?.title}
        description={options?.description}
        confirmText={options?.confirmText ?? 'Confirm'}
        cancelText={options?.cancelText ?? 'Cancel'}
        onConfirm={() => resolveConfirm(true)}
        onCancel={() => resolveConfirm(false)}
        onOpenChange={handleOpenChange}
        container={portalContainer ?? null}
      />
    </ConfirmContext>
  );
}
