// src/features/media-modal/components/mapping-preview-panel.tsx
import { ExternalLink, Pencil } from "lucide-react";
import Button from '@/shared/components/button';
import Pill from '@/shared/components/pill';
import type { MappingSearchResult } from "@/shared/types";
import { buildExternalMediaLink } from "@/shared/utils/build-external-media-link";
import type { AniListEntrySummary } from "../types";
import { MultiMappingInfo } from "./multi-mapping-info";

interface MappingPreviewPanelProps {
  aniListEntry: AniListEntrySummary;
  otherAniListIds: number[];
  baseUrl: string;
  mapping: MappingSearchResult | null;
  isPreviewingSelection: boolean;
  showResetPreview: boolean;
  onResetPreview: () => void;
  onEditMapping: () => void;
}

export function MappingPreviewPanel(props: MappingPreviewPanelProps): React.JSX.Element {
  const {
    aniListEntry,
    otherAniListIds,
    baseUrl,
    mapping,
    isPreviewingSelection,
    onEditMapping,
  } = props;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
            Current mapping
          </p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
            <span className="font-mono text-text-primary/80">AniList {aniListEntry.id}</span>
            <MultiMappingInfo currentAniListId={aniListEntry.id} linkedAniListIds={otherAniListIds} />
            {isPreviewingSelection ? (
              <span className="rounded-full bg-accent-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-primary">
                Previewing selection
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
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
          >
            Edit mapping
            <span className="inline-flex items-center">
              <Pencil className="h-4 w-4" />
            </span>
          </Button>
        </div>
      </div>

      <MappingPreviewCard
        mapping={mapping}
        baseUrl={baseUrl}
        isPreviewingSelection={isPreviewingSelection}
      />
    </div>
  );
}

interface MappingPreviewCardProps {
  mapping: MappingSearchResult | null;
  baseUrl: string;
  isPreviewingSelection: boolean;
}

function MappingPreviewCard(props: MappingPreviewCardProps) {
  const { mapping, baseUrl, isPreviewingSelection } = props;

  if (!mapping) {
    return (
      <div className="flex min-h-[260px] items-center justify-center rounded-xl border border-dashed border-border-primary bg-bg-tertiary/60 text-sm text-text-secondary">
        No mapping yet. Use the search to pick the correct TVDB series.
      </div>
    );
  }

  const link = buildExternalMediaLink({
    service: "sonarr",
    baseUrl,
    inLibrary: mapping.inLibrary,
    ...(mapping.librarySlug ? { librarySlug: mapping.librarySlug } : {}),
    searchTerm: mapping.title,
  });
  const detailParts = [
    mapping.year ? String(mapping.year) : null,
    mapping.networkOrStudio ?? null,
    mapping.episodeOrMovieCount ? `${mapping.episodeOrMovieCount} eps` : null,
  ].filter((value): value is string => Boolean(value));

  return (
    <div className="overflow-hidden rounded-xl bg-bg-secondary shadow-lg shadow-black/30">
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

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
            <Pill small tone="default" className="font-mono text-text-primary">{`TVDB ${mapping.target.id}`}</Pill>
            {mapping.typeLabel ? (
              <Pill small tone="default" className="text-text-secondary">{mapping.typeLabel}</Pill>
            ) : null}
            {isPreviewingSelection ? (
              <Pill small tone="accent" className="uppercase tracking-wide">SELECTED</Pill>
            ) : null}
            {mapping.inLibrary ? (
              <Pill small tone="success">{`In library${mapping.fileCount ? ` (${mapping.fileCount} downloaded)` : ""}`}</Pill>
            ) : (
              <Pill small tone="blue">Not in library</Pill>
            )}
          </div>

          <div className="text-xl font-semibold leading-tight text-text-primary line-clamp-2">
            {mapping.title}
          </div>

          <div className="text-xs text-text-secondary">
            {detailParts.join(" | ")}
          </div>

          <div className="text-xs text-text-secondary/80 leading-relaxed line-clamp-4">
            {mapping.overview ?? "No overview available."}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between bg-bg-primary/30 px-4 py-3 text-xs text-text-secondary">
        {mapping.statusLabel ? (
          <span className="rounded bg-bg-primary/60 px-2 py-1 uppercase text-[10px] font-medium text-text-secondary">
            {mapping.statusLabel}
          </span>
        ) : <span />}
        {link ? (
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="inline-flex items-center gap-1 text-sm font-medium text-accent-primary hover:text-accent-hover"
          >
            <a href={link} target="_blank" rel="noreferrer">
              Open in Sonarr <ExternalLink size={14} />
            </a>
          </Button>
        ) : null}
      </div>

      {mapping.linkedAniListIds && mapping.linkedAniListIds.length > 0 ? (
        <div className="px-4 pb-3 text-[10px] text-amber-200">
          Warning: Linked to {mapping.linkedAniListIds.length} other AniList entr{mapping.linkedAniListIds.length === 1 ? "y" : "ies"}
        </div>
      ) : null}
    </div>
  );
}

