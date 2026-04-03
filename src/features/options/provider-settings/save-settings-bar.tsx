/** Provider-settings save bar for persisting dirty options-form changes. */
// src/features/options/provider-settings/save-settings-bar.tsx

import React from 'react';
import { useFormContext } from 'react-hook-form';

import type { SettingsActions } from '@/features/options/use-settings-actions';
import Button from '@/shared/ui/primitives/button';
import type { ExtensionOptions } from '@/options';

export const SaveSettingsBar: React.FC<{
  actions: SettingsActions;
  isLoading?: boolean;
  className?: string;
}> = ({ actions, isLoading, className }) => {
  const { formState } = useFormContext<ExtensionOptions>();

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
