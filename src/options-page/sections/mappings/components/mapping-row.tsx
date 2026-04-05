/** Renders mapping rows and inline actions for provider-linked AniList mapping entries. */
// src/options-page/sections/mappings/components/mapping-row.tsx

import React, { useMemo } from 'react';
import * as Accordion from '@radix-ui/react-accordion';
import { ChevronDown } from 'lucide-react';
import type { AniListMetadata } from '@/anilist/schemas/metadata.schema';
import type { Provider } from '@/providers';
import type { MappingSource, MappingSummary } from '@/mapping/types';
import { useAniListMetadataBatch } from '@/shared/queries';
import Pill from '@/shared/ui/primitives/pill';
import { cn } from '@/shared/utils/cn';
import SonarrIcon from '@/assets/sonarr.svg';
import RadarrIcon from '@/assets/radarr.svg';
import { MappingEntryRow } from './mapping-entry-row';

export type MappingTableEntry = {
  entry: MappingSummary;
  title: string;
  metadata?: AniListMetadata | null | undefined;
};

export type MappingTableRowData = {
  id: string;
  provider: Provider;
  providerId: number | null;
  providerMeta?: MappingSummary['providerMeta'];
  entries: MappingTableEntry[];
  sources: MappingSource[];
  updatedAt?: number;
};

const sourceStyles: Record<MappingSummary['source'], { label: string; className: string }> = {
  manual: { label: 'Manual', className: 'bg-accent-primary/16 text-accent-primary border-accent-primary/30' },
  unresolved: { label: 'Unresolved', className: 'bg-warning/14 text-warning border-warning/24' },
  rejected: { label: 'Rejected', className: 'bg-warning/12 text-warning border-warning/20' },
  blocked: { label: 'Blocked', className: 'bg-error/16 text-error border-error/28' },
  auto: { label: 'Auto', className: 'bg-success/14 text-success border-success/24' },
  upstream: { label: 'Upstream', className: 'bg-bg-primary/46 text-text-secondary border-border-primary/70' },
  ignored: { label: 'Ignored', className: 'bg-error/12 text-error border-error/24' },
};

const formatRelativeTime = (timestamp?: number | null): string | null => {
  if (!timestamp) return null;
  const diffSeconds = Math.floor((Date.now() - timestamp) / 1000);
  if (!Number.isFinite(diffSeconds)) return null;
  const absolute = Math.abs(diffSeconds);
  if (absolute < 60) return 'Just now';
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 60 * 60 * 24 * 365],
    ['month', 60 * 60 * 24 * 30],
    ['week', 60 * 60 * 24 * 7],
    ['day', 60 * 60 * 24],
    ['hour', 60 * 60],
    ['minute', 60],
  ];
  const match = units.find(([, seconds]) => absolute >= seconds);
  const [unit, secondsPerUnit] = match ?? units.at(-1)!;
  const value = Math.max(1, Math.round(absolute / secondsPerUnit));
  return `${value} ${unit}${value > 1 ? 's' : ''} ago`;
};

const resolveAniListTitle = (
  metadata: AniListMetadata | null | undefined,
  fallback?: string | null,
): string => {
  return (
    metadata?.titles?.english ||
    metadata?.titles?.romaji ||
    metadata?.titles?.native ||
    fallback ||
    'Unknown title'
  );
};

type MappingAccordionItemProps = {
  row: MappingTableRowData;
  rowIndex: number;
  isMutating: boolean;
  isExpanded: boolean;
  onEdit: (entry: MappingSummary) => void;
  onDeleteOverride: (entry: MappingSummary) => void;
  onRejectCandidate: (entry: MappingSummary) => void;
  onClearRejectedCandidate: (entry: MappingSummary) => void;
  onBlockCandidate: (entry: MappingSummary) => void;
  onClearBlockedCandidate: (entry: MappingSummary) => void;
  onIgnoreTitle: (entry: MappingSummary) => void;
  onClearIgnoreTitle: (entry: MappingSummary) => void;
  providerUrl?: string | null;
};

