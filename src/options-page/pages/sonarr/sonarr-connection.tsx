/** Sonarr connection draft fields for the options page. */
// src/options-page/pages/sonarr/sonarr-connection.tsx

import { useEffect, useState, type SubmitEvent } from "react";
import { Plug } from "lucide-react";
import { useExtensionOptions } from "@/queries/options";
import {
	getProviderConnectionDraft,
	hasConfiguredProviderCredentials,
} from "@/settings";
import { SettingsRow, SettingsSection } from "../../components/settings-section";
import { Button } from "../../components/ui/button";
import { Input, PasswordInput } from "../../components/ui/input";

interface SonarrConnectionProps {
  onDraftDirtyChange: (dirty: boolean) => void;
  connectSonarr: (url: string, apiKey: string) => Promise<boolean>;
  isConnecting: boolean;
  error: string | null;
}

export const SonarrConnection = ({
  connectSonarr,
  error,
  isConnecting,
  onDraftDirtyChange,
}: SonarrConnectionProps) => {
  const { data: savedSettings } = useExtensionOptions();
  const savedCredentials = getProviderConnectionDraft(savedSettings, "sonarr");

  const savedUrl = savedCredentials.url;
  const savedApiKey = savedCredentials.apiKey;
  const isConfigured = hasConfiguredProviderCredentials(savedSettings, "sonarr");

  return (
    <SonarrConnectionDraft
      key={`${savedUrl}\u0000${savedApiKey}`}
      connectSonarr={connectSonarr}
      error={error}
      isConfigured={isConfigured}
      isConnecting={isConnecting}
      savedApiKey={savedApiKey}
      savedUrl={savedUrl}
      onDraftDirtyChange={onDraftDirtyChange}
    />
  );
};

interface SonarrConnectionDraftProps extends SonarrConnectionProps {
  savedUrl: string;
  savedApiKey: string;
  isConfigured: boolean;
}

const SonarrConnectionDraft = ({
  connectSonarr,
  error,
  isConfigured,
  isConnecting,
  savedApiKey,
  savedUrl,
  onDraftDirtyChange,
}: SonarrConnectionDraftProps) => {
  const [draftUrl, setDraftUrl] = useState(savedUrl);
  const [draftApiKey, setDraftApiKey] = useState(savedApiKey);
  const hasDraftChanges = draftUrl !== savedUrl || draftApiKey !== savedApiKey;
  const showConnectionActions = !isConfigured || hasDraftChanges || Boolean(error);
  let connectButtonLabel = "Connect and save";

  if (isConnecting) {
    connectButtonLabel = "Connecting...";
  } else if (isConfigured) {
    connectButtonLabel = "Reconnect";
  }

  useEffect(() => {
    return () => onDraftDirtyChange(false);
  }, [onDraftDirtyChange]);

  const updateDraftUrl = (nextUrl: string) => {
    setDraftUrl(nextUrl);
    onDraftDirtyChange(nextUrl !== savedUrl || draftApiKey !== savedApiKey);
  };

  const updateDraftApiKey = (nextApiKey: string) => {
    setDraftApiKey(nextApiKey);
    onDraftDirtyChange(draftUrl !== savedUrl || nextApiKey !== savedApiKey);
  };

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isConnecting || !draftUrl || !draftApiKey) {
      return;
    }

    const success = await connectSonarr(draftUrl, draftApiKey);
    if (success) {
      onDraftDirtyChange(false);
    }
  };

  const handleCancel = () => {
    setDraftUrl(savedUrl);
    setDraftApiKey(savedApiKey);
    onDraftDirtyChange(false);
  };

  return (
    <SettingsSection title="Connection" icon={<Plug className="h-4 w-4" />} hideHeaderOnDesktop>
      <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-6">
        <SettingsRow
          id="sonarr-url"
          label="Sonarr URL"
          description="Hostname or IP address."
        >
          <Input
            id="sonarr-url"
            value={draftUrl}
            onChange={(event) => updateDraftUrl(event.target.value)}
            placeholder="http://localhost:8989"
            disabled={isConnecting}
          />
        </SettingsRow>

        <SettingsRow
          id="sonarr-api-key"
          label="Sonarr API Key"
          description="Find this in Sonarr's Settings > General."
        >
          <PasswordInput
            id="sonarr-api-key"
            value={draftApiKey}
            onChange={(event) => updateDraftApiKey(event.target.value)}
            placeholder="Your Sonarr API key"
            disabled={isConnecting}
          />
        </SettingsRow>

        {showConnectionActions ? (
          <div className="mt-2 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
            {error ? (
              <p className="text-sm font-semibold text-error sm:mr-auto">
                {error}
              </p>
            ) : null}
            {isConfigured && hasDraftChanges ? (
              <Button
                type="button"
                variant="ghost"
                onClick={handleCancel}
                disabled={isConnecting}
              >
                Cancel
              </Button>
            ) : null}
            <Button
              type="submit"
              variant="primary"
              disabled={isConnecting || !draftUrl || !draftApiKey}
            >
              {connectButtonLabel}
            </Button>
          </div>
        ) : null}
      </form>
    </SettingsSection>
  );
};
