import React, { useMemo } from 'react';
import * as Accordion from '@radix-ui/react-accordion';
import { ChevronDown, EyeOff, Pencil, Trash2, Undo2 } from 'lucide-react';
import type {
  MappingExternalId,
  MappingProvider,
  MappingSource,
  MappingSummary,
} from '@/shared/types';
import type { AniListMetadataDto } from '@/rpc/schemas';
import {
  useAniListMetadataBatch,
  useSeriesStatus,
} from '@/shared/hooks/use-api-queries';
import Button from '@/shared/components/button';
import Pill from '@/shared/components/pill';
import { cn } from '@/shared/utils/cn';
import SonarrIcon from '@/assets/sonarr.svg';
import RadarrIcon from '@/assets/radarr.svg';

export type MappingTableEntry = {
  entry: MappingSummary;
  title: string;
  metadata?: AniListMetadataDto | null | undefined;
};

export type MappingTableRowData = {
  id: string;
  provider: MappingProvider;
  externalId: MappingExternalId | null;
  providerMeta?: MappingSummary['providerMeta'];
  entries: MappingTableEntry[];
  sources: MappingSource[];
  updatedAt?: number;
};

const sourceStyles: Record<MappingSummary['source'], { label: string; className: string }> = {
  manual: { label: 'Manual', className: 'bg-blue-500/15 text-blue-300' },
  auto: { label: 'Auto', className: 'bg-purple-500/15 text-purple-300' },
  upstream: { label: 'Upstream', className: 'bg-slate-500/15 text-slate-200' },
  ignored: { label: 'Ignored', className: 'bg-red-500/15 text-red-300' },
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
  const [unit, secondsPerUnit] = match ?? units[units.length - 1]!;
  const value = Math.max(1, Math.round(absolute / secondsPerUnit));
  return `${value} ${unit}${value > 1 ? 's' : ''} ago`;
};

const getExternalLink = (provider: MappingProvider, externalId: MappingExternalId | null) => {
  if (!externalId) return null;
  if (externalId.kind === 'tvdb') {
    return `https://thetvdb.com/dereferrer/series/${externalId.id}`;
  }
  const tmdbType = provider === 'sonarr' ? 'tv' : 'movie';
  return `https://www.themoviedb.org/${tmdbType}/${externalId.id}`;
};

const MetaSeparator: React.FC = () => <span className="text-text-tertiary">·</span>;

const buildProviderLink = (
  baseUrl: string | null | undefined,
  provider: MappingProvider,
  titleSlug?: string | null,
) => {
  if (!baseUrl) return null;
  const normalized = baseUrl.replace(/\/$/, '');
  if (provider === 'sonarr' && titleSlug) {
    return `${normalized}/series/${titleSlug}`;
  }
  return null;
};

type MappingEntryRowProps = {
  entry: MappingSummary;
  title: string;
  metadata?: AniListMetadataDto | null | undefined;
  isMutating: boolean;
  onEdit: (entry: MappingSummary) => void;
  onDeleteOverride: (entry: MappingSummary) => void;
  onIgnore: (entry: MappingSummary) => void;
  onClearIgnore: (entry: MappingSummary) => void;
  providerUrl?: string | null;
};

