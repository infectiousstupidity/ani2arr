import React from 'react';
import SectionHeader from '@/entrypoints/options/components/section-header';
import SettingsForm from '@/shared/components/settings-form';
import type { Settings } from '@/shared/schemas/settings';
import type { SettingsActions } from '@/shared/hooks/use-settings-actions';

const SonarrPage: React.FC<{
  actions: SettingsActions;
  savedSettings?: Settings;
  isLoading: boolean;
}> = ({ actions, savedSettings, isLoading }) => (
  <div className="space-y-6">
    <SectionHeader
      title="Sonarr"
      description="Connection settings and default add options for Sonarr."
    />
    <SettingsForm
      actions={actions}
      {...(savedSettings ? { savedSettings } : {})}
      sonarrFormLayout="grid"
      isLoading={isLoading}
    />
  </div>
);

export default SonarrPage;
