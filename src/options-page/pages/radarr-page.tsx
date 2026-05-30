/** Radarr options page section for connection and default add settings. */
// src/options-page/pages/radarr-page.tsx

import { usePublicOptions } from "@/queries/options";
import { SettingsSection } from "../components/settings-section";
import { RadarrConnection } from "./radarr/radarr-connection";
import { RadarrDefaults } from "./radarr/radarr-defaults";

const DEFAULT_OPTIONS_DESCRIPTION =
  "Configures default add options reused when adding movies via the extension media modal and overlay.";

interface RadarrPageProps {
  onConnectionDraftDirtyChange: (dirty: boolean) => void;
  connectRadarr: (url: string, apiKey: string) => Promise<boolean>;
  isConnecting: boolean;
  connectionError: string | null;
}

export const RadarrPage = ({
  connectRadarr,
  connectionError,
  isConnecting,
  onConnectionDraftDirtyChange,
}: RadarrPageProps) => {
  const { data: publicOptions } = usePublicOptions();
  const isConfigured = publicOptions?.providers.radarr.isConfigured === true;

  return (
    <div className="space-y-10 md:space-y-12">
      <RadarrConnection
        connectRadarr={connectRadarr}
        error={connectionError}
        isConnecting={isConnecting}
        onDraftDirtyChange={onConnectionDraftDirtyChange}
      />
      {isConfigured ? (
        <RadarrDefaults />
      ) : (
        <SettingsSection
          title="Default add options"
          description={DEFAULT_OPTIONS_DESCRIPTION}
          className="opacity-60"
          divider="top"
        >
          <p className="py-5 text-sm text-text-secondary">
            Connect Radarr to configure defaults.
          </p>
        </SettingsSection>
      )}
    </div>
  );
};
