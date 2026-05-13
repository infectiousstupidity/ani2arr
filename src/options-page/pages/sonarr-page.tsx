/** Sonarr options page section for connection and default add settings. */
// src/options-page/pages/sonarr-page.tsx

import { SonarrConnection } from "./sonarr/sonarr-connection";
import { SonarrDefaults } from "./sonarr/sonarr-defaults";

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
  return (
      <div className="space-y-10 md:space-y-12">
        <SonarrConnection
          connectSonarr={connectSonarr}
          error={connectionError}
          isConnecting={isConnecting}
          onDraftDirtyChange={onConnectionDraftDirtyChange}
        />
        <SonarrDefaults />
      </div>
  );
};
