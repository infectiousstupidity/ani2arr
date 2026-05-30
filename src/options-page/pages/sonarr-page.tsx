/** Sonarr options page section for connection and default add settings. */
// src/options-page/pages/sonarr-page.tsx

import { usePublicOptions } from "@/queries/options";
import { SettingsSection } from "../components/settings-section";
import { SonarrConnection } from "./sonarr/sonarr-connection";
import { SonarrDefaults } from "./sonarr/sonarr-defaults";

const DEFAULT_OPTIONS_DESCRIPTION =
  "Configures default add options reused when adding series via the extension media modal and overlay.";

interface SonarrPageProps {
  onConnectionDraftDirtyChange: (dirty: boolean) => void;
  connectSonarr: (url: string, apiKey: string) => Promise<boolean>;
  isConnecting: boolean;
  connectionError: string | null;
}

export const SonarrPage = ({
  connectSonarr,
  connectionError,
  isConnecting,
  onConnectionDraftDirtyChange,
}: SonarrPageProps) => {
  const { data: publicOptions } = usePublicOptions();
  const isConfigured = publicOptions?.providers.sonarr.isConfigured === true;

  return (
    <div className="space-y-10 md:space-y-12">
      <SonarrConnection
        connectSonarr={connectSonarr}
        error={connectionError}
        isConnecting={isConnecting}
        onDraftDirtyChange={onConnectionDraftDirtyChange}
      />
      {isConfigured ? (
        <SonarrDefaults />
      ) : (
        <SettingsSection
          title="Default add options"
          description={DEFAULT_OPTIONS_DESCRIPTION}
          className="opacity-60"
          divider="top"
        >
          <p className="py-5 text-sm text-text-secondary">
            Connect Sonarr to configure defaults.
          </p>
        </SettingsSection>
      )}
    </div>
  );
};
