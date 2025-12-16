// src/entrypoints/options/components/advanced-section.tsx
import React, { useMemo, useState } from 'react';
import { browser } from 'wxt/browser';
import { useFormContext, useWatch } from 'react-hook-form';
import Button from '@/shared/components/button';
import TooltipWrapper from '@/shared/components/tooltip';
import { useConfirm } from '@/shared/hooks/use-confirm';
import { useToast } from '@/shared/components/toast-provider';
import type { SettingsFormValues } from '@/shared/schemas/settings';
import type { SettingsActions } from '@/shared/hooks/use-settings-actions';

const AdvancedSection: React.FC<{ actions: SettingsActions }> = ({ actions }) => {
  const confirm = useConfirm();
  const toast = useToast();
  const [isResetting, setIsResetting] = useState(false);
  const version = useMemo(() => browser.runtime.getManifest()?.version ?? 'unknown', []);
  const methods = useFormContext<SettingsFormValues>();
  const debugLogging = Boolean(useWatch({ control: methods.control, name: 'debugLogging' as const }));

  const handleReset = async () => {
    const shouldReset = await confirm({
      title: 'Reset all settings?',
      description: 'This clears ani2arr configuration and permissions. Sonarr data is not affected.',
      confirmText: 'Reset',
      cancelText: 'Cancel',
    });
    if (!shouldReset) return;
    setIsResetting(true);
    try {
      await actions.handleReset();
      toast.showToast({
        title: 'Settings reset',
        description: 'ani2arr settings returned to defaults.',
        variant: 'success',
      });
    } catch (error) {
      toast.showToast({
        title: 'Reset failed',
        description: (error as Error)?.message ?? 'Unable to reset settings.',
        variant: 'error',
      });
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Advanced</h2>
        <p className="text-sm text-text-secondary">
          Diagnostics and safety tools.
        </p>
      </div>

      <div className="rounded-2xl border border-border-primary bg-bg-secondary/70">
        <div className="px-4 py-3 border-b border-border-primary">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">Diagnostics</h3>
              <p className="mt-1 text-xs text-text-secondary">
                Verbose logging and reset controls.
              </p>
            </div>
            <TooltipWrapper content="Debug logging writes verbose messages to the console. Disable for normal use.">
              <span className="text-[11px] text-text-secondary">Debug</span>
            </TooltipWrapper>
          </div>
        </div>
        <div className="space-y-4 px-4 py-4">
          <div className="flex items-center justify-between gap-4 rounded-xl bg-bg-tertiary/60 px-3 py-2">
            <div>
              <p className="text-sm text-text-primary">Debug logging</p>
              <p className="text-xs text-text-secondary">
                Enable verbose console output for troubleshooting.
              </p>
            </div>
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={debugLogging}
              onChange={(e) => methods.setValue('debugLogging', e.target.checked, { shouldDirty: true })}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-primary pt-3">
            <Button
              variant="outline"
              className="text-error border-error"
              onClick={handleReset}
              isLoading={isResetting}
              disabled={actions.saveState.isPending}
            >
              Reset all settings
            </Button>
            <p className="text-xs text-text-secondary">Extension version {version}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdvancedSection;
