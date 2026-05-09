/** Sonarr provider-settings page for the options feature. */
// src/options-page/provider-settings/sonarr-page.tsx

import React from 'react';
import SectionHeader from '../components/section-header';
import SonarrSettingsPanel from './sonarr-settings-panel';
import type { SettingsActions } from '../hooks/use-settings-actions';
import type { ExtensionOptions } from '@/settings';

const SonarrPage: React.FC<{
  actions: SettingsActions;
  savedSettings?: ExtensionOptions;
  isLoading: boolean;
}> = ({ actions, savedSettings, isLoading }) => (
  <div className="space-y-6">
    <SectionHeader
      title="Sonarr"
      description="Connection details, preferred title handling, and default add options for Sonarr."
    />
    <SonarrSettingsPanel
      actions={actions}
      {...(savedSettings ? { savedSettings } : {})}
      layout="grid"
      isLoading={isLoading}
    />
  </div>
);

export default SonarrPage;
