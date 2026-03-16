// src/features/media-modal/components/media-modal.tsx
import { useCallback, useMemo, useState } from "react";
import { Modal, ModalContent, ModalTitle, ModalDescription } from "./modal";
import { Header, type MediaModalTabId } from "./media-modal-header";
import { Footer } from "./media-modal-footer";
import Button from "@/shared/ui/primitives/button";
import type {
  AniFormat,
  ExtensionError,
  MediaService,
  MediaStatus,
  RadarrFormState,
  SonarrFormState,
  TitleLanguage,
} from "@/shared/types";
import { ErrorCode } from "@/shared/types";

import { MappingPreviewPanel, MappingSearchPanel } from "@/features/mapping";
import type { MappingTabProps } from "../types";
import { RadarrPanel } from "./radarr-panel";
import { SonarrPanel } from "./sonarr-panel";
import type { RadarrPanelProps, SonarrPanelProps } from "../types";
import { useMappingController } from "@/features/mapping";
import { useRadarrPanelController } from "../hooks/use-radarr-panel-controller";
import { useSonarrPanelController } from "../hooks/use-sonarr-panel-controller";
import { usePublicOptions } from '@/shared/queries';
import { useConfirm } from "@/shared/hooks/common/use-confirm";
import { getProviderLabel } from "@/services/providers/resolver";

type MediaModalViewMode = "setup" | "mapping";

const EMPTY_SONARR_FORM: SonarrFormState = {
  qualityProfileId: '',
  rootFolderPath: '',
  seriesType: 'anime',
  monitorOption: 'all',
  seasonFolder: true,
  searchForMissingEpisodes: true,
  searchForCutoffUnmet: false,
  tags: [],
  freeformTags: [],
};

const EMPTY_RADARR_FORM: RadarrFormState = {
  qualityProfileId: '',
  rootFolderPath: '',
  monitored: true,
  searchForMovie: true,
  minimumAvailability: 'announced',
  tags: [],
  freeformTags: [],
};

