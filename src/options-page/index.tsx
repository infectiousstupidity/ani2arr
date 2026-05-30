/** Main options page shell, navigation, and unsaved-work guards. */
// src/options-page/index.tsx

import { useEffect, useMemo, useState } from "react";
import { useFormContext, useFormState } from "react-hook-form";
import type { Provider } from "@/providers";
import {
  useExtensionOptions,
  useOptionsQuerySync,
  usePublicOptions,
} from "@/queries/options";
import { useStoredProviderConnectionStatus } from "@/queries/provider-connection";
import { useA2aBroadcasts } from "@/queries/use-a2a-broadcasts";
import { getProviderCredentials, type PublicOptions } from "@/settings";

import { ConfirmDialog } from "./components/ui/alert-dialog";
import { useRadarrActions } from "./hooks/use-radarr-actions";
import { useSonarrActions } from "./hooks/use-sonarr-actions";
import { useHashRoute, type PageId } from "./navigation";
import { GlobalSaveButton, UniversalFormProvider } from "./universal-form";
import {
  DesktopPageHeader,
  DesktopSidebar,
  MobileBottomNav,
  MobileTopBar,
} from "./components/options-navigation";
import { AdvancedPage } from "./pages/advanced-page";
import { MappingsPage } from "./pages/mapping-page";
import { RadarrPage } from "./pages/radarr-page";
import { SonarrPage } from "./pages/sonarr-page";
import { UiPage } from "./pages/ui-page";

export const OptionsPage = () => {
  useOptionsQuerySync();

  return (
    <UniversalFormProvider>
      <OptionsPageContent />
    </UniversalFormProvider>
  );
};

const OptionsPageContent = () => {
  useA2aBroadcasts();

  const { page, setPage } = useHashRoute();
  const { reset } = useFormContext<PublicOptions>();
  const { isDirty } = useFormState<PublicOptions>();
  const extensionOptionsQuery = useExtensionOptions();
  const publicOptionsQuery = usePublicOptions();
  const sonarrActions = useSonarrActions();
  const radarrActions = useRadarrActions();

  const [hasConnectionDraftChanges, setHasConnectionDraftChanges] = useState(false);
  const [pendingPage, setPendingPage] = useState<PageId | null>(null);
  const [pendingDisconnectProvider, setPendingDisconnectProvider] = useState<Provider | null>(null);

  const hasUnsavedChanges = isDirty || hasConnectionDraftChanges;

  const sonarrCredentials = useMemo(
    () => getProviderCredentials(extensionOptionsQuery.data, "sonarr"),
    [extensionOptionsQuery.data],
  );
  const radarrCredentials = useMemo(
    () => getProviderCredentials(extensionOptionsQuery.data, "radarr"),
    [extensionOptionsQuery.data],
  );

  const isSonarrStoredConfigured = publicOptionsQuery.data?.providers.sonarr.isConfigured === true;
  const isRadarrStoredConfigured = publicOptionsQuery.data?.providers.radarr.isConfigured === true;

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

  const statuses = useMemo(
    () => ({ sonarr: sonarrStatus, radarr: radarrStatus }),
    [radarrStatus, sonarrStatus],
  );

  const isProviderActionPending = sonarrActions.isConnecting || radarrActions.isConnecting;

  const requestDisconnect = (provider: Provider) => {
    setPendingDisconnectProvider(provider);
  };

  const confirmDisconnect = async () => {
    if (!pendingDisconnectProvider || isProviderActionPending) return;

    const success =
      pendingDisconnectProvider === "sonarr"
        ? await sonarrActions.disconnectSonarr()
        : await radarrActions.disconnectRadarr();

    if (!success) return;
    setHasConnectionDraftChanges(false);
    setPendingDisconnectProvider(null);
  };

  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    globalThis.addEventListener("beforeunload", handleBeforeUnload);
    return () => globalThis.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const requestPageChange = (nextPage: PageId) => {
    if (nextPage === page) return;

    if (hasUnsavedChanges) {
      setPendingPage(nextPage);
      return;
    }

    setHasConnectionDraftChanges(false);
    setPage(nextPage);
  };

  const confirmPageChange = () => {
    if (publicOptionsQuery.data) {
      reset(publicOptionsQuery.data);
    }

    setHasConnectionDraftChanges(false);
    if (pendingPage) {
      setPage(pendingPage);
    }
    setPendingPage(null);
  };

  const renderActivePage = () => {
    switch (page) {
      case "sonarr": {
        return (
          <SonarrPage
            connectSonarr={sonarrActions.connectSonarr}
            connectionError={sonarrActions.error}
            isConnecting={sonarrActions.isConnecting}
            onConnectionDraftDirtyChange={setHasConnectionDraftChanges}
          />
        );
      }
      case "radarr": {
        return (
          <RadarrPage
            connectRadarr={radarrActions.connectRadarr}
            connectionError={radarrActions.error}
            isConnecting={radarrActions.isConnecting}
            onConnectionDraftDirtyChange={setHasConnectionDraftChanges}
          />
        );
      }
      case "mappings": {
        return <MappingsPage />;
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
            onConnectionDraftDirtyChange={setHasConnectionDraftChanges}
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
        saveControl={<GlobalSaveButton isCompact label="Save" />}
        statuses={statuses}
        onDisconnect={requestDisconnect}
      />

      <div className="md:mx-auto md:flex md:h-screen md:w-full md:max-w-360 md:overflow-hidden">
        <DesktopSidebar
          activePage={page}
          statuses={statuses}
          onPageSelect={requestPageChange}
        />

        <div className="min-w-0 flex-1 md:h-screen md:overflow-y-auto">
          <main className="flex w-full max-w-280 flex-col px-4 pb-28 pt-8 md:px-[clamp(32px,4vw,64px)] md:pb-16 md:pt-12">
            <DesktopPageHeader
              activePage={page}
              isDisconnecting={isProviderActionPending}
              saveControl={<GlobalSaveButton label="Save changes" className="shrink-0" />}
              statuses={statuses}
              onDisconnect={requestDisconnect}
            />
            {renderActivePage()}
          </main>
        </div>
      </div>

      <MobileBottomNav activePage={page} onPageSelect={requestPageChange} />

      {pendingPage === null ? null : (
        <ConfirmDialog
          open={true}
          onOpenChange={(open) => {
            if (open) return;
            setPendingPage(null);
          }}
          title="Discard unsaved changes?"
          description="Unsaved settings or connection edits on this page will be lost."
          confirmText="Discard"
          cancelText="Stay"
          onConfirm={confirmPageChange}
          isDestructive={true}
        />
      )}

      {pendingDisconnectProvider === null ? null : (
        <ConfirmDialog
          open={true}
          onOpenChange={(open) => {
            if (open) return;
            setPendingDisconnectProvider(null);
          }}
          title={`Disconnect ${pendingDisconnectProvider === "radarr" ? "Radarr" : "Sonarr"}?`}
          description="This will clear the saved URL, API key, and provider defaults for this provider."
          confirmText={isProviderActionPending ? "Disconnecting..." : "Disconnect"}
          cancelText="Cancel"
          onConfirm={confirmDisconnect}
          isDestructive={true}
        />
      )}
    </div>
  );
};
