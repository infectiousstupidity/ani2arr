// src/entrypoints/options/components/advanced-section.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { useFormContext, useWatch } from 'react-hook-form';
import Button from '@/shared/ui/primitives/button';
import TooltipWrapper from '@/shared/ui/primitives/tooltip';
import { useConfirm } from '@/shared/hooks/common/use-confirm';
import { useToast } from '@/shared/ui/feedback/toast-provider';
import type { SettingsFormValues } from '@/shared/schemas/settings';
import type { SettingsActions } from '@/entrypoints/options/hooks/use-settings-actions';

export type AdvancedPanelId = 'privacy' | null;

const AdvancedSection: React.FC<{ actions: SettingsActions; focusPanel?: AdvancedPanelId }> = ({
  actions,
  focusPanel = null,
}) => {
  const confirm = useConfirm();
  const toast = useToast();
  const [isResetting, setIsResetting] = useState(false);
  const version = useMemo(() => browser.runtime.getManifest()?.version ?? 'unknown', []);
  const methods = useFormContext<SettingsFormValues>();
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
    window.setTimeout(() => node.focus(), 120);
  }, [focusPanel]);

  const handleReset = async () => {
    const shouldReset = await confirm({
      title: 'Reset all settings?',
      description: 'This clears ani2arr configuration, stored mapping overrides, cached page data, granted permissions, and session state. Sonarr and Radarr libraries are not affected.',
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
          Diagnostics and safety tools.
        </p>
      </div>

      <div
        ref={privacyCardRef}
        id="privacy-permissions"
        tabIndex={-1}
        className="rounded-2xl border border-border-primary bg-bg-secondary/70 focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
      >
        <div className="px-4 py-3 border-b border-border-primary">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Privacy & permissions</h3>
            <p className="mt-1 text-xs text-text-secondary">
              How ani2arr stores settings, requests host access, and talks to external services.
            </p>
          </div>
        </div>
        <div className="space-y-3 px-4 py-4 text-sm text-text-secondary">
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
          {showSchedulerDebugToggle ? (
            <div className="flex items-center justify-between gap-4 rounded-xl bg-bg-tertiary/60 px-3 py-2">
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
