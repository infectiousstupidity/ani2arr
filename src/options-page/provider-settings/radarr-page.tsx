/** Radarr provider-settings page for the options feature. */
// src/options-page/provider-settings/radarr-page.tsx

import React from 'react';
import SectionHeader from '../components/section-header';
import RadarrSettingsPanel from './radarr-settings-panel';
import type { SettingsActions } from '../hooks/use-settings-actions';
import type { ExtensionOptions } from '@/options';

const RadarrPage: React.FC<{
  actions: SettingsActions;
  savedSettings?: ExtensionOptions;
  isLoading: boolean;
}> = ({ actions, savedSettings, isLoading }) => (
  <div className="space-y-6">
    <SectionHeader
      title="Radarr"
      description="Connection details, preferred title handling, and default add options for Radarr."
    />
    <RadarrSettingsPanel
      actions={actions}
      {...(savedSettings ? { savedSettings } : {})}
      isLoading={isLoading}
    />
  </div>
);

export default RadarrPage;
