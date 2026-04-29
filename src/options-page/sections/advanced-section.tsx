/** Options-page advanced controls for diagnostics, reset actions, and privacy details. */
// src/options-page/sections/advanced-section.tsx
import React, { useEffect, useRef, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { RotateCcw } from 'lucide-react';
import Button from '@/shared/ui/primitives/button';
import { useConfirm } from '@/shared/hooks/use-confirm';
import { useToast } from '@/shared/ui/feedback/toast-provider';
import type { SettingsActions } from '../hooks/use-settings-actions';
import type { ExtensionOptions } from '@/options';

export type AdvancedPanelId = 'privacy' | null;

const AdvancedSection: React.FC<{ actions: SettingsActions; focusPanel?: AdvancedPanelId }> = ({
  actions,
  focusPanel = null,
}) => {
  const confirm = useConfirm();
  const toast = useToast();
  const [isResetting, setIsResetting] = useState(false);
  const methods = useFormContext<ExtensionOptions>();
  const debugLogging = Boolean(useWatch({ control: methods.control, name: 'debugLogging' as const }));
  const schedulerDebugOverlayEnabled = Boolean(
    useWatch({ control: methods.control, name: 'ui.schedulerDebugOverlayEnabled' as const }),
  );
  const showSchedulerDebugToggle = import.meta.env.DEV;
  const privacyCardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (focusPanel !== 'privacy') return;
    const node = privacyCardRef.current;
    if (!node) return;

    node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    globalThis.setTimeout(() => node.focus(), 120);
  }, [focusPanel]);

  const handleReset = async () => {
    const shouldReset = await confirm({
      title: 'Reset all settings?',
      description: 'This clears ani2arr configuration, stored manual mappings, cached page data, granted permissions, and session state. Sonarr and Radarr libraries are not affected.',
      confirmText: 'Reset',
      cancelText: 'Cancel',
    });
    if (!shouldReset) return;
    setIsResetting(true);
    try {
      await actions.handleReset();
      toast.showToast({
        title: 'Settings reset',
        description: 'Settings, stored mappings, cached page data, and permissions were cleared.',
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
          Low-frequency controls moved into a clearer, quieter area.
        </p>
      </div>

      <div
        ref={privacyCardRef}
        id="privacy-permissions"
        tabIndex={-1}
        className="a2a-settings-panel focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
      >
        <div className="a2a-settings-panel__header border-b px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Privacy & permissions</h3>
            <p className="mt-1 text-xs text-text-secondary">
              How ani2arr stores settings, requests host access, and talks to external services.
            </p>
          </div>
        </div>
        <div className="space-y-3 px-5 py-5 text-sm text-text-secondary">
          <p>
            ani2arr does not use a developer-operated backend or analytics service. Your Sonarr
            URL, API key, and extension settings are stored locally in the browser.
          </p>
          <ul className="space-y-2 text-xs leading-5">
            <li>Only the exact Sonarr origin you enter is requested at runtime.</li>
            <li>The API key is sent only to that configured Sonarr origin.</li>
            <li>AniList metadata is fetched from AniList GraphQL and public mapping files from GitHub.</li>
          </ul>
          <p className="text-xs">
            Full policy text is available in the repository privacy policy and AMO reviewer notes.
          </p>
        </div>
      </div>
      <div className="a2a-settings-panel">
        <div className="a2a-settings-panel__header border-b px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Diagnostics</h3>
            <p className="mt-1 text-xs text-text-secondary">
              Destructive and low-frequency actions are de-emphasized.
            </p>
          </div>
        </div>
        <div className="space-y-4 px-5 py-5">
          <div className="a2a-settings-panel__inset flex items-center justify-between gap-4 rounded-2xl px-4 py-3">
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
          {showSchedulerDebugToggle ? (
            <div className="a2a-settings-panel__inset flex items-center justify-between gap-4 rounded-2xl px-4 py-3">
              <div>
                <p className="text-sm text-text-primary">Scheduler debug overlay</p>
                <p className="text-xs text-text-secondary">
                  Show the AniList query inspector on browse pages with aggregate totals, merge previews, and sent batch history.
                </p>
              </div>
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={schedulerDebugOverlayEnabled}
                onChange={(e) =>
                  methods.setValue('ui.schedulerDebugOverlayEnabled', e.target.checked, {
                    shouldDirty: true,
                  })
                }
              />
            </div>
          ) : null}
        </div>
      </div>

      <div className="a2a-settings-panel a2a-danger-zone px-5 py-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Danger zone</h3>
          </div>
          <Button
            variant="outline"
            className="border-error text-error"
            onClick={handleReset}
            isLoading={isResetting}
            disabled={actions.isBusy || isResetting}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset all settings
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AdvancedSection;
