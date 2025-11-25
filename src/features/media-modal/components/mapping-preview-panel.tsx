// src/features/media-modal/components/mapping-preview-panel.tsx
import { ExternalLink, Pencil, X } from "lucide-react";

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
}

export function MappingPreviewPanel(props: MappingPreviewPanelProps): React.JSX.Element {
  const {
    aniListEntry,
    otherAniListIds,
    baseUrl,
    currentMapping,
    previewMapping,
    isInMappingMode,
    showResetPreview,
    onResetPreview,
    onEditMapping,
  } = props;
  const hasPreviewMapping = Boolean(previewMapping);
  const hasCurrentMapping = Boolean(currentMapping);
  const showEmptyState = !hasPreviewMapping && !hasCurrentMapping;
  const editLabel = isInMappingMode ? "Exit mapping" : "Edit mapping";
  const EditIcon = isInMappingMode ? X : Pencil;

  return (
    <div className="flex h-full flex-col">
      <div className="pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
              Current mapping
            </p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
              <MultiMappingInfo currentAniListId={aniListEntry.id} linkedAniListIds={otherAniListIds} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {showResetPreview ? (
              <Button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onResetPreview();
                }}
                variant="ghost"
                size="sm"
                className="inline-flex items-center gap-2 text-sm font-medium text-text-secondary hover:text-text-primary"
              >
                Clear selection
              </Button>
            ) : null}
            <Button
              type="button"
              onClick={(e) => {
                // Prevent parent handlers from receiving this click.
                e.stopPropagation();
                onEditMapping();
              }}
              variant="ghost"
              size="sm"
              className="inline-flex items-center gap-2 text-sm font-medium text-text-primary"
              aria-label={editLabel}
            >
              {editLabel}
              <span className="inline-flex items-center">
                <EditIcon className="h-4 w-4" />
              </span>
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-3">
        {hasCurrentMapping && currentMapping ? (
          <MappingPreviewCard
            mapping={currentMapping}
            baseUrl={baseUrl}
          />
        ) : null}

        {hasPreviewMapping && previewMapping ? (
          <MappingPreviewCard
            mapping={previewMapping}
            baseUrl={baseUrl}
            highlight="preview"
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
}

function MappingPreviewCard(props: MappingPreviewCardProps) {
  const { mapping, baseUrl, highlight } = props;

  const link = buildExternalMediaLink({
    service: "sonarr",
    baseUrl,
    inLibrary: mapping.inLibrary,
    ...(mapping.librarySlug ? { librarySlug: mapping.librarySlug } : {}),
    searchTerm: mapping.title,
  });
  const metadataPills: React.ReactNode[] = [];

  metadataPills.push(
    <Pill key="tvdb" small tone="muted" className="font-mono text-text-primary">{`TVDB ${mapping.target.id}`}</Pill>
  );

  if (mapping.year) {
    metadataPills.push(
      <Pill key="year" small tone="muted">
        {mapping.year}
      </Pill>
    );
  }

  if (mapping.typeLabel) {
    metadataPills.push(
      <Pill key="type" small tone="muted" className="text-text-secondary">
        {mapping.typeLabel}
      </Pill>
    );
  }

  if (mapping.inLibrary) {
    metadataPills.push(
      <Pill key="library" small tone="success">{`In Sonarr${mapping.fileCount ? ` - ${mapping.fileCount} eps` : ""}`}</Pill>
    );
  }

  return (
    <div className={`overflow-hidden rounded-xl bg-bg-secondary shadow-lg shadow-black/30 ${highlight === "preview" ? "ring-1 ring-inset ring-accent-primary/40" : ""}`}>
      <div className="flex gap-4 p-4">
        <div className="h-40 w-28 overflow-hidden rounded-lg bg-bg-primary shadow-inner">
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

        <div className="flex flex-1 items-start gap-3">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="text-xl font-semibold leading-tight text-text-primary line-clamp-2">
              {mapping.title}
            </div>

            {metadataPills.length ? (
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                {metadataPills}
              </div>
            ) : null}

            <div className="text-xs leading-relaxed text-text-secondary/80 line-clamp-4">
              {mapping.overview ?? "No overview available."}
            </div>
          </div>

          {link ? (
            <Button
              asChild
              variant="ghost"
              size="icon"
              tooltip="Open in Sonarr"
              className="shrink-0 self-start text-text-secondary hover:text-text-primary"
            >
              <a href={link} target="_blank" rel="noreferrer" aria-label="Open in Sonarr">
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          ) : null}
        </div>
      </div>

      {mapping.linkedAniListIds && mapping.linkedAniListIds.length > 0 ? (
        <div className="px-4 pb-3 text-[10px] text-amber-200">
          Warning: Linked to {mapping.linkedAniListIds.length} other AniList entr{mapping.linkedAniListIds.length === 1 ? "y" : "ies"}
        </div>
      ) : null}
    </div>
  );
}
