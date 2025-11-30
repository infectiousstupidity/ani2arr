// src/features/media-modal/components/mapping-preview-panel.tsx
import { ExternalLink, Pencil, X, Settings } from "lucide-react";
import Button from "@/shared/components/button";
import Pill from "@/shared/components/pill";
import type { MappingSearchResult } from "@/shared/types";
import { buildExternalMediaLink } from "@/shared/utils/build-external-media-link";
import type { AniListEntrySummary } from "../types";
import { MultiMappingInfo } from "./multi-mapping-info";

interface MappingPreviewPanelProps {
  aniListEntry: AniListEntrySummary;
  otherAniListIds: number[];
  baseUrl: string;
  currentMapping: MappingSearchResult | null;
  previewMapping: MappingSearchResult | null;
  isInMappingMode: boolean;
  showResetPreview: boolean;
  onResetPreview: () => void;
  onEditMapping: () => void;
  portalContainer?: HTMLElement | null;
}

export function MappingPreviewPanel(props: MappingPreviewPanelProps): React.JSX.Element {
  const {
    aniListEntry,
    otherAniListIds,
    baseUrl,
    currentMapping,
    previewMapping,
    showResetPreview,
    onResetPreview,
    onEditMapping,
    portalContainer,
  } = props;

  const hasPreviewMapping = Boolean(previewMapping);
  const hasCurrentMapping = Boolean(currentMapping);
  const showEmptyState = !hasPreviewMapping && !hasCurrentMapping;

  return (
    <div className="flex h-full flex-col">
      <div className="pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
              CURRENT MAPPING
            </p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
              <MultiMappingInfo
                currentAniListId={aniListEntry.id}
                linkedAniListIds={otherAniListIds}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-1">
              <Button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEditMapping();
                }}
                variant="ghost"
                size="icon"
                tooltip="Edit current mapping ID"
                portalContainer={portalContainer ?? undefined}
                className="h-8 w-8 text-text-secondary hover:text-text-primary"
                aria-label="Edit current mapping ID"
              >
                <Pencil className="h-4 w-4" />
              </Button>

              <Button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  try {
                    void browser.runtime.sendMessage({
                      _a2a: true,
                      type: "OPEN_OPTIONS_PAGE",
                      sectionId: "mappings",
                      timestamp: Date.now(),
                    });
                  } catch {
                    // best-effort only
                  }
                }}
                variant="ghost"
                size="icon"
                tooltip="Open Mapping & Overrides settings in the options page"
                portalContainer={portalContainer ?? undefined}
                className="h-8 w-8 text-text-secondary hover:text-text-primary"
                aria-label="Open Mapping & Overrides settings"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-4">
        {hasCurrentMapping && currentMapping ? (
          <MappingPreviewCard
            mapping={currentMapping}
            baseUrl={baseUrl}
            currentAniListId={aniListEntry.id}
            portalContainer={portalContainer ?? null}
          />
        ) : null}

        {hasPreviewMapping && previewMapping ? (
          <MappingPreviewCard
            mapping={previewMapping}
            baseUrl={baseUrl}
            currentAniListId={aniListEntry.id}
            highlight="preview"
            showResetPreview={showResetPreview}
            onResetPreview={onResetPreview}
            portalContainer={portalContainer ?? null}
          />
        ) : null}

        {showEmptyState ? (
          <div className="flex min-h-[260px] items-center justify-center rounded-xl border border-dashed border-border-primary bg-bg-tertiary/60 px-3 text-center text-sm text-text-secondary">
            No mapping yet. Use the search to pick the correct TVDB series.
          </div>
        ) : null}
      </div>

      {hasPreviewMapping && hasCurrentMapping ? (
        <p className="mt-3 text-[11px] text-text-secondary">
          Saving will replace the current mapping for this AniList entry.
        </p>
      ) : null}
    </div>
  );
}

interface MappingPreviewCardProps {
  mapping: MappingSearchResult;
  baseUrl: string;
  highlight?: "preview";
  currentAniListId: number;
  showResetPreview?: boolean;
  onResetPreview?: () => void;
  portalContainer?: HTMLElement | null;
}

const getStatusTone = (
  status: string,
): "muted" | "success" | "warning" | "info" | "accent" | "blue" | "default" => {
  const normalized = status.toLowerCase();
  if (normalized === "continuing") return "accent";
  if (normalized === "upcoming") return "info";
  if (normalized === "ended") return "muted";
  if (normalized === "deleted") return "warning";
  return "default";
};