const MappingEntryRow: React.FC<MappingEntryRowProps> = ({
  entry,
  title,
  metadata,
  isMutating,
  onEdit,
  onDeleteOverride,
  onIgnore,
  onClearIgnore,
  providerUrl,
}) => {
  const sourceBadge = sourceStyles[entry.source];

  const sonarrStatus = useSeriesStatus(
    {
      anilistId: entry.anilistId,
      title,
      metadata: metadata
        ? {
            titles: metadata.titles,
            startYear: metadata.seasonYear,
            format: metadata.format,
            coverImage: metadata.coverImage?.large ?? metadata.coverImage?.medium ?? undefined,
          }
        : null,
    },
    { enabled: entry.provider === 'sonarr' && !!entry.externalId, network: 'never' },
  );

  const anilistCover =
    metadata?.coverImage?.large ??
    metadata?.coverImage?.medium;

  const anilistYear = metadata?.seasonYear;
  const anilistFormat = metadata?.format;

  const formatLabel = anilistFormat ? anilistFormat.replace(/_/g, ' ') : null;
  const providerStatus = entry.providerMeta?.statusLabel ?? null;
  const metaParts = [formatLabel, anilistYear ? String(anilistYear) : null, providerStatus].filter(Boolean) as string[];

  const series = sonarrStatus.data?.series;
  const sonarrSlug = series && 'titleSlug' in series ? (series as { titleSlug?: string | null })?.titleSlug : undefined;
  const providerLink = buildProviderLink(providerUrl, entry.provider, sonarrSlug);
  const externalLink = getExternalLink(entry.provider, entry.externalId);

  const linkItems: Array<{ label: string; href: string; tooltip: string }> = [
    { label: 'AniList ↗', href: `https://anilist.co/anime/${entry.anilistId}`, tooltip: 'Open on AniList' },
    providerLink
      ? {
          label: entry.provider === 'sonarr' ? 'Sonarr ↗' : 'Radarr ↗',
          href: providerLink,
          tooltip: entry.provider === 'sonarr' ? 'Open in Sonarr' : 'Open in Radarr',
        }
      : null,
    externalLink && (entry.provider !== 'sonarr' || externalLink !== providerLink)
      ? {
          label: entry.externalId?.kind === 'tmdb' ? 'TMDB ↗' : 'TVDB ↗',
          href: externalLink,
          tooltip: entry.externalId?.kind === 'tmdb' ? 'Open on TMDB' : 'Open on TVDB',
        }
      : null,
  ].filter((link): link is { label: string; href: string; tooltip: string } => Boolean(link?.href));

  return (
    <div className="rounded-lg border border-border-primary/70 bg-bg-secondary/60">
      <div className="flex gap-4 p-4">
        <div className="h-20 w-14 shrink-0 overflow-hidden rounded-md bg-bg-primary">
          {anilistCover ? (
            <img
              src={anilistCover}
              alt={title}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-linear-to-br from-bg-tertiary to-bg-primary text-text-tertiary">
              <span className="text-[11px]">No image</span>
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-2">
                <span className="truncate text-sm font-semibold text-text-primary" title={title}>
                  {title}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                {metaParts.map((part, idx) => (
                  <React.Fragment key={`${part}-${idx}`}>
                    {idx > 0 ? <MetaSeparator /> : null}
                    <span className="whitespace-nowrap">{part}</span>
                  </React.Fragment>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Pill small tone="default" className={sourceBadge.className}>
                {sourceBadge.label}
              </Pill>
              {entry.source === 'manual' ? (
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-error hover:text-error"
                  onClick={() => onDeleteOverride(entry)}
                  disabled={isMutating}
                  tooltip="Delete override"
                  aria-label="Delete override"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              ) : entry.source === 'ignored' ? (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => onClearIgnore(entry)}
                  disabled={isMutating}
                  tooltip="Remove ignore"
                  aria-label="Remove ignore"
                >
                  <Undo2 className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => onIgnore(entry)}
                  disabled={isMutating}
                  tooltip="Ignore mapping"
                  aria-label="Ignore mapping"
                >
                  <EyeOff className="h-4 w-4" />
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onEdit(entry)}
                disabled={isMutating}
                tooltip={entry.provider === 'sonarr' ? 'Edit mapping' : 'Radarr editing coming soon'}
                aria-label={entry.provider === 'sonarr' ? 'Edit mapping' : 'Radarr editing coming soon'}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
            {linkItems.map((link) => (
              <Button
                key={link.label}
                size="sm"
                variant="outline"
                className="px-2 text-xs"
                tooltip={link.tooltip}
                onClick={() => {
                  try {
                    window.open(link.href, '_blank', 'noopener');
                  } catch {
                    // ignore
                  }
                }}
              >
                {link.label}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

type MappingAccordionItemProps = {
  row: MappingTableRowData;
  isMutating: boolean;
  isExpanded: boolean;
  onEdit: (entry: MappingSummary) => void;
  onDeleteOverride: (entry: MappingSummary) => void;
  onIgnore: (entry: MappingSummary) => void;
  onClearIgnore: (entry: MappingSummary) => void;
  providerUrl?: string | null;
};

export const MappingAccordionItem: React.FC<MappingAccordionItemProps> = ({
  row,
  isMutating,
  isExpanded,
  onEdit,
  onDeleteOverride,
  onIgnore,
  onClearIgnore,
  providerUrl,
}) => {
  const anilistIds = useMemo(
    () =>
      Array.from(
        new Set(
          row.entries
            .map(({ entry }) => entry.anilistId)
            .filter((id): id is number => Number.isFinite(id)),
        ),
      ),
    [row.entries],
  );

  const providedMetadata = useMemo(() => {
    const map = new Map<number, AniListMetadataDto>();
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
    const map = new Map<number, AniListMetadataDto>(providedMetadata);
    for (const entry of fetchedMetadata.data?.metadata ?? []) {
      map.set(entry.id, entry);
    }
    return map;
  }, [providedMetadata, fetchedMetadata.data?.metadata]);

  const firstEntry = row.entries[0];
  const targetTitle =
    row.providerMeta?.title ??
    firstEntry?.title ??
    (row.externalId ? `${row.externalId.kind.toUpperCase()} #${row.externalId.id}` : 'Unmapped');
  const externalIdLabel = row.externalId
    ? `${row.externalId.kind.toUpperCase()} #${row.externalId.id}`
    : null;
  const updatedLabel = row.updatedAt ? formatRelativeTime(row.updatedAt) : null;
  const providerIcon = row.provider === 'sonarr' ? SonarrIcon : RadarrIcon;
  const providerLabel = row.provider === 'sonarr' ? 'Sonarr' : 'Radarr';
  const inLibraryCount = row.entries.filter((e) => e.entry.status === 'in-provider').length;
  const hasMapping = Boolean(row.externalId);
  const linkedLabel = inLibraryCount > 0
    ? `${row.entries.length} linked · ${inLibraryCount} in library`
    : `${row.entries.length} linked`;
  const uniqueSources = Array.from(new Set(row.sources));
  const hasMultipleSources = uniqueSources.length > 1;

  return (
    <Accordion.Item value={row.id} className="border-b border-border-primary/70">
      <Accordion.Header className="flex">
        <Accordion.Trigger className="group flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-bg-secondary/60 md:px-6">
          <ChevronDown className="h-4 w-4 shrink-0 text-text-secondary transition-transform duration-200 group-data-[state=open]:rotate-180" />

          <div className="flex-1">
            <div className="grid grid-cols-[minmax(0,1.5fr)_100px_120px_100px] items-center gap-3 md:grid-cols-[minmax(0,1.5fr)_120px_140px_120px]">
              {/* Title + Provider Icon */}
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
                  <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                    {externalIdLabel ? (
                      <span className="font-mono">{externalIdLabel}</span>
                    ) : (
                      <span className="italic text-text-tertiary">No mapping</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Linked count */}
              <div className="text-xs text-text-secondary">{linkedLabel}</div>

              {/* Sources */}
              <div className="flex flex-wrap items-center gap-1">
                {hasMultipleSources ? (
                  <Pill
                    small
                    tone="default"
                    className="bg-amber-500/15 text-amber-300"
                    title={uniqueSources.map((source) => sourceStyles[source].label).join(' / ')}
                  >
                    Multi
                  </Pill>
                ) : (
                  uniqueSources.map((source) => {
                    const badge = sourceStyles[source];
                    return (
                      <Pill key={source} small tone="default" className={badge.className}>
                        {badge.label}
                      </Pill>
                    );
                  })
                )}
              </div>

              {/* Updated */}
              <div className="hidden text-xs text-text-secondary md:block">{updatedLabel ?? '-'}</div>
            </div>
          </div>
        </Accordion.Trigger>
      </Accordion.Header>

      <Accordion.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
        {isExpanded && (
          <div className="relative bg-bg-primary/40 px-3 py-3 md:px-5">
            <div
              className="pointer-events-none absolute left-8 top-3 bottom-3 w-0.5 rounded-full bg-border-primary/45"
              aria-hidden="true"
            />
            <div className="space-y-3 pl-6">
              {row.entries.map(({ entry, title }) => {
                const resolvedMetadata = metadataMap.get(entry.anilistId) ?? null;
                return (
                  <MappingEntryRow
                    key={entry.anilistId}
                    entry={entry}
                    title={title}
                    metadata={resolvedMetadata}
                    isMutating={isMutating}
                    onEdit={onEdit}
                    onDeleteOverride={onDeleteOverride}
                    onIgnore={onIgnore}
                    onClearIgnore={onClearIgnore}
                    providerUrl={providerUrl ?? null}
                  />
                );
              })}
            </div>
          </div>
        )}
      </Accordion.Content>
    </Accordion.Item>
  );
};
