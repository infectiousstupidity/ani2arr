/** Main options page shell, navigation, and provider disconnect flow. */
// src/options-page/index.tsx

import { useMemo, useState } from "react";
import type { Provider } from "@/providers/types";
import {
  useExtensionOptions,
  useOptionsQuerySync,
  usePublicOptions,
} from "@/queries/options";
import {
  deriveProviderConnectionStatusView,
  useStoredProviderConnectionStatus,
} from "@/queries/provider-connection";
import { useSeerrConnectionCheck } from "@/queries/seerr";
import { useA2aBroadcasts } from "@/queries/use-a2a-broadcasts";
import { getProviderCredentials } from "@/settings/provider-config";
import { getSeerrConnection } from "@/settings/seerr-config";

import { ConfirmDialog } from "./components/ui/alert-dialog";
import {
  useRadarrActions,
  useSeerrActions,
  useSonarrActions,
} from "./hooks/provider-connection-actions";
import { hasHashFlag, useHashRoute } from "./navigation";
import {
  DesktopPageHeader,
  DesktopSidebar,
  MobileBottomNav,
  MobileTopBar,
} from "./components/options-navigation";
import { AdvancedPage } from "./pages/advanced-page";
import { MappingsPage } from "./pages/mapping-page";
import { RadarrPage } from "./pages/radarr-page";
import { SeerrPage } from "./pages/seerr-page";
import { SonarrPage } from "./pages/sonarr-page";
import { UiPage } from "./pages/ui-page";

type DisconnectTarget = Provider | "seerr";

function getDisconnectTargetLabel(target: DisconnectTarget | null): string {
	if (target === "radarr") return "Radarr";
	if (target === "seerr") return "Seerr";
	return "Sonarr";
}

export const OptionsPage = () => {
  useOptionsQuerySync();
  return <OptionsPageContent />;
};

