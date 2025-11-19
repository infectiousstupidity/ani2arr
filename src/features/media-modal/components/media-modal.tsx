// src/features/media-modal/components/media-modal.tsx
import { useCallback, useMemo, useState } from "react";
import { Modal, ModalContent, ModalTitle, ModalDescription } from "./modal";
import { Header, type MediaModalTabId } from "./media-modal-header";
import { Footer } from "./media-modal-footer";

import MappingTab, { type MappingTabProps } from "../tabs/mapping-tab";
import SonarrTab, { type SonarrTabProps } from "../tabs/sonarr-tab";
import { useMappingController } from "../tabs/mapping-tab/hooks/use-mapping-controller";
import { useSonarrTabController } from "../tabs/sonarr-tab/hooks/use-sonarr-tab-controller";
import { usePublicOptions } from "@/shared/hooks/use-api-queries";

export type MediaModalProps = {
  isOpen: boolean;
  onClose: () => void;

  title: string;
  bannerImage: string | null;
  coverImage: string | null;
  anilistIds: number[];
  tvdbId: number | null;
  inLibrary: boolean;

  initialTab?: MediaModalTabId;

  portalContainer?: HTMLElement | null;

  mappingTabProps: Omit<MappingTabProps, 'controller' | 'baseUrl'>;
  sonarrTabProps: Omit<SonarrTabProps, 'controller'>;
};

export function MediaModal(props: MediaModalProps): React.JSX.Element | null {
  const {
    isOpen,
    onClose,
    title,
    bannerImage,
    coverImage,
    anilistIds,
    tvdbId,
    inLibrary,
    initialTab = "series",
    portalContainer,
    mappingTabProps,
    sonarrTabProps,
  } = props;

  const [activeTab, setActiveTab] = useState<MediaModalTabId>(initialTab ?? "series");

  // Lift state up: manage controller logic in parent
  const mappingController = useMappingController({
    anilistId: mappingTabProps.aniListEntry.id,
    service: mappingTabProps.service,
    currentMapping: mappingTabProps.currentMapping,
  });

  const sonarrController = useSonarrTabController({
    mode: sonarrTabProps.mode,
    initialForm: sonarrTabProps.initialForm,
    defaultForm: sonarrTabProps.defaultForm,
    metadata: sonarrTabProps.metadata,
    title: sonarrTabProps.title,
    tvdbId: sonarrTabProps.tvdbId,
    disabled: sonarrTabProps.disabled,
    onSubmit: sonarrTabProps.onSubmit,
    onSaveDefaults: sonarrTabProps.onSaveDefaults,
  });

  const publicOptions = usePublicOptions();
  const baseUrl = publicOptions.data?.sonarrUrl ?? '';

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleTabChange = useCallback((tab: MediaModalTabId) => {
    setActiveTab(tab);
  }, []);

  // Compute footer state directly in parent based on active tab
  const footerState = useMemo(() => {
    if (activeTab === "mapping") {
      return {
        primaryLabel: mappingTabProps.currentMapping ? 'Override mapping' : 'Save mapping',
        primaryDisabled: !mappingController.canSubmit,
        primaryLoading: mappingController.isSubmitting,
        onPrimaryClick: () => {
          void mappingController.handleSubmit();
        },
        showTertiary: mappingController.canRevert,
        tertiaryLabel: 'Revert to automatic',
        onTertiaryClick: mappingController.canRevert ? () => {
          void mappingController.handleRevertToAutomatic();
        } : undefined,
      };
    } else {
      return {
        leftContent:
          sonarrTabProps.mode === "add" ? (
            <>
              <span className="mr-1 text-[11px] font-medium uppercase tracking-wide">
                On add, also:
              </span>
              <button
                type="button"
                onClick={() => sonarrController.handleFieldChange("searchForMissingEpisodes", !sonarrController.current.searchForMissingEpisodes)}
                className={`inline-flex items-center rounded-full border px-2 py-1 text-[11px] font-medium ${
                  sonarrController.current.searchForMissingEpisodes
                    ? "border-accent-primary bg-accent-primary/10 text-accent-primary"
                    : "border-border-primary bg-bg-tertiary text-text-secondary hover:border-accent-primary hover:text-text-primary"
                }`}
              >
                <span
                  className={`mr-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border text-[10px] ${
                    sonarrController.current.searchForMissingEpisodes
                      ? "border-accent-primary bg-accent-primary text-white"
                      : "border-border-primary bg-bg-secondary text-text-secondary"
                  }`}
                >
                  {sonarrController.current.searchForMissingEpisodes ? "\u2713" : ""}
                </span>
                Search for missing episodes
              </button>
            </>
          ) : null,
        primaryLabel: sonarrTabProps.mode === "edit" ? "Save series" : "Add series",
        primaryDisabled: !sonarrController.canSubmit,
        primaryLoading: sonarrController.isSubmitting,
        onPrimaryClick: () => {
          void sonarrController.handlePrimarySubmit();
        },
        showTertiary: sonarrController.showSaveDefaults,
        tertiaryLabel: "Save as default",
        onTertiaryClick: sonarrController.showSaveDefaults ? () => {
          void sonarrController.handleSaveDefaults();
        } : undefined,
      };
    }
  }, [activeTab, mappingTabProps.currentMapping, mappingController, sonarrTabProps.mode, sonarrController]);

  if (!isOpen) {
    return null;
  }

  return (
    <Modal open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <ModalContent
        container={portalContainer ?? null}
        className="mx-auto w-full max-w-3xl min-h-[920px] overflow-hidden rounded-2xl border border-border-primary bg-bg-secondary shadow-2xl shadow-black/40 p-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
        }}
      >
        {/* Accessible dialog title/description for screen readers. Visual title handled by Header. */}
        <ModalTitle className="sr-only">{title}</ModalTitle>
        <ModalDescription className="sr-only">
          Configure Sonarr options or update ID mapping for this anime.
        </ModalDescription>
        <Header
          title={title}
          bannerImage={bannerImage}
          coverImage={coverImage}
          anilistIds={anilistIds}
          tvdbId={tvdbId ?? null}
          inLibrary={inLibrary}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onClose={handleClose}
        />
        <div className="px-6 py-5">
          <div style={{ display: activeTab === "mapping" ? "block" : "none" }}>
            <MappingTab
              {...mappingTabProps}
              controller={mappingController}
              baseUrl={baseUrl}
            />
          </div>
          <div style={{ display: activeTab === "series" ? "block" : "none" }}>
            <SonarrTab
              {...sonarrTabProps}
              controller={sonarrController}
            />
          </div>
        </div>

        <Footer
          {...footerState}
          secondaryLabel="Cancel"
          onSecondaryClick={handleClose}
        />
      </ModalContent>
    </Modal>
  );
}
