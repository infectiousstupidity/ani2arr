// src/features/media-modal/components/media-modal.tsx
import { useCallback, useMemo, useState } from "react";
import { Modal, ModalContent, ModalTitle, ModalDescription } from "./modal";
import { Header, type MediaModalTabId } from "./media-modal-header";
import { Footer } from "./media-modal-footer";
import Button from "@/shared/components/button";
import type { AniFormat, MediaStatus, TitleLanguage, ExtensionError } from "@/shared/types";
import { ErrorCode } from "@/shared/types";

import { SearchSection } from "./search-section";
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
    const selected = mappingController.state.selected;
    const currentAniListId = mappingTabProps.aniListEntry.id;
    const tvdbId = selected?.target.id;
    const tvdbLabel = tvdbId ? `TVDB ${tvdbId}` : "This TVDB entry";

    const confirmShare = async (conflictingIds: number[]): Promise<boolean> => {
      if (!conflictingIds.length) return true;
      return confirm({
        title: "Share this TVDB mapping?",
        description: `${tvdbLabel} is already linked to AniList entr${conflictingIds.length === 1 ? "y" : "ies"} ${conflictingIds.join(", ")}. Continue to share this mapping?`,
        confirmText: "Share mapping",
        cancelText: "Cancel",
      });
    };

    const attemptSubmit = async (force?: boolean) => {
      await mappingController.handleSubmit(force ? { force: true } : undefined);
      setViewMode("setup");
    };

    const visibleConflicts = (selected?.linkedAniListIds ?? []).filter(id => id !== currentAniListId);
    if (visibleConflicts.length > 0 && selected) {
      const proceed = await confirmShare(visibleConflicts);
      if (!proceed) return;
      try {
        await attemptSubmit(true);
        return;
      } catch {
        // Leave mapping mode if submission fails.
        return;
      }
    }

    try {
      await attemptSubmit(false);
    } catch (error) {
      const normalized = error as ExtensionError;
      const conflictIds = Array.isArray(normalized?.details?.conflictingAniListIds)
        ? (normalized.details?.conflictingAniListIds as number[])
        : [];
      if (normalized?.code === ErrorCode.VALIDATION_ERROR && conflictIds.length > 0) {
        const filtered = conflictIds.filter(id => id !== currentAniListId);
        const proceed = await confirmShare(filtered.length > 0 ? filtered : conflictIds);
        if (!proceed) return;
        try {
          await attemptSubmit(true);
          return;
        } catch {
          return;
        }
      }
      // Leave mapping mode unchanged on other errors.
    }
  }, [confirm, mappingController, mappingTabProps.aniListEntry.id]);

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
    try {
      await mappingController.handleRevertToAutomatic();
      setViewMode("setup");
    } catch {
      // Leave the user in mapping mode if reverting fails.
    }
  }, [confirm, mappingController]);

  const effectiveCurrentMapping = mappingController.currentMapping ?? mappingTabProps.currentMapping ?? null;
  const selectedMapping = mappingController.state.selected;

  const showResetPreview = viewMode === "mapping" && mappingController.canSubmit && Boolean(selectedMapping);
  const previewMapping = showResetPreview ? selectedMapping : null;

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
        secondaryLabel: 'Exit mapping',
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
                <div className="flex-1 min-h-0">
                  {viewMode === "mapping" ? (
                    <SearchSection
                      controller={mappingController}
                      currentMapping={effectiveCurrentMapping}
                      baseUrl={baseUrl}
                      autoFocus={isOpen && viewMode === "mapping"}
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
                    currentMapping={effectiveCurrentMapping}
                    previewMapping={previewMapping}
                    isInMappingMode={viewMode === "mapping"}
                    showResetPreview={showResetPreview}
                    onResetPreview={mappingController.clearSelection}
                    onEditMapping={() => {
                      if (viewMode === "mapping") {
                        handleMappingCancel();
                      } else {
                        handleEnterMapping();
                      }
                    }}
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