export type MediaModalProps = {
  isOpen: boolean;
  onClose: () => void;

  title: string;
  alternateTitles: Array<{ label: string; value: string }>;
  titleLanguage: TitleLanguage;
  bannerImage: string | null;
  coverImage: string | null;
  anilistIds: number[];
  service: MediaService;
  inLibrary: boolean;
  format: AniFormat | null;
  year: number | null;
  status: MediaStatus | null;

  initialTab?: MediaModalTabId;
  initialMappingRequired?: boolean;

  portalContainer?: HTMLElement | ShadowRoot | null;

  mappingTabProps: Omit<MappingTabProps, 'controller' | 'baseUrl'>;
  sonarrPanelProps: Omit<SonarrPanelProps, 'controller'> | null;
  radarrPanelProps: Omit<RadarrPanelProps, 'controller'> | null;
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
    service,
    inLibrary,
    format,
    year,
    status,
    initialTab = "series",
    initialMappingRequired = false,
    portalContainer,
    mappingTabProps,
    sonarrPanelProps,
    radarrPanelProps,
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
    mode: sonarrPanelProps?.mode ?? "add",
    initialForm: sonarrPanelProps?.initialForm ?? EMPTY_SONARR_FORM,
    defaultForm: sonarrPanelProps?.defaultForm ?? EMPTY_SONARR_FORM,
    metadata: sonarrPanelProps?.metadata ?? null,
    title: sonarrPanelProps?.title ?? title,
    tvdbId: sonarrPanelProps?.tvdbId ?? null,
    folderSlug: sonarrPanelProps?.folderSlug ?? null,
    disabled: sonarrPanelProps?.disabled ?? true,
    onSubmit: sonarrPanelProps?.onSubmit ?? (async () => {}),
    onSaveDefaults: sonarrPanelProps?.onSaveDefaults ?? (async () => {}),
  });

  const radarrController = useRadarrPanelController({
    mode: radarrPanelProps?.mode ?? "add",
    initialForm: radarrPanelProps?.initialForm ?? EMPTY_RADARR_FORM,
    defaultForm: radarrPanelProps?.defaultForm ?? EMPTY_RADARR_FORM,
    metadata: radarrPanelProps?.metadata ?? null,
    folderSlug: radarrPanelProps?.folderSlug ?? null,
    disabled: radarrPanelProps?.disabled ?? true,
    onSubmit: radarrPanelProps?.onSubmit ?? (async () => {}),
    onSaveDefaults: radarrPanelProps?.onSaveDefaults ?? (async () => {}),
  });

  const publicOptions = usePublicOptions();
  const baseUrl =
    service === 'radarr'
      ? publicOptions.data?.providers.radarr.url ?? ''
      : publicOptions.data?.providers.sonarr.url ?? '';
  const confirm = useConfirm();
  const providerLabel = getProviderLabel(service);
  const activePanelMode = service === 'radarr' ? radarrPanelProps?.mode : sonarrPanelProps?.mode;
  const activeController = service === 'radarr' ? radarrController : sonarrController;

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleFloatingPortalRef = useCallback((node: HTMLDivElement | null) => {
    setFloatingPortalEl(node);
  }, []);

  const handleEnterMapping = useCallback(() => {
    setViewMode("mapping");
  }, []);

  const effectiveCurrentMapping = mappingController.currentMapping ?? mappingTabProps.currentMapping ?? null;
  const mappingRequiresResolution = initialMappingRequired && effectiveCurrentMapping == null;

  const handleExitMapping = useCallback(() => {
    mappingController.resetToCurrent();
    if (mappingRequiresResolution) {
      handleClose();
      return;
    }
    setViewMode("setup");
  }, [handleClose, mappingController, mappingRequiresResolution]);

  const handleMappingSubmit = useCallback(async () => {
    const selected = mappingController.state.selected;
    const currentAniListId = mappingTabProps.aniListEntry.id;
    const externalLabel = selected?.target ? `${selected.target.kind.toUpperCase()} ${selected.target.id}` : 'This mapping';

    const confirmShare = async (conflictingIds: number[]): Promise<boolean> => {
      if (!conflictingIds.length) return true;
      return confirm({
        title: 'Share this mapping?',
        description: `${externalLabel} is already linked to AniList entr${conflictingIds.length === 1 ? 'y' : 'ies'} ${conflictingIds.join(', ')}. Continue to share this mapping?`,
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
      // Prevent Radix from closing first so the mapping flow can decide whether to exit or close.
      event.preventDefault();
      event.stopPropagation();
      handleExitMapping();
    }
    // Otherwise, let Radix Dialog handle the close
  }, [viewMode, handleExitMapping]);

  const handleConfirmReset = useCallback(async () => {
    if (mappingController.isSubmitting) {
      return;
    }
    const shouldReset = await confirm({
      title: 'Reset mapping override?',
      description: 'This will remove the manual override and return to the automatic match for this title.',
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

  const selectedMapping = mappingController.state.selected;

  const showResetPreview = viewMode === "mapping" && mappingController.canSubmit && Boolean(selectedMapping);
  const previewMapping = showResetPreview ? selectedMapping : null;

  // Compute footer state directly in parent based on view mode
  const footerState = useMemo(() => {
    if (viewMode === "mapping") {
      const primaryLabel = mappingRequiresResolution ? 'Add mapping' : 'Update mapping';
      const secondaryLabel = mappingRequiresResolution ? 'Exit modal' : 'Exit mapping';

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
        primaryLabel,
        primaryDisabled: !mappingController.canSubmit,
        primaryLoading: mappingController.isSubmitting,
        onPrimaryClick: () => {
          void handleMappingSubmit();
        },
        secondaryLabel,
        onSecondaryClick: handleExitMapping,
        showTertiary: false,
        tertiaryLabel: '',
        onTertiaryClick: undefined,
      };
    }

    return {
      primaryLabel:
        activePanelMode === "edit"
          ? "Save changes"
          : service === 'radarr'
            ? "Add movie"
            : "Add series",
      primaryDisabled: !activeController.canSubmit,
      primaryLoading: activeController.isSubmitting,
      onPrimaryClick: () => {
        void (async () => {
          try {
            await activeController.handlePrimarySubmit();
            if (activePanelMode === "edit") {
              handleClose();
            }
          } catch {
            // Keep modal open on error.
          }
        })();
      },
      secondaryLabel: "Cancel",
      onSecondaryClick: handleClose,
      showTertiary: activeController.showSaveDefaults && Boolean(activeController.form.formState.isDirty),
      tertiaryLabel: "Save as default",
      onTertiaryClick: activeController.showSaveDefaults ? () => {
        void activeController.handleSaveDefaults();
      } : undefined,
    };
  }, [
    activeController,
    activePanelMode,
    mappingRequiresResolution,
    viewMode,
    handleClose,
    handleExitMapping,
    handleMappingSubmit,
    handleConfirmReset,
    mappingController,
    service,
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
        className="w-full max-w-250 h-[75.5vh] flex flex-col overflow-hidden rounded-none bg-bg-primary shadow-2xl shadow-black/40 p-0 sm:h-[vh] sm:min-h-180 sm:rounded-2xl"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
        }}
        onEscapeKeyDown={handleEscapeKeyDown}
      >
        {/* Accessible dialog title/description for screen readers. Visual title handled by Header. */}
        <ModalTitle className="sr-only">{title}</ModalTitle>
        <ModalDescription className="sr-only">
          Configure {providerLabel} options or update ID mapping for this AniList entry.
        </ModalDescription>
        <Header
          title={title}
          alternateTitles={alternateTitles}
          titleLanguage={titleLanguage}
          bannerImage={bannerImage}
          coverImage={coverImage}
          anilistIds={anilistIds}
          service={service}
          inLibrary={inLibrary}
          format={format}
          year={year}
          status={status}
          activeTab={viewMode === "mapping" ? "mapping" : "series"}
          onEnterMapping={handleEnterMapping}
          onExitMapping={handleExitMapping}
          onClose={handleClose}
          tooltipContainer={floatingPortalEl ?? (portalContainer instanceof HTMLElement ? portalContainer : null)}
        />
        {/* Content Area - split view with sticky preview and inline content */}
        <div className="flex-1 overflow-hidden px-8">
          <div className="mx-auto flex h-full max-w-250 flex-col gap-6">
            <div className="grid h-full grid-cols-2 gap-6">
              <div className="flex h-full flex-col overflow-hidden">
                <div className="flex-1 min-h-0">
                  {viewMode === "mapping" ? (
                    <MappingSearchPanel
                      controller={mappingController}
                      currentMapping={effectiveCurrentMapping}
                      provider={mappingTabProps.service}
                      baseUrl={baseUrl}
                      autoFocus={isOpen && viewMode === "mapping"}
                      portalContainer={selectPortalContainer instanceof HTMLElement ? selectPortalContainer : null}
                    />
                  ) : (
                    <>
                      {service === 'radarr' && radarrPanelProps ? (
                        <RadarrPanel
                          {...radarrPanelProps}
                          controller={radarrController}
                          portalContainer={selectPortalContainer}
                        />
                      ) : null}
                      {service === 'sonarr' && sonarrPanelProps ? (
                        <SonarrPanel
                          {...sonarrPanelProps}
                          controller={sonarrController}
                          portalContainer={selectPortalContainer}
                        />
                      ) : null}
                    </>
                  )}
                </div>
              </div>
              <div className="relative">
                <div className="sticky top-0">
                  <MappingPreviewPanel
                    aniListEntry={mappingTabProps.aniListEntry}
                    baseUrl={baseUrl}
                    provider={mappingTabProps.service}
                    currentMapping={effectiveCurrentMapping}
                    previewMapping={previewMapping}
                    isInMappingMode={viewMode === "mapping"}
                    exitClosesModal={mappingRequiresResolution}
                    showResetPreview={showResetPreview}
                    onResetPreview={mappingController.clearSelection}
                    onEditMapping={() => {
                      if (viewMode === "mapping") {
                        handleExitMapping();
                      } else {
                        handleEnterMapping();
                      }
                    }}
                    portalContainer={selectPortalContainer instanceof HTMLElement ? selectPortalContainer : null}
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
