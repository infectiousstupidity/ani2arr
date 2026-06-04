/** Sonarr options page section for connection and default add settings. */
// src/options-page/pages/sonarr-page.tsx

import { usePublicOptions } from "@/queries/options";
import { ProviderConnectionForm } from "../components/provider-connection-form";
import { SettingsSection } from "../components/settings-section";
import { SonarrDefaults } from "./sonarr/sonarr-defaults";

const DEFAULT_OPTIONS_DESCRIPTION =
  "Configures default add options reused when adding series via the extension media modal and overlay.";

interface SonarrPageProps {
  connectSonarr: (url: string, apiKey: string) => Promise<boolean>;
  isConnecting: boolean;
  connectionError: string | null;
}

export const SonarrPage = ({
  connectSonarr,
  connectionError,
  isConnecting,
}: SonarrPageProps) => {
  const { data: publicOptions } = usePublicOptions();
  const isConfigured = publicOptions?.providers.sonarr.isConfigured === true;

  return (
    <div className="space-y-10 md:space-y-12">
      <ProviderConnectionForm
        provider="sonarr"
        label="Sonarr"
        urlPlaceholder="http://localhost:8989"
        onConnect={connectSonarr}
        error={connectionError}
        isConnecting={isConnecting}
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
