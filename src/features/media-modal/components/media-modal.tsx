/** Owns the media modal shell and wires provider-specific panel controllers into the dialog UI. */
// src/features/media-modal/components/media-modal.tsx

import { useCallback, useMemo, useState } from "react";
import { Modal, ModalContent, ModalTitle, ModalDescription } from "./modal";
import { Header } from "./media-modal-header";
import { Footer, type FooterProps } from "./media-modal-footer";
import Button from "@/shared/ui/primitives/button";
import type { AniListTitleLanguage } from "@/anilist/schemas/title-language.schema";
import type {
  AniListMediaFormat,
  AniListMediaStatus,
} from "@/anilist/schemas/media.schema";
import type { Provider } from "@/providers";
import type { RadarrFormState } from "@/providers/settings/radarr-settings.schema";
import type { SonarrFormState } from "@/providers/settings/sonarr-settings.schema";
import { ErrorCode, type ExtensionError } from "@/shared/errors";
import { createDefaultRadarrFormState } from "@/providers/settings/radarr-settings.schema";
import { createDefaultSonarrFormState } from "@/providers/settings/sonarr-settings.schema";

import { MappingPreviewPanel, type MappingSearchResult } from "@/features/mapping";
import { MappingInspectionPane } from "@/features/mapping/mapping-inspection-pane";
import type { MappingTabProps } from "../types";
import { RadarrPanel } from "./radarr-panel";
import { SonarrPanel } from "./sonarr-panel";
import type { RadarrPanelProps, SonarrPanelProps } from "../types";
import { useMappingController } from "@/features/mapping";
import { useRadarrPanelController } from "../hooks/use-radarr-panel-controller";
import { useSonarrPanelController } from "../hooks/use-sonarr-panel-controller";
import { usePublicOptions } from '@/options';
import { useConfirm } from "@/shared/hooks/common/use-confirm";
import { getProviderLabel } from "@/providers/provider-routing";

type MediaModalViewMode = "setup" | "mapping";
type MediaModalTabId = "series" | "mapping";

const EMPTY_SONARR_FORM: SonarrFormState = createDefaultSonarrFormState();

const EMPTY_RADARR_FORM: RadarrFormState = createDefaultRadarrFormState();

const MODAL_WORKSPACE_WIDTH_CLASS_NAME = "mx-auto w-full max-w-250";
const MODAL_WORKSPACE_GRID_CLASS_NAME =
  "grid h-full min-h-0 grid-cols-1 gap-y-4 lg:grid-cols-[minmax(0,1fr)_8.5rem_minmax(0,1fr)] lg:grid-rows-[auto_minmax(0,1fr)] lg:gap-x-0 lg:gap-y-2";

export type MediaModalProps = {
  isOpen: boolean;
  onClose: () => void;

  title: string;
  alternateTitles: Array<{ label: string; value: string }>;
  titleLanguage: AniListTitleLanguage;
  bannerImage: string | null;
  coverImage: string | null;
  anilistIds: number[];
  provider: Provider;
  inLibrary: boolean;
  format: AniListMediaFormat | null;
  year: number | null;
  status: AniListMediaStatus | null;

  initialTab?: MediaModalTabId;
  initialMappingRequired?: boolean;

  portalContainer?: HTMLElement | ShadowRoot | null;

  mappingTabProps: Omit<MappingTabProps, 'controller' | 'baseUrl'>;
  sonarrPanelProps: Omit<SonarrPanelProps, 'controller'> | null;
  radarrPanelProps: Omit<RadarrPanelProps, 'controller'> | null;
  onMappingSaved?: (input: { anilistId: number; mapping: MappingSearchResult | null }) => void;
  onMappingSaveError?: (input: { anilistId: number; error: Error }) => void;
};

