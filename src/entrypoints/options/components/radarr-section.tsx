import React from 'react';
import SectionHeader from '@/entrypoints/options/components/section-header';
import RadarrSettingsForm from '@/entrypoints/options/components/settings-radarr-form';
import type { Settings } from '@/shared/schemas/settings';
import type { SettingsActions } from '@/entrypoints/options/hooks/use-settings-actions';

const RadarrPage: React.FC<{
  actions: SettingsActions;
  savedSettings?: Settings;
  isLoading: boolean;
}> = ({ actions, savedSettings, isLoading }) => (
  <div className="space-y-6">
    <SectionHeader
      title="Radarr"
      description="Connection settings and default add options for Radarr."
    />
    <RadarrSettingsForm
      actions={actions}
      {...(savedSettings ? { savedSettings } : {})}
      isLoading={isLoading}
    />
  </div>
);

export default RadarrPage;
