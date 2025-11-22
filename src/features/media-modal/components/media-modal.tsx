// src/features/media-modal/components/media-modal.tsx
import { useCallback, useMemo, useState } from "react";
import { Modal, ModalContent, ModalTitle, ModalDescription } from "./modal";
import { Header, type MediaModalTabId } from "./media-modal-header";
import { Footer } from "./media-modal-footer";
import Button from "@/shared/components/button";
import type { AniFormat, MediaStatus } from "@/shared/types";

import { ProviderSearchSection } from "./provider-search-section";
import type { MappingTabProps } from "../types";
import { MappingPreviewPanel } from "./mapping-preview-panel";
import { SonarrPanel } from "./sonarr-panel";
import type { SonarrPanelProps } from "../types";
import { useMappingController } from "../hooks/use-mapping-controller";
import { useSonarrPanelController } from "../hooks/use-sonarr-panel-controller";
import { usePublicOptions } from "@/shared/hooks/use-api-queries";

type MediaModalViewMode = "setup" | "mapping";

export type MediaModalProps = {
  isOpen: boolean;
  onClose: () => void;

  title: string;
  bannerImage: string | null;
  coverImage: string | null;
  anilistIds: number[];
  tvdbId: number | null;
  inLibrary: boolean;
  format: AniFormat | null;
  year: number | null;
  status: MediaStatus | null;

  initialTab?: MediaModalTabId;

  portalContainer?: HTMLElement | ShadowRoot | null;

  mappingTabProps: Omit<MappingTabProps, 'controller' | 'baseUrl'>;
  sonarrPanelProps: Omit<SonarrPanelProps, 'controller'>;
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
    format,
    year,
    status,
    initialTab = "series",
    portalContainer,
    mappingTabProps,
    sonarrPanelProps,
  } = props;

  const [floatingPortalEl, setFloatingPortalEl] = useState<HTMLDivElement | null>(null);

  const initialViewMode: MediaModalViewMode = initialTab === "mapping" ? "mapping" : "setup";
  const [viewMode, setViewMode] = useState<MediaModalViewMode>(initialViewMode);

  // Lift state up: manage controller logic in parent
  const mappingController = useMappingController({
    anilistId: mappingTabProps.aniListEntry.id,
    service: mappingTabProps.service,
    currentMapping: mappingTabProps.currentMapping,
    overrideActive: mappingTabProps.overrideActive,
  });

  const sonarrController = useSonarrPanelController({
    mode: sonarrPanelProps.mode,
    initialForm: sonarrPanelProps.initialForm,
    defaultForm: sonarrPanelProps.defaultForm,
    metadata: sonarrPanelProps.metadata,
    title: sonarrPanelProps.title,
    tvdbId: sonarrPanelProps.tvdbId,
    disabled: sonarrPanelProps.disabled,
    onSubmit: sonarrPanelProps.onSubmit,
    onSaveDefaults: sonarrPanelProps.onSaveDefaults,
  });

  const publicOptions = usePublicOptions();
  const baseUrl = publicOptions.data?.sonarrUrl ?? '';

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleFloatingPortalRef = useCallback((node: HTMLDivElement | null) => {
    setFloatingPortalEl(node);
  }, []);

  const handleEnterMapping = useCallback(() => {
    setViewMode("mapping");
  }, []);

  const handleMappingCancel = useCallback(() => {
    mappingController.resetToCurrent();
    setViewMode("setup");
  }, [mappingController]);

  const handleMappingSubmit = useCallback(async () => {
    try {
      await mappingController.handleSubmit();
      setViewMode("setup");
    } catch {
      // Leave the user in mapping mode if saving fails.
    }
  }, [mappingController]);

  const effectiveCurrentMapping = mappingController.currentMapping ?? mappingTabProps.currentMapping ?? null;
  const selectedMapping = mappingController.state.selected;

  const previewMapping = useMemo(
    () =>
      viewMode === "mapping" && selectedMapping ? selectedMapping : effectiveCurrentMapping,
    [effectiveCurrentMapping, selectedMapping, viewMode],
  );

  const isPreviewingSelection = viewMode === "mapping" && Boolean(selectedMapping);
  const showResetPreview = viewMode === "mapping" && mappingController.canSubmit && Boolean(selectedMapping);

  // Compute footer state directly in parent based on view mode
  const footerState = useMemo(() => {
    if (viewMode === "mapping") {
      return {
        leftContent: mappingController.canRevert ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs font-medium"
            disabled={mappingController.isSubmitting}
            onClick={() => { void mappingController.handleRevertToAutomatic(); }}
          >
            Reset to automatic
          </Button>
        ) : null,
        primaryLabel: 'Update mapping',
        primaryDisabled: !mappingController.canSubmit,
        primaryLoading: mappingController.isSubmitting,
        onPrimaryClick: () => {
          void handleMappingSubmit();
        },
        secondaryLabel: 'Cancel',
        onSecondaryClick: handleMappingCancel,
        showTertiary: false,
        tertiaryLabel: '',
        onTertiaryClick: undefined,
      };
    } else {
      return {
        leftContent:
          sonarrPanelProps.mode === "add" ? (
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
        primaryLabel: sonarrPanelProps.mode === "edit" ? "Save series" : "Add series",
        primaryDisabled: !sonarrController.canSubmit,
        primaryLoading: sonarrController.isSubmitting,
        onPrimaryClick: () => {
          void sonarrController.handlePrimarySubmit();
        },
        secondaryLabel: "Cancel",
        onSecondaryClick: handleClose,
        showTertiary: sonarrController.showSaveDefaults,
        tertiaryLabel: "Save as default",
        onTertiaryClick: sonarrController.showSaveDefaults ? () => {
          void sonarrController.handleSaveDefaults();
        } : undefined,
      };
    }
  }, [
    viewMode,
    handleClose,
    handleMappingCancel,
    handleMappingSubmit,
    mappingController,
    sonarrController,
    sonarrPanelProps.mode,
  ]);

  const selectPortalContainer = floatingPortalEl ?? portalContainer ?? null;

  if (!isOpen) {
    return null;
  }

  return (
    <Modal open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <ModalContent
        container={portalContainer ?? null}
        floatingPortalRef={handleFloatingPortalRef}
        className="h-[800px] max-h-[90vh] w-full max-w-[1000px] flex flex-col overflow-hidden rounded-2xl border border-border-primary bg-bg-secondary shadow-2xl shadow-black/40 p-0"
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
          format={format}
          year={year}
          status={status}
          activeTab={viewMode === "mapping" ? "mapping" : "series"}
          onEnterMapping={handleEnterMapping}
          onExitMapping={handleMappingCancel}
          onClose={handleClose}
        />
        {/* Content Area - split view, left panel scrolls, right panel stays sticky */}
        <div className="flex-1 overflow-hidden px-8 pb-6">
          <div className="mx-auto flex h-full max-w-[1000px] flex-col gap-6">
            <div className="grid h-full grid-cols-[3fr_2fr] gap-6">
              <div className="flex h-full flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto pr-1">
                  {viewMode === "mapping" ? (
                    <ProviderSearchSection
                      controller={mappingController}
                      currentMapping={effectiveCurrentMapping}
                      baseUrl={baseUrl}
                    />
                  ) : (
                    <SonarrPanel
                      {...sonarrPanelProps}
                      controller={sonarrController}
                      portalContainer={selectPortalContainer}
                    />
                  )}
                </div>
              </div>
              <div className="relative h-full">
                <div className="sticky top-0">
                  <MappingPreviewPanel
                    aniListEntry={mappingTabProps.aniListEntry}
                    otherAniListIds={mappingTabProps.otherAniListIds}
                    baseUrl={baseUrl}
                    mapping={previewMapping}
                    isPreviewingSelection={isPreviewingSelection}
                    showResetPreview={showResetPreview}
                    onResetPreview={mappingController.clearSelection}
                    onEditMapping={handleEnterMapping}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <Footer
          {...footerState}
        />
      </ModalContent>
    </Modal>
  );
}
