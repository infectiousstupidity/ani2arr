/** Radarr options page section for connection and default add settings. */
// src/options-page/pages/radarr-page.tsx

import { RadarrConnection } from "./radarr/radarr-connection";
import { RadarrDefaults } from "./radarr/radarr-defaults";

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
  return (
      <div className="space-y-10 md:space-y-12">
        <RadarrConnection
          connectRadarr={connectRadarr}
          error={connectionError}
          isConnecting={isConnecting}
          onDraftDirtyChange={onConnectionDraftDirtyChange}
        />
        <RadarrDefaults />
      </div>
  );
};
