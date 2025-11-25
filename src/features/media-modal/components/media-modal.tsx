// src/features/media-modal/components/media-modal.tsx
import { useCallback, useMemo, useState } from "react";
import { Modal, ModalContent, ModalTitle, ModalDescription } from "./modal";
import { Header, type MediaModalTabId } from "./media-modal-header";
import { Footer } from "./media-modal-footer";
import Button from "@/shared/components/button";
import type { AniFormat, MediaStatus, TitleLanguage } from "@/shared/types";

import { ProviderSearchSection } from "./provider-search-section";
import type { MappingTabProps } from "../types";
import { MappingPreviewPanel } from "./mapping-preview-panel";
import { SonarrPanel } from "./sonarr-panel";
import type { SonarrPanelProps } from "../types";
import { useMappingController } from "../hooks/use-mapping-controller";
import { useSonarrPanelController } from "../hooks/use-sonarr-panel-controller";
import { usePublicOptions } from "@/shared/hooks/use-api-queries";
import { useConfirm } from "@/shared/hooks/use-confirm";

type MediaModalViewMode = "setup" | "mapping";

export type MediaModalProps = {
  isOpen: boolean;
  onClose: () => void;

  title: string;
  alternateTitles: Array<{ label: string; value: string }>;
  titleLanguage: TitleLanguage;
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
    alternateTitles,
    titleLanguage,
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
    folderSlug: sonarrPanelProps.folderSlug ?? null,
    disabled: sonarrPanelProps.disabled,
    onSubmit: sonarrPanelProps.onSubmit,
    onSaveDefaults: sonarrPanelProps.onSaveDefaults,
  });

  const publicOptions = usePublicOptions();
  const baseUrl = publicOptions.data?.sonarrUrl ?? '';
  const confirm = useConfirm();

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

  // Handle ESC key: exit mapping mode first, then allow modal close
  const handleEscapeKeyDown = useCallback((event: KeyboardEvent) => {
    if (viewMode === "mapping") {
      // Prevent modal from closing and exit edit mode instead
      event.preventDefault();
      event.stopPropagation();
      handleMappingCancel();
    }
    // Otherwise, let Radix Dialog handle the close
  }, [viewMode, handleMappingCancel]);

  const handleConfirmReset = useCallback(async () => {
    if (mappingController.isSubmitting) {
      return;
    }
    const shouldReset = await confirm({
      title: 'Reset mapping override?',
      description: 'This will remove the manual TVDB mapping and return to the automatic match for this title.',
      confirmText: 'Reset mapping',
      cancelText: 'Keep override',
    });
    if (!shouldReset) return;
    await mappingController.handleRevertToAutomatic();
  }, [confirm, mappingController]);

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
            onClick={() => { void handleConfirmReset(); }}
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
        secondaryLabel: 'Back to manage series',
        onSecondaryClick: handleMappingCancel,
        showTertiary: false,
        tertiaryLabel: '',
        onTertiaryClick: undefined,
      };
    }

    return {
      primaryLabel: sonarrPanelProps.mode === "edit" ? "Save changes" : "Add series",
      primaryDisabled: !sonarrController.canSubmit,
      primaryLoading: sonarrController.isSubmitting,
      onPrimaryClick: () => {
        void (async () => {
          try {
            await sonarrController.handlePrimarySubmit();
            if (sonarrPanelProps.mode === "edit") {
              handleClose();
            }
          } catch {
            // Keep modal open on error.
          }
        })();
      },
      secondaryLabel: "Cancel",
      onSecondaryClick: handleClose,
      showTertiary: sonarrController.showSaveDefaults && Boolean(sonarrController.form.formState.isDirty),
      tertiaryLabel: "Save as default",
      onTertiaryClick: sonarrController.showSaveDefaults ? () => {
        void sonarrController.handleSaveDefaults();
      } : undefined,
    };
  }, [
    viewMode,
    handleClose,
    handleMappingCancel,
    handleMappingSubmit,
    handleConfirmReset,
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
        className="w-full max-w-[1000px] h-[80vh] flex flex-col overflow-hidden rounded-none bg-bg-primary shadow-2xl shadow-black/40 p-0 sm:h-[vh] sm:min-h-[720px] sm:rounded-2xl"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
        }}
        onEscapeKeyDown={handleEscapeKeyDown}
      >
        {/* Accessible dialog title/description for screen readers. Visual title handled by Header. */}
        <ModalTitle className="sr-only">{title}</ModalTitle>
        <ModalDescription className="sr-only">
          Configure Sonarr options or update ID mapping for this anime.
        </ModalDescription>
        <Header
          title={title}
          alternateTitles={alternateTitles}
          titleLanguage={titleLanguage}
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
          tooltipContainer={floatingPortalEl ?? (portalContainer instanceof HTMLElement ? portalContainer : null)}
        />
        {/* Content Area - split view with sticky preview and inline content */}
        <div className="flex-1 overflow-hidden px-8 pb-6">
          <div className="mx-auto flex h-full max-w-[1000px] flex-col gap-6">
            <div className="grid h-full grid-cols-2 gap-6">
              <div className="flex h-full flex-col overflow-hidden">
                <div className="px-0 pb-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
                        {viewMode === "mapping"
                          ? "Mapping search"
                          : sonarrPanelProps.mode === "edit"
                          ? "Manage series"
                          : "New series setup"}
                      </p>
                      <p className="text-xs text-text-secondary">
                        {viewMode === "mapping"
                          ? "Find the right TVDB entry; your selection updates the preview on the right."
                          : sonarrPanelProps.mode === "edit"
                          ? "Update configuration or move files to a new location."
                          : "Choose the root folder and monitoring options for this series."}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex-1 min-h-0">
                  {viewMode === "mapping" ? (
                    <ProviderSearchSection
                      controller={mappingController}
                      currentMapping={effectiveCurrentMapping}
                      baseUrl={baseUrl}
                      autoFocus={isOpen && viewMode === "mapping"}
                      hideHeader
                      portalContainer={selectPortalContainer instanceof HTMLElement ? selectPortalContainer : null}
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
              <div className="relative">
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
