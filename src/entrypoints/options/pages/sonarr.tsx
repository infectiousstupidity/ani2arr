import React from 'react';
import SectionHeader from '@/entrypoints/options/components/section-header';
import { SettingsFormWithManager, type SettingsManager } from '@/shared/components/settings-form';

const SonarrPage: React.FC<{ manager: SettingsManager }> = ({ manager }) => (
  <div className="space-y-6">
    <SectionHeader
      title="Sonarr"
      description="Connection settings and default add options for Sonarr."
    />
    <SettingsFormWithManager manager={manager} sonarrFormLayout="grid" />
  </div>
);

export default SonarrPage;