function MappingPreviewCard(props: MappingPreviewCardProps): React.JSX.Element {
  const { mapping, baseUrl, highlight, currentAniListId, showResetPreview, onResetPreview, portalContainer } = props;

  const link = buildExternalMediaLink({
    service: "sonarr",
    baseUrl,
    inLibrary: mapping.inLibrary,
    ...(mapping.librarySlug ? { librarySlug: mapping.librarySlug } : {}),
    searchTerm: mapping.title,
  });

  // Prepare pills logic
  const metadataPills: React.ReactNode[] = [];

  metadataPills.push(
    <Pill key="tvdb" small tone="muted" className="font-mono text-text-primary">{`TVDB ${mapping.target.id}`}</Pill>,
  );

  if (typeof mapping.year === "number" && Number.isFinite(mapping.year) && mapping.year > 0) {
    metadataPills.push(
      <Pill key="year" small tone="muted">
        {mapping.year}
      </Pill>,
    );
  }

  if (mapping.typeLabel) {
    metadataPills.push(
      <Pill key="type" small tone="muted" className="text-text-secondary">
        {mapping.typeLabel}
      </Pill>,
    );
  }

  if (mapping.statusLabel) {
    metadataPills.push(
      <Pill key="status" small tone={getStatusTone(mapping.statusLabel)}>
        {mapping.statusLabel}
      </Pill>,
    );
  }

  if (mapping.inLibrary) {
    metadataPills.push(
      <Pill key="library" small tone="success">{`In Sonarr${
        mapping.fileCount ? ` - ${mapping.fileCount} eps` : ""
      }`}</Pill>,
    );
  }

  const otherLinkedIds = Array.isArray(mapping.linkedAniListIds)
    ? mapping.linkedAniListIds.filter((id) => id !== currentAniListId)
    : [];

  return (
    <div
      className={`relative min-h-[230px] overflow-hidden rounded-xl bg-bg-secondary shadow-lg shadow-black/30 ${
        highlight === "preview" ? "ring-1 ring-inset ring-accent-primary/40" : ""
      }`}
    >
      <div className="flex gap-5 p-5">
        {/* IMAGE: Kept exactly as requested */}
        <div className="h-44 w-32 shrink-0 overflow-hidden rounded-lg bg-bg-primary shadow-inner">
          {mapping.posterUrl ? (
            <img
              src={mapping.posterUrl}
              alt={mapping.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full bg-bg-primary" />
          )}
        </div>

        {/* CONTENT COLUMN */}
        <div className="flex min-w-0 flex-1 flex-col">
          
          {/* ROW 1: Title & Actions */}
          <div className="flex items-start justify-between gap-3">
            <h3
              className="text-xl font-semibold leading-tight text-text-primary line-clamp-2"
              title={mapping.title}
            >
              {mapping.title}
            </h3>

            {/* Actions anchored top-right, separate from text flow */}
            <div className="flex shrink-0 items-center gap-1">
              {link ? (
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  tooltip="Open in Sonarr"
                  portalContainer={portalContainer ?? undefined}
                  className="h-8 w-8 text-text-secondary hover:text-text-primary"
                >
                  <a href={link} target="_blank" rel="noreferrer" aria-label="Open in Sonarr">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              ) : null}

              {highlight === "preview" && showResetPreview ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  tooltip="Clear selection"
                  portalContainer={portalContainer ?? undefined}
                  className="h-8 w-8 text-text-secondary hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onResetPreview?.();
                  }}
                  aria-label="Clear selection"
                >
                  <X className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          </div>

          {/* ROW 2: Metadata Pills - Full Width now */}
          {metadataPills.length ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {metadataPills}
            </div>
          ) : null}

          {/* ROW 3: Description */}
          <div className="mt-3 text-xs leading-relaxed text-text-secondary/80 line-clamp-4">
            {mapping.overview ?? "No overview available."}
          </div>
        </div>
      </div>

      {/* FOOTER: Warning */}
      {otherLinkedIds.length > 0 ? (
        <div className="px-5 pb-4 text-[10px] text-amber-200">
          Warning: Linked to {otherLinkedIds.length} other AniList entr
          {otherLinkedIds.length === 1 ? "y" : "ies"}
        </div>
      ) : null}
    </div>
  );
}