const OptionsPageContent = () => {
  useA2aBroadcasts();

  const { page, hash, setPage } = useHashRoute();
  const extensionOptionsQuery = useExtensionOptions();
  const publicOptionsQuery = usePublicOptions();
  const sonarrActions = useSonarrActions();
  const radarrActions = useRadarrActions();
  const seerrActions = useSeerrActions();

  const [pendingDisconnectProvider, setPendingDisconnectProvider] =
    useState<DisconnectTarget | null>(null);

  const sonarrCredentials = useMemo(
    () => getProviderCredentials(extensionOptionsQuery.data, "sonarr"),
    [extensionOptionsQuery.data],
  );
  const radarrCredentials = useMemo(
    () => getProviderCredentials(extensionOptionsQuery.data, "radarr"),
    [extensionOptionsQuery.data],
  );
  const seerrConnection = useMemo(
    () => getSeerrConnection(extensionOptionsQuery.data),
    [extensionOptionsQuery.data],
  );

  const isSonarrStoredConfigured =
    publicOptionsQuery.data?.providers.sonarr.isConfigured === true;
  const isRadarrStoredConfigured =
    publicOptionsQuery.data?.providers.radarr.isConfigured === true;
  const isSeerrStoredConfigured =
    publicOptionsQuery.data?.seerr.isConfigured === true;

  const sonarrStatus = useStoredProviderConnectionStatus({
    provider: "sonarr",
    isProviderConfigured: isSonarrStoredConfigured,
    credentials: sonarrCredentials,
  });

  const radarrStatus = useStoredProviderConnectionStatus({
    provider: "radarr",
    isProviderConfigured: isRadarrStoredConfigured,
    credentials: radarrCredentials,
  });

  const seerrConnectionQuery = useSeerrConnectionCheck({
    connection: seerrConnection,
    enabled: isSeerrStoredConfigured && seerrConnection !== null,
  });
  const seerrStatus = deriveProviderConnectionStatusView({
    isProviderConfigured: isSeerrStoredConfigured,
    isProviderConnected: seerrConnectionQuery.isSuccess,
    isCheckingProviderConnection:
      isSeerrStoredConfigured &&
      seerrConnection !== null &&
      seerrConnectionQuery.isFetching,
  });
  const seerrConnectionError =
    seerrActions.error ?? seerrConnectionQuery.error?.userMessage ?? null;
  const seerrConnectionErrorCode =
    seerrActions.errorCode ?? seerrConnectionQuery.error?.code ?? null;

  const statuses = useMemo(
    () => ({ sonarr: sonarrStatus, radarr: radarrStatus, seerr: seerrStatus }),
    [radarrStatus, seerrStatus, sonarrStatus],
  );

  const isProviderActionPending =
    sonarrActions.isConnecting ||
    radarrActions.isConnecting ||
    seerrActions.isConnecting;
  const showSeerrCsrfSupport = hasHashFlag(hash, "enableCsrf");

  if (publicOptionsQuery.isLoading || !publicOptionsQuery.data) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg-primary text-text-secondary">
        Loading settings...
      </div>
    );
  }

  const requestDisconnect = (provider: DisconnectTarget) => {
    setPendingDisconnectProvider(provider);
  };

  const confirmDisconnect = async () => {
    if (!pendingDisconnectProvider || isProviderActionPending) return;

    let success = false;
    if (pendingDisconnectProvider === "sonarr") {
      success = await sonarrActions.disconnectSonarr();
    } else if (pendingDisconnectProvider === "radarr") {
      success = await radarrActions.disconnectRadarr();
    } else {
      success = await seerrActions.disconnectSeerr();
    }

    if (!success) return;
    setPendingDisconnectProvider(null);
  };

  const pendingDisconnectLabel = getDisconnectTargetLabel(
    pendingDisconnectProvider,
  );
  const disconnectDescription =
    pendingDisconnectProvider === "seerr"
      ? "This will clear the saved Seerr connection."
      : "This will clear the saved URL and API key for this connection.";

  const renderActivePage = () => {
    switch (page) {
      case "sonarr": {
        return (
          <SonarrPage
            connectSonarr={sonarrActions.connectSonarr}
            connectionError={sonarrActions.error}
            isConnecting={sonarrActions.isConnecting}
          />
        );
      }
      case "radarr": {
        return (
          <RadarrPage
            connectRadarr={radarrActions.connectRadarr}
            connectionError={radarrActions.error}
            isConnecting={radarrActions.isConnecting}
          />
        );
      }
      case "seerr": {
        return (
          <SeerrPage
            checkSeerrSession={seerrActions.checkSeerrSession}
            connectSeerrApiKey={seerrActions.connectSeerrApiKey}
            connectionError={seerrConnectionError}
            connectionErrorCode={seerrConnectionErrorCode}
            enableSeerrCsrfSupport={seerrActions.enableSeerrCsrfSupport}
            isConnecting={seerrActions.isConnecting}
            isCsrfSupportEnabled={seerrActions.isCsrfSupportEnabled}
            openSeerrLogin={seerrActions.openSeerrLogin}
            showCsrfSupport={showSeerrCsrfSupport}
          />
        );
      }
      case "mappings": {
        return <MappingsPage hash={hash} />;
      }
      case "ui": {
        return <UiPage />;
      }
      case "advanced": {
        return <AdvancedPage />;
      }
      default: {
        return (
          <SonarrPage
            connectSonarr={sonarrActions.connectSonarr}
            connectionError={sonarrActions.error}
            isConnecting={sonarrActions.isConnecting}
          />
        );
      }
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <MobileTopBar
        activePage={page}
        isDisconnecting={isProviderActionPending}
        statuses={statuses}
        onDisconnect={requestDisconnect}
      />

      <div className="md:mx-auto md:flex md:h-screen md:w-full md:max-w-360 md:overflow-hidden">
        <DesktopSidebar
          activePage={page}
          statuses={statuses}
          onPageSelect={setPage}
        />

        <div className="min-w-0 flex-1 md:h-screen md:overflow-y-auto">
          <main className="flex w-full max-w-280 flex-col px-4 pb-28 pt-8 md:px-[clamp(32px,4vw,64px)] md:pb-16 md:pt-12">
            <DesktopPageHeader
              activePage={page}
              isDisconnecting={isProviderActionPending}
              statuses={statuses}
              onDisconnect={requestDisconnect}
            />
            {renderActivePage()}
          </main>
        </div>
      </div>

      <MobileBottomNav activePage={page} onPageSelect={setPage} />

      {pendingDisconnectProvider === null ? null : (
        <ConfirmDialog
          open={true}
          onOpenChange={(open) => {
            if (open) return;
            setPendingDisconnectProvider(null);
          }}
          title={`Disconnect ${pendingDisconnectLabel}?`}
          description={disconnectDescription}
          confirmText={
            isProviderActionPending ? "Disconnecting..." : "Disconnect"
          }
          cancelText="Cancel"
          onConfirm={confirmDisconnect}
          isDestructive={true}
        />
      )}
    </div>
  );
};