export const MappingAccordionItem: React.FC<MappingAccordionItemProps> = ({
  row,
  rowIndex,
  isMutating,
  isExpanded,
  onEdit,
  onDeleteOverride,
  onRejectCandidate,
  onClearRejectedCandidate,
  onBlockCandidate,
  onClearBlockedCandidate,
  onIgnoreTitle,
  onClearIgnoreTitle,
  providerUrl,
}) => {
  const anilistIds = useMemo(
    () =>
      [...new Set(
          row.entries
            .map(({ entry }) => entry.anilistId)
            .filter((id): id is number => Number.isFinite(id)),
        )],
    [row.entries],
  );

  const providedMetadata = useMemo(() => {
    const map = new Map<number, AniListMetadata>();
    for (const { entry, metadata } of row.entries) {
      if (metadata) {
        map.set(entry.anilistId, metadata);
      }
    }
    return map;
  }, [row.entries]);

  const missingMetadataIds = useMemo(
    () => anilistIds.filter((id) => !providedMetadata.has(id)),
    [anilistIds, providedMetadata],
  );

  const fetchedMetadata = useAniListMetadataBatch(missingMetadataIds, {
    enabled: isExpanded && missingMetadataIds.length > 0,
  });

  const metadataMap = useMemo(() => {
    const map = new Map<number, AniListMetadata>(providedMetadata);
    for (const entry of fetchedMetadata.data?.metadata ?? []) {
      map.set(entry.id, entry);
    }
    return map;
  }, [providedMetadata, fetchedMetadata.data?.metadata]);

  const firstEntry = row.entries[0];
  const firstEntryMetadata = firstEntry ? metadataMap.get(firstEntry.entry.anilistId) ?? firstEntry.metadata ?? null : null;
  const uniqueSources = [...new Set(row.sources)];
  const prefersAniListTitle = row.providerId === null;
  const preferredProviderTitle = prefersAniListTitle ? null : row.providerMeta?.title;
  const targetTitle =
    preferredProviderTitle ??
    (firstEntry ? resolveAniListTitle(firstEntryMetadata, firstEntry.title) : null) ??
    row.providerMeta?.title ??
    (row.providerId === null ? 'Unmapped' : `${row.provider === 'radarr' ? 'TMDB' : 'TVDB'} #${row.providerId}`);
  const externalIdLabel = row.providerId === null
    ? null
    : `${row.provider === 'radarr' ? 'TMDB' : 'TVDB'} #${row.providerId}`;
  const updatedLabel = row.updatedAt ? formatRelativeTime(row.updatedAt) : null;
  const providerIcon = row.provider === 'sonarr' ? SonarrIcon : RadarrIcon;
  const providerLabel = row.provider === 'sonarr' ? 'Sonarr' : 'Radarr';
  const inLibraryCount = row.entries.filter((e) => e.entry.status === 'in-provider').length;
  const hasMapping = row.providerId !== null;
  let linkedLabel = 'No target linked';
  if (hasMapping) {
    linkedLabel =
      inLibraryCount > 0
        ? `${row.entries.length} linked · ${inLibraryCount} in library`
        : `${row.entries.length} linked`;
  } else if (uniqueSources.includes('rejected')) {
    linkedLabel = 'Rejected candidate';
  } else if (uniqueSources.includes('blocked')) {
    linkedLabel = 'Blocked candidate';
  } else if (uniqueSources.includes('ignored')) {
    linkedLabel = 'Title ignored';
  } else if (uniqueSources.includes('unresolved')) {
    linkedLabel = 'Unresolved attempt';
  }
  const hasMultipleSources = uniqueSources.length > 1;

  const showChildSourceBadges = hasMultipleSources || row.entries.length > 1;
  const rowBaseBg =
    rowIndex % 2 === 0
      ? 'bg-bg-primary/10'
      : 'bg-bg-secondary/22';

  return (
    <Accordion.Item
      value={row.id}
      className={cn(
        'border-b border-border-primary/70 last:border-b-0 transition-colors',
        rowBaseBg,
        isExpanded && 'bg-bg-secondary/34',
      )}
    >
      <Accordion.Header className="flex">
        <Accordion.Trigger
          className={cn(
            'group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors md:px-6',
            isExpanded ? 'bg-bg-secondary/24' : 'hover:bg-bg-secondary/28',
          )}
        >
          <ChevronDown className="h-4 w-4 shrink-0 text-text-secondary transition-transform duration-200 group-data-[state=open]:rotate-180" />

          <div className="min-w-0 flex-1">
            <div className="grid grid-cols-[minmax(0,1.7fr)_120px_120px] items-center gap-3 md:grid-cols-[minmax(0,1.9fr)_170px_140px_120px]">
              <div className="flex min-w-0 items-center gap-2.5">
                <img
                  src={providerIcon}
                  alt={providerLabel}
                  className={cn('h-5 w-5 shrink-0', !hasMapping && 'grayscale opacity-40')}
                />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-text-primary" title={targetTitle}>
                    {targetTitle}
                  </div>
                  <div className="mt-0.5 text-xs text-text-secondary">
                    {externalIdLabel ? (
                      <span className="font-mono">{externalIdLabel}</span>
                    ) : (
                      <span className="italic text-text-tertiary">No mapping</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="hidden text-xs text-text-secondary md:block">{linkedLabel}</div>

              <div className="flex min-w-0 items-center gap-1.5">
                {hasMultipleSources ? (
                  <Pill
                    small
                    tone="default"
                    className="border border-warning/24 bg-warning/14 text-warning"
                    title={uniqueSources.map((source) => sourceStyles[source].label).join(' / ')}
                  >
                    Multi
                  </Pill>
                ) : (
                  uniqueSources.map((source) => {
                    const badge = sourceStyles[source];
                    return (
                      <Pill key={source} small tone="default" className={cn('border', badge.className)}>
                        {badge.label}
                      </Pill>
                    );
                  })
                )}
              </div>

              <div className="hidden text-right text-xs text-text-secondary md:block">
                {updatedLabel ?? '-'}
              </div>
            </div>

            <div className="mt-1 text-xs text-text-secondary md:hidden">
              <span>{linkedLabel}</span>
              <span className="mx-1 text-text-tertiary">·</span>
              <span>{updatedLabel ?? '-'}</span>
            </div>
          </div>
        </Accordion.Trigger>
      </Accordion.Header>

      <Accordion.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
        {isExpanded ? (
          <div className="relative px-3 pb-3 pt-2 md:px-5 md:pb-4">
            <div
              className="pointer-events-none absolute bottom-3 left-8 top-2 w-px rounded-full bg-border-primary/60"
              aria-hidden="true"
            />
            <div className="space-y-3 pl-6">
              {row.entries.map(({ entry, title }) => {
                const resolvedMetadata = metadataMap.get(entry.anilistId) ?? null;
                const resolvedTitle = resolveAniListTitle(resolvedMetadata, title);

                return (
                  <MappingEntryRow
                    key={entry.anilistId}
                    entry={entry}
                    title={resolvedTitle}
                    metadata={resolvedMetadata}
                    isMutating={isMutating}
                    onEdit={onEdit}
                    onDeleteOverride={onDeleteOverride}
                    onRejectCandidate={onRejectCandidate}
                    onClearRejectedCandidate={onClearRejectedCandidate}
                    onBlockCandidate={onBlockCandidate}
                    onClearBlockedCandidate={onClearBlockedCandidate}
                    onIgnoreTitle={onIgnoreTitle}
                    onClearIgnoreTitle={onClearIgnoreTitle}
                    providerUrl={providerUrl ?? null}
                    hideSourceBadge={!showChildSourceBadges}
                  />
                );
              })}
            </div>
          </div>
        ) : null}
      </Accordion.Content>
    </Accordion.Item>
  );
};
