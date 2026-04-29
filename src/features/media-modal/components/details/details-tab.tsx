/** Renders the modal mapping details tab for setup and candidate preview states. */
// src/features/media-modal/components/details/details-tab.tsx

import { ArrowDown, ExternalLink, X } from 'lucide-react';
import { useMediaModalContext } from '../../context';
import type { AniListId } from '@/anilist';
import type { MappingInspectionLinkedAniListEntry } from '@/mapping/inspection/inspection-types';
import type { MappingSearchResult } from '@/features/media-modal/mapping-search/types';
import type { Provider } from '@/providers';
import { getProviderIdLabel, getProviderLabel } from '@/providers/provider-labels';
import Button from '@/shared/ui/primitives/button';
import Pill from '@/shared/ui/primitives/pill';
import { buildProviderOpenUrl } from '@/providers/provider-links';
import { MappingLinkedEntries } from './linked-entries';

type MappingPreviewDetailsProps = {
  aniListEntryId: AniListId;
  effectiveMapping: MappingSearchResult | null;
  previewMapping: MappingSearchResult | null;
  isInMappingMode: boolean;
  showResetPreview: boolean;
  onResetPreview: () => void;
  linkedAniListEntries: readonly MappingInspectionLinkedAniListEntry[];
};

type MappingDetailRow = {
  label: string;
  value: string;
};

function formatDetailValue(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getStatusTone(
  status: string,
): 'muted' | 'success' | 'warning' | 'info' | 'accent' | 'blue' | 'default' {
  const normalized = status.toLowerCase();
  if (normalized === 'continuing') return 'accent';
  if (normalized === 'upcoming') return 'info';
  if (normalized === 'ended') return 'muted';
  if (normalized === 'deleted') return 'warning';
  return 'default';
}

function MappingPreviewCard(props: {
  mapping: MappingSearchResult;
  providerLabel: Capitalize<Provider>;
  baseUrl: string;
  showResetPreview: boolean;
  onResetPreview: () => void;
  contentContainer?: HTMLDivElement | null;
}): React.JSX.Element {
  const { mapping, providerLabel, baseUrl, showResetPreview, onResetPreview, contentContainer } = props;
  const tooltipContainer = contentContainer ?? undefined;
  const providerIdLabel = `${getProviderLabel(mapping.provider)} · ${getProviderIdLabel(mapping.provider)} ${mapping.providerId}`;
  const link = buildProviderOpenUrl({
    provider: mapping.provider,
    baseUrl,
    isInLibrary: mapping.isInLibrary,
    ...(mapping.providerRouteSlug ? { providerRouteSlug: mapping.providerRouteSlug } : {}),
    searchTerm: mapping.title,
  });
  const metadataPills: React.ReactNode[] = [
    <Pill key="provider-id" small tone="muted" className="font-mono text-text-primary">
      {providerIdLabel}
    </Pill>,
  ];

  if (typeof mapping.year === 'number' && Number.isFinite(mapping.year) && mapping.year > 0) {
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

  if (mapping.isInLibrary) {
    metadataPills.push(
      <Pill key="library" small tone="success" className="border-transparent bg-success/85 text-white">
        {`In ${providerLabel}${mapping.fileCount ? ` - ${mapping.fileCount} eps` : ''}`}
      </Pill>,
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border-primary/70 bg-bg-primary/18 ring-1 ring-inset ring-accent-primary/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <div className="flex gap-5 p-4">
        <div className="h-44 w-32 shrink-0 overflow-hidden rounded-lg bg-bg-primary shadow-inner">
          {mapping.posterUrl ? (
            <img src={mapping.posterUrl} alt={mapping.title} className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-bg-primary" />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-3">
            <h3 className="line-clamp-2 text-xl font-semibold leading-tight text-text-primary" title={mapping.title}>
              {mapping.title}
            </h3>

            <div className="flex shrink-0 items-center gap-1">
              {link ? (
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  tooltip={`Open in ${providerLabel}`}
                  tooltipContainer={tooltipContainer}
                  className="h-8 w-8 text-text-secondary hover:text-text-primary"
                >
                  <a href={link} target="_blank" rel="noreferrer" aria-label={`Open in ${providerLabel}`}>
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              ) : null}

              {showResetPreview ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  tooltip="Clear selection"
                  tooltipContainer={tooltipContainer}
                  className="h-8 w-8 text-text-secondary hover:text-destructive"
                  onClick={(event) => {
                    event.stopPropagation();
                    onResetPreview();
                  }}
                  aria-label="Clear selection"
                >
                  <X className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">{metadataPills}</div>

          <div className="mt-3 line-clamp-4 text-xs leading-relaxed text-text-secondary/80">
            {mapping.overview ?? 'No overview available.'}
          </div>
        </div>
      </div>
    </div>
  );
}

export function MappingPreviewDetails(props: MappingPreviewDetailsProps): React.JSX.Element {
  const {
    aniListEntryId,
    effectiveMapping,
    previewMapping,
    isInMappingMode,
    showResetPreview,
    onResetPreview,
    linkedAniListEntries,
  } = props;
  const { providerLabel, baseUrl, contentContainer } = useMediaModalContext();
  const detailRows: MappingDetailRow[] = [];

  if (effectiveMapping) {
    detailRows.push({ label: 'In library', value: effectiveMapping.isInLibrary ? 'Yes' : 'No' });

    if (effectiveMapping.fileCount !== undefined) {
      detailRows.push({ label: 'Episodes', value: String(effectiveMapping.fileCount) });
    }

    if (effectiveMapping.typeLabel) {
      detailRows.push({ label: 'Type', value: formatDetailValue(effectiveMapping.typeLabel) });
    }

    if (effectiveMapping.statusLabel) {
      detailRows.push({ label: 'Status', value: formatDetailValue(effectiveMapping.statusLabel) });
    }
  }

  if (!isInMappingMode) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4 pr-1">
        {effectiveMapping ? (
          <div className="rounded-xl border border-border-primary/50 bg-bg-primary/14 p-3">
            <div className="min-w-0 flex-1 space-y-2">
              {detailRows.map((row) => (
                <div key={row.label} className="flex items-baseline justify-between gap-4 text-sm">
                  <span className="text-text-secondary">{row.label}</span>
                  <span className="text-right font-medium text-text-primary">{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <MappingLinkedEntries
          className="flex min-h-0 flex-1 flex-col space-y-2"
          currentAniListId={aniListEntryId}
          entries={linkedAniListEntries}
        />
      </div>
    );
  }

  if (previewMapping) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4 pr-1">
        <div className="rounded-xl border border-border-primary/50 bg-bg-primary/14 p-3">
          <div className="flex items-center gap-2 text-accent-primary">
            <ArrowDown className="h-4 w-4 shrink-0" />
            <p className="text-sm font-medium text-text-primary">
              {`Confirm selection to replace the current ${providerLabel} target above.`}
            </p>
          </div>
        </div>

        <MappingPreviewCard
          mapping={previewMapping}
          providerLabel={providerLabel}
          baseUrl={baseUrl}
          showResetPreview={showResetPreview}
          onResetPreview={onResetPreview}
          contentContainer={contentContainer}
        />

        <MappingLinkedEntries
          className="flex min-h-0 flex-1 flex-col space-y-2"
          currentAniListId={aniListEntryId}
          linkedAniListIds={previewMapping.linkedAniListIds ?? []}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-65 flex-1 items-center justify-center rounded-xl border border-dashed border-border-primary bg-bg-tertiary/60 px-3 text-center text-sm text-text-secondary">
      {`Select a search result to preview how it would replace the current ${providerLabel} target shown above.`}
    </div>
  );
}