export function MediaModal(props: MediaModalProps): React.JSX.Element | null {
  const {
    isOpen,
    onClose,
    title,
    bannerImage,
    coverImage,
    provider,
    format,
    year,
    initialTab = "series",
    initialMappingRequired = false,
    portalContainer,
    mappingTabProps,
    sonarrPanelProps,
    radarrPanelProps,
    onMappingSaved,
    onMappingSaveError,
  } = props;

  const [floatingPortalEl, setFloatingPortalEl] = useState<HTMLDivElement | null>(null);

  const initialViewMode: MediaModalViewMode = initialTab === "mapping" ? "mapping" : "setup";
  const [viewMode, setViewMode] = useState<MediaModalViewMode>(initialViewMode);

  // Lift state up: manage controller logic in parent
  const mappingController = useMappingController({
    anilistId: mappingTabProps.aniListEntry.id,
    provider: mappingTabProps.provider,
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
    provider === 'radarr'
      ? publicOptions.data?.providers.radarr.url ?? ''
      : publicOptions.data?.providers.sonarr.url ?? '';
  const confirm = useConfirm();
  const providerLabel = getProviderLabel(provider);
  const activePanelMode = provider === 'radarr' ? radarrPanelProps?.mode : sonarrPanelProps?.mode;
  const activeController = provider === 'radarr' ? radarrController : sonarrController;
  const tooltipContainer = floatingPortalEl ?? (portalContainer instanceof HTMLElement ? portalContainer : null);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleFloatingPortalRef = useCallback((node: HTMLDivElement | null) => {
    setFloatingPortalEl(node);
  }, []);

  const handleEnterMapping = useCallback(() => {
    setViewMode("mapping");
  }, []);

  const handleOpenMappingSettings = useCallback(() => {
    try {
      void browser.runtime.sendMessage({
        _a2a: true,
        type: 'OPEN_OPTIONS_PAGE',
        sectionId: 'mappings',
        targetAnilistId: mappingTabProps.aniListEntry.id,
        timestamp: Date.now(),
      });
    } catch {
      // best-effort only
    }
  }, [mappingTabProps.aniListEntry.id]);

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
    const externalLabel = selected ? `${selected.provider === 'radarr' ? 'TMDB' : 'TVDB'} ${selected.providerId}` : 'This mapping';

    const confirmShare = async (conflictingIds: number[]): Promise<boolean> => {
      if (conflictingIds.length === 0) return true;
      return confirm({
        title: 'Share this mapping?',
        description: `${externalLabel} is already linked to AniList entr${conflictingIds.length === 1 ? 'y' : 'ies'} ${conflictingIds.join(', ')}. Continue to share this mapping?`,
        confirmText: "Share mapping",
        cancelText: "Cancel",
      });
    };

    const attemptSubmit = async (force?: boolean) => {
      await mappingController.handleSubmit(force ? { force: true } : undefined);
      onMappingSaved?.({
        anilistId: currentAniListId,
        mapping: mappingController.currentMapping ?? selected ?? null,
      });
      setViewMode("setup");
    };

    const visibleConflicts = (selected?.linkedAniListIds ?? []).filter(id => id !== currentAniListId);
    if (visibleConflicts.length > 0 && selected) {
      const proceed = await confirmShare(visibleConflicts);
      if (!proceed) return;
      try {
        await attemptSubmit(true);
        return;
      } catch (error) {
        onMappingSaveError?.({
          anilistId: currentAniListId,
          error: error instanceof Error ? error : new Error("Unable to save mapping."),
        });
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
        } catch (retryError) {
          onMappingSaveError?.({
            anilistId: currentAniListId,
            error: retryError instanceof Error ? retryError : new Error("Unable to save mapping."),
          });
          return;
        }
      }
      onMappingSaveError?.({
        anilistId: currentAniListId,
        error: normalized instanceof Error ? normalized : new Error("Unable to save mapping."),
      });
      // Leave mapping mode unchanged on other errors.
    }
  }, [confirm, mappingController, mappingTabProps.aniListEntry.id, onMappingSaveError, onMappingSaved]);

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
      description: 'This will remove the manual override and return to the automatic mapping for this title.',
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
  const modeSwitchLabel = viewMode === "mapping" ? "Back to setup" : "Change mapping";
  const handleModeSwitch = viewMode === "mapping" ? handleExitMapping : handleEnterMapping;

  // Compute footer state directly in parent based on view mode
  const footerState = useMemo<FooterProps>(() => {
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
        primaryLabel: 'Confirm Selection',
        primaryDisabled: !mappingController.canSubmit,
        primaryLoading: mappingController.isSubmitting,
        onPrimaryClick: () => {
          void handleMappingSubmit();
        },
        showTertiary: false,
        tertiaryLabel: '',
        onTertiaryClick: undefined,
        ...(mappingRequiresResolution
          ? {
              secondaryLabel: 'Exit modal',
              onSecondaryClick: handleExitMapping,
            }
          : {}),
      };
    }

    return {
      primaryLabel:
        activePanelMode === "edit"
          ? "Save changes"
          : (provider === 'radarr'
            ? "Add movie"
            : "Add series"),
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
    provider,
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
        {/* Accessible dialog title/description for screen readers. Visual title handled by the face-off strip. */}
        <ModalTitle className="sr-only">{title}</ModalTitle>
        <ModalDescription className="sr-only">
          Configure {providerLabel} options or update ID mapping for this AniList entry.
        </ModalDescription>
        <Header
          title={title}
          bannerImage={bannerImage}
          coverImage={coverImage}
          anilistId={mappingTabProps.aniListEntry.id}
          provider={provider}
          format={format}
          year={year}
          baseUrl={baseUrl}
          currentMapping={effectiveCurrentMapping}
          workspaceClassName={MODAL_WORKSPACE_WIDTH_CLASS_NAME}
          onClose={handleClose}
          onOpenSettings={handleOpenMappingSettings}
          tooltipContainer={tooltipContainer}
        />
        <div className="relative flex-1 overflow-hidden px-4 sm:px-8">
          <div className={`${MODAL_WORKSPACE_WIDTH_CLASS_NAME} flex h-full flex-col`}>
            <div className="min-h-0 flex-1 pt-5 pb-4 sm:pt-6">
              <div className={MODAL_WORKSPACE_GRID_CLASS_NAME}>
                <div className="order-1 flex h-full flex-col overflow-hidden lg:col-start-1 lg:row-start-2">
                  <div className="flex-1 min-h-0">
                    {viewMode === "mapping" ? (
                      <MappingInspectionPane
                        anilistId={mappingTabProps.aniListEntry.id}
                        controller={mappingController}
                        currentMapping={effectiveCurrentMapping}
                        provider={mappingTabProps.provider}
                        baseUrl={baseUrl}
                        portalContainer={selectPortalContainer instanceof HTMLElement ? selectPortalContainer : null}
                      />
                    ) : (
                      <>
                        {provider === 'radarr' && radarrPanelProps ? (
                          <RadarrPanel
                            {...radarrPanelProps}
                            controller={radarrController}
                            portalContainer={selectPortalContainer}
                          />
                        ) : null}
                        {provider === 'sonarr' && sonarrPanelProps ? (
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

                <div className="order-2 flex justify-center lg:col-start-3 lg:row-start-1 lg:items-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleModeSwitch}
                    className="h-8 rounded-lg border border-border-primary/40 bg-bg-primary/12 px-3 text-sm font-medium text-text-secondary shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] hover:border-border-primary/60 hover:bg-bg-secondary/45 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/45 focus-visible:ring-offset-0"
                  >
                    {modeSwitchLabel}
                  </Button>
                </div>

                <div className="order-3 relative min-h-0 lg:col-start-3 lg:row-start-2">
                  <div className="h-full lg:sticky lg:top-0">
                    <MappingPreviewPanel
                      provider={mappingTabProps.provider}
                      aniListEntry={mappingTabProps.aniListEntry}
                      baseUrl={baseUrl}
                      currentMapping={effectiveCurrentMapping}
                      previewMapping={previewMapping}
                      isInMappingMode={viewMode === "mapping"}
                      showResetPreview={showResetPreview}
                      onResetPreview={mappingController.clearSelection}
                      portalContainer={selectPortalContainer instanceof HTMLElement ? selectPortalContainer : null}
                    />
                  </div>
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
