import React from 'react';
import { useFormContext } from 'react-hook-form';

import type { Settings } from '@/shared/schemas/settings';
import type { SettingsActions } from '@/entrypoints/options/hooks/use-settings-actions';
import Button from '@/shared/ui/primitives/button';

export const SaveSettingsBar: React.FC<{
  actions: SettingsActions;
  isLoading?: boolean;
  className?: string;
}> = ({ actions, isLoading, className }) => {
  const { formState } = useFormContext<Settings>();

  return (
    <div className={className}>
      <div className="flex justify-end">
        <Button
          onClick={() => {
            void actions.handleSave();
          }}
          disabled={
            !formState.isDirty ||
            actions.sonarrTestConnectionState.isPending ||
            actions.radarrTestConnectionState.isPending ||
            isLoading
          }
          isLoading={actions.saveState.isPending}
          aria-busy={actions.saveState.isPending}
        >
          Save settings
        </Button>
      </div>
      {actions.saveError ? (
        <div
          className="text-center text-sm text-error"
          role="alert"
          aria-live="polite"
        >
          {actions.saveError}
        </div>
      ) : null}
    </div>
  );
};