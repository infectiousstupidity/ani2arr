/** Main options page shell, navigation, and unsaved-work guards. */
// src/options-page/index.tsx

import { useEffect, useState } from "react";
import { useFormContext, useFormState } from "react-hook-form";
import type { Provider } from "@/providers";
import { useExtensionOptions, usePublicOptions } from "@/queries/options";
import { useProviderConnectionStatus } from "@/queries/provider-connection";
import { getProviderCredentials, type PublicOptions } from "@/settings";

import { useHashRoute, type PageId } from "./navigation";
import { SonarrPage } from "./pages/sonarr-page";
import { RadarrPage } from "./pages/radarr-page";
import { UiPage } from "./pages/ui-page";
import { AdvancedPage } from "./pages/advanced-page";
import { MappingsPage } from "./pages/mapping-page";
import { UniversalFormProvider } from "./universal-form";
import { ConfirmDialog } from "./components/ui/alert-dialog";
import {
  DesktopPageHeader,
  DesktopSidebar,
  MobileBottomNav,
  MobileTopBar,
} from "./components/options-navigation";
import { useRadarrActions } from "./hooks/use-radarr-actions";
import { useSonarrActions } from "./hooks/use-sonarr-actions";

export const OptionsPage = () => {
  return (
    <UniversalFormProvider>
      <OptionsPageContent />
    </UniversalFormProvider>
  );
};

const OptionsPageContent = () => {
  const { page, setPage } = useHashRoute();
  const { reset } = useFormContext<PublicOptions>();
  const { isDirty } = useFormState<PublicOptions>();
  const optionsQuery = useExtensionOptions();
  const publicOptionsQuery = usePublicOptions();
  const [hasConnectionDraftChanges, setHasConnectionDraftChanges] = useState(false);
  const [pendingPage, setPendingPage] = useState<PageId | null>(null);
  const [pendingDisconnectProvider, setPendingDisconnectProvider] =
    useState<Provider | null>(null);
  const sonarrActions = useSonarrActions();
  const radarrActions = useRadarrActions();
  const hasUnsavedChanges = isDirty || hasConnectionDraftChanges;

  const sonarrStatus = useProviderConnectionStatus(
    "sonarr",
    getProviderCredentials(optionsQuery.data, "sonarr")
  );

  const radarrStatus = useProviderConnectionStatus(
    "radarr",
    getProviderCredentials(optionsQuery.data, "radarr")
  );

  const statuses = {
    sonarr: sonarrStatus,
    radarr: radarrStatus,
  };

  const isDisconnecting =
    sonarrActions.isConnecting || radarrActions.isConnecting;

  const requestDisconnect = (provider: Provider) => {
    setPendingDisconnectProvider(provider);
  };

  const confirmDisconnect = async () => {
    if (!pendingDisconnectProvider) return;

    const success =
      pendingDisconnectProvider === "sonarr"
        ? await sonarrActions.disconnectSonarr()
        : await radarrActions.disconnectRadarr();

    if (success) {
      setHasConnectionDraftChanges(false);
      setPendingDisconnectProvider(null);
    }
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
      case "sonarr": { return (
        <SonarrPage
          connectSonarr={sonarrActions.connectSonarr}
          connectionError={sonarrActions.error}
          isConnecting={sonarrActions.isConnecting}
          onConnectionDraftDirtyChange={setHasConnectionDraftChanges}
        />
      );
      }
      case "radarr": { return (
        <RadarrPage
          connectRadarr={radarrActions.connectRadarr}
          connectionError={radarrActions.error}
          isConnecting={radarrActions.isConnecting}
          onConnectionDraftDirtyChange={setHasConnectionDraftChanges}
        />
      );
      }
      case "mappings": { return <MappingsPage />;
      }
      case "ui": { return <UiPage />;
      }
      case "advanced": { return <AdvancedPage />;
      }
      default: { return (
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
        isDisconnecting={isDisconnecting}
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
              isDisconnecting={isDisconnecting}
              statuses={statuses}
              onDisconnect={requestDisconnect}
            />
            {renderActivePage()}
          </main>
        </div>
      </div>

      <MobileBottomNav activePage={page} onPageSelect={requestPageChange} />

      <ConfirmDialog
        open={pendingPage !== null}
        onOpenChange={(open) => {
          if (!open) setPendingPage(null);
        }}
        title="Discard unsaved changes?"
        description="Unsaved settings or connection edits on this page will be lost."
        confirmText="Discard"
        cancelText="Stay"
        onConfirm={confirmPageChange}
        isDestructive={true}
      />

      <ConfirmDialog
        open={pendingDisconnectProvider !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDisconnectProvider(null);
        }}
        title={`Disconnect ${pendingDisconnectProvider === "radarr" ? "Radarr" : "Sonarr"}?`}
        description="This will clear the saved URL, API key, and provider defaults for this provider."
        confirmText={isDisconnecting ? "Disconnecting..." : "Disconnect"}
        cancelText="Cancel"
        onConfirm={confirmDisconnect}
        isDestructive={true}
      />
    </div>
  );
};
