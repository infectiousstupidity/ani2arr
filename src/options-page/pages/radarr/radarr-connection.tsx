/** Radarr connection draft fields for the options page. */
// src/options-page/pages/radarr/radarr-connection.tsx

import { useEffect, useState, type FormEvent } from "react";
import { Plug } from "lucide-react";
import { useExtensionOptions } from "@/queries/options";
import {
	getProviderConnectionDraft,
	hasConfiguredProviderCredentials,
} from "@/settings";
import { SettingsRow, SettingsSection } from "../../components/settings-section";
import { Button } from "../../components/ui/button";
import { Input, PasswordInput } from "../../components/ui/input";

interface RadarrConnectionProps {
  onDraftDirtyChange: (dirty: boolean) => void;
  connectRadarr: (url: string, apiKey: string) => Promise<boolean>;
  isConnecting: boolean;
  error: string | null;
}

export const RadarrConnection = ({
  connectRadarr,
  error,
  isConnecting,
  onDraftDirtyChange,
}: RadarrConnectionProps) => {
  const { data: savedSettings } = useExtensionOptions();
  const savedCredentials = getProviderConnectionDraft(savedSettings, "radarr");

  const savedUrl = savedCredentials.url;
  const savedApiKey = savedCredentials.apiKey;
  const isConfigured = hasConfiguredProviderCredentials(savedSettings, "radarr");

  return (
    <RadarrConnectionDraft
      key={`${savedUrl}\u0000${savedApiKey}`}
      connectRadarr={connectRadarr}
      error={error}
      isConfigured={isConfigured}
      isConnecting={isConnecting}
      savedApiKey={savedApiKey}
      savedUrl={savedUrl}
      onDraftDirtyChange={onDraftDirtyChange}
    />
  );
};

interface RadarrConnectionDraftProps extends RadarrConnectionProps {
  savedUrl: string;
  savedApiKey: string;
  isConfigured: boolean;
}

const RadarrConnectionDraft = ({
  connectRadarr,
  error,
  isConfigured,
  isConnecting,
  savedApiKey,
  savedUrl,
  onDraftDirtyChange,
}: RadarrConnectionDraftProps) => {
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isConnecting || !draftUrl || !draftApiKey) {
      return;
    }

    const success = await connectRadarr(draftUrl, draftApiKey);
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
          id="radarr-url"
          label="Radarr URL"
          description="Hostname or IP address."
        >
          <Input
            id="radarr-url"
            value={draftUrl}
            onChange={(event) => updateDraftUrl(event.target.value)}
            placeholder="http://localhost:7878"
            disabled={isConnecting}
          />
        </SettingsRow>

        <SettingsRow
          id="radarr-api-key"
          label="Radarr API Key"
          description="Find this in Radarr's Settings > General."
        >
          <PasswordInput
            id="radarr-api-key"
            value={draftApiKey}
            onChange={(event) => updateDraftApiKey(event.target.value)}
            placeholder="Your Radarr API key"
            disabled={isConnecting}
          />
        </SettingsRow>

        {showConnectionActions ? (
          <div className="mt-2 flex min-w-0 flex-col gap-3 border-t border-border-primary/20 pt-6 sm:flex-row sm:items-center sm:justify-end">
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
