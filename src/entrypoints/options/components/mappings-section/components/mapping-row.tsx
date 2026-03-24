import React, { useMemo } from 'react';
import * as Accordion from '@radix-ui/react-accordion';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Ban, ChevronDown, MoreHorizontal, Pencil, Trash2, Undo2 } from 'lucide-react';
import type {
  MappingExternalId,
  MappingProvider,
  MappingSource,
  MappingSummary,
} from '@/shared/types';
import type { AniListMetadataDto } from '@/lib/rpc/schemas';
import { useAniListMetadataBatch, useMovieStatus, useSeriesStatus } from '@/shared/queries';
import Button from '@/shared/ui/primitives/button';
import Pill from '@/shared/ui/primitives/pill';
import { cn } from '@/shared/utils/cn';
import { buildExternalMediaLink } from '@/shared/utils/build-external-media-link';
import SonarrIcon from '@/assets/sonarr.svg';
import RadarrIcon from '@/assets/radarr.svg';
import { getLibrarySlug, type FolderSlugSource } from '@/services/helpers/path-utils';

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

const MetaSeparator: React.FC = () => <span className="text-text-tertiary/70">·</span>;

const resolveAniListTitle = (
  metadata: AniListMetadataDto | null | undefined,
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

type MappingEntryRowProps = {
  entry: MappingSummary;
  title: string;
  metadata?: AniListMetadataDto | null | undefined;
  isMutating: boolean;
  onEdit: (entry: MappingSummary) => void;
  onDeleteOverride: (entry: MappingSummary) => void;
  onRejectCandidate: (entry: MappingSummary) => void;
  onClearRejectedCandidate: (entry: MappingSummary) => void;
  onBlockCandidate: (entry: MappingSummary) => void;
  onClearBlockedCandidate: (entry: MappingSummary) => void;
  onIgnoreTitle: (entry: MappingSummary) => void;
  onClearIgnoreTitle: (entry: MappingSummary) => void;
  providerUrl?: string | null;
  hideSourceBadge?: boolean;
};

const MappingEntryRow: React.FC<MappingEntryRowProps> = ({
  entry,
  title,
  metadata,
  isMutating,
  onEdit,
  onDeleteOverride,
  onRejectCandidate,
  onClearRejectedCandidate,
  onBlockCandidate,
  onClearBlockedCandidate,
  onIgnoreTitle,
  onClearIgnoreTitle,
  providerUrl,
  hideSourceBadge = false,
}) => {
  const sourceBadge = sourceStyles[entry.source];
  const actionableExternalId = entry.externalId ?? entry.suppressedExternalId ?? null;

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

  const radarrStatus = useMovieStatus(
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
    { enabled: entry.provider === 'radarr' && !!entry.externalId, network: 'never' },
  );

  const anilistCover = metadata?.coverImage?.large ?? metadata?.coverImage?.medium;
  const anilistYear = metadata?.seasonYear;
  const anilistFormat = metadata?.format;

  const formatLabel = anilistFormat ? anilistFormat.replace(/_/g, ' ') : null;
  const providerStatus = entry.providerMeta?.statusLabel ?? null;
  const metaParts = [formatLabel, anilistYear ? String(anilistYear) : null, providerStatus].filter(Boolean) as string[];

  const providerItem = entry.provider === 'radarr' ? radarrStatus.data?.movie : sonarrStatus.data?.series;
  const providerSlug = getLibrarySlug(entry.provider, providerItem as FolderSlugSource | null);
  const providerLink = buildExternalMediaLink({
    service: entry.provider,
    baseUrl: providerUrl ?? '',
    inLibrary: Boolean(providerSlug),
    ...(providerSlug ? { librarySlug: providerSlug } : {}),
    searchTerm: title,
  });
  const externalLink = getExternalLink(entry.provider, actionableExternalId);

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
          label: actionableExternalId?.kind === 'tmdb' ? 'TMDB ↗' : 'TVDB ↗',
          href: externalLink,
          tooltip: actionableExternalId?.kind === 'tmdb' ? 'Open on TMDB' : 'Open on TVDB',
        }
      : null,
  ].filter((link): link is { label: string; href: string; tooltip: string } => Boolean(link?.href));

  const editTooltip =
    entry.source === 'manual'
      ? 'Edit the manual mapping for this AniList entry. Saving keeps it as a manual override until you delete it.'
      : entry.source === 'ignored'
        ? 'Choose a mapping for this ignored AniList entry. Saving clears the ignore and creates a manual mapping.'
        : entry.source === 'rejected'
          ? 'Choose a manual mapping, or allow this rejected match again from the row actions.'
          : entry.source === 'blocked'
            ? 'Choose a manual mapping, or remove the permanent block for this exact ID from the row actions.'
        : entry.source === 'unresolved'
          ? 'Set a mapping for this AniList entry. Saving creates a manual mapping.'
          : 'Change the current mapping for this AniList entry. Saving creates a manual mapping.';

  const primaryActions: Array<{
    key: string;
    icon: typeof Pencil;
    tooltip: string;
    ariaLabel: string;
    onClick: () => void;
    className: string;
  }> = [
    {
      key: 'edit',
      icon: Pencil,
      tooltip: editTooltip,
      ariaLabel: 'Edit mapping',
      onClick: () => onEdit(entry),
      className:
        'text-accent-primary/85 hover:bg-accent-primary/14 hover:text-accent-primary',
    },
    ...(entry.source === 'manual'
      ? [
          {
            key: 'delete-mapping',
            icon: Trash2,
            tooltip:
              'Delete the manual mapping. ani2arr will fall back to upstream or automatic matching if one exists; otherwise the title becomes unresolved.',
            ariaLabel: 'Delete mapping',
            onClick: () => onDeleteOverride(entry),
            className:
              'text-error/85 hover:bg-error/14 hover:text-error',
          },
        ]
      : entry.source === 'rejected'
        ? [
            {
              key: 'restore-rejected-candidate',
              icon: Undo2,
              tooltip:
                'Allow this rejected match again. ani2arr can use this exact ID if it resolves to it later.',
              ariaLabel: 'Allow this match again',
              onClick: () => onClearRejectedCandidate(entry),
              className:
                'text-text-secondary hover:bg-bg-primary/45 hover:text-accent-primary',
            },
          ]
        : entry.source === 'blocked'
          ? [
              {
                key: 'restore-blocked-candidate',
                icon: Ban,
                tooltip:
                  'Remove the permanent block for this exact ID and allow ani2arr to use it again.',
                ariaLabel: 'Allow this ID again',
                onClick: () => onClearBlockedCandidate(entry),
                className:
                  'text-text-secondary hover:bg-bg-primary/45 hover:text-accent-primary',
              },
            ]
          : entry.source === 'ignored'
            ? [
                {
                  key: 'restore-ignore',
                  icon: Undo2,
                  tooltip:
                    'Remove the persistent title ignore and allow ani2arr to use upstream or automatic matching again.',
                  ariaLabel: 'Remove title ignore',
                  onClick: () => onClearIgnoreTitle(entry),
                  className:
                  'text-text-secondary hover:bg-bg-primary/45 hover:text-accent-primary',
                },
              ]
            : []),
  ];

  const menuActions: Array<{
    key: string;
    label: string;
    onSelect: () => void;
    className?: string;
  }> = [
    ...(entry.source === 'manual'
      ? []
      : entry.source === 'rejected'
        ? [
            ...(actionableExternalId
              ? [
                  {
                    key: 'block-candidate',
                    label: 'Never use this ID',
                    onSelect: () => onBlockCandidate(entry),
                    className: 'text-error focus:text-error',
                  },
                ]
              : []),
            {
              key: 'ignore-title',
              label: 'Ignore title entirely',
              onSelect: () => onIgnoreTitle(entry),
              className: 'text-warning focus:text-warning',
            },
          ]
        : entry.source === 'blocked'
          ? [
              {
                key: 'ignore-title',
                label: 'Ignore title entirely',
                onSelect: () => onIgnoreTitle(entry),
                className: 'text-warning focus:text-warning',
              },
            ]
          : entry.source === 'ignored'
            ? []
            : [
                ...(actionableExternalId
                  ? [
                      {
                        key: 'reject-candidate',
                        label: 'Not this match',
                        onSelect: () => onRejectCandidate(entry),
                      },
                      {
                        key: 'block-candidate',
                        label: 'Never use this ID',
                        onSelect: () => onBlockCandidate(entry),
                        className: 'text-error focus:text-error',
                      },
                    ]
                  : []),
                {
                  key: 'ignore-title',
                  label: 'Ignore title entirely',
                  onSelect: () => onIgnoreTitle(entry),
                  className: 'text-warning focus:text-warning',
                },
              ]),
  ];

  return (
    <div className="rounded-2xl border border-border-primary/55 bg-bg-secondary/42 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] transition-colors hover:border-border-primary/80 hover:bg-bg-secondary/52">
      <div className="grid gap-4 p-4 md:grid-cols-[56px_minmax(0,1fr)_104px_auto] md:items-center">
        <div className="h-20 w-14 shrink-0 overflow-hidden rounded-xl border border-border-primary/55 bg-bg-primary/80">
          {anilistCover ? (
            <img
              src={anilistCover}
              alt={title}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-linear-to-br from-bg-tertiary to-bg-primary text-text-tertiary">
              <span className="text-[10px] font-medium">No image</span>
            </div>
          )}
        </div>

        <div className="min-w-0">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-text-primary" title={title}>
              {title}
            </div>

            {metaParts.length > 0 ? (
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-text-secondary">
                {metaParts.map((part, idx) => (
                  <React.Fragment key={`${part}-${idx}`}>
                    {idx > 0 ? <MetaSeparator /> : null}
                    <span className="whitespace-nowrap">{part}</span>
                  </React.Fragment>
                ))}
              </div>
            ) : null}
          </div>

          {linkItems.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {linkItems.map((link) => (
                <Button
                  key={link.label}
                  size="sm"
                  variant="ghost"
                  className="h-7 rounded-lg border border-border-primary/55 bg-bg-primary/25 px-2.5 text-[11px] text-text-secondary hover:border-border-primary/85 hover:bg-bg-primary/40 hover:text-text-primary"
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
          ) : null}
        </div>

        <div className="flex w-full items-center justify-start md:w-26 md:justify-self-center md:justify-center">
          {!hideSourceBadge ? (
            <Pill
              small
              tone="default"
              className={cn(
                'justify-center border text-[10px] uppercase tracking-[0.08em] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
                sourceBadge.className,
              )}
            >
              {sourceBadge.label}
            </Pill>
          ) : (
            <span className="hidden h-6 w-26 md:block" aria-hidden="true" />
          )}
        </div>

        <div className="col-span-full flex items-center justify-end gap-1 md:col-span-1 md:col-start-auto">
          {primaryActions.map((action) => {
            const ActionIcon = action.icon;
            return (
              <Button
                key={action.key}
                size="icon"
                variant="ghost"
                onClick={action.onClick}
                disabled={isMutating}
                tooltip={action.tooltip}
                aria-label={action.ariaLabel}
                className={cn(
                  'h-8 w-8 rounded-lg text-text-secondary hover:text-text-primary',
                  action.className,
                )}
              >
                <ActionIcon className="h-4 w-4" />
              </Button>
            );
          })}
          {menuActions.length > 0 ? (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={isMutating}
                  tooltip="More mapping actions"
                  aria-label="More mapping actions"
                  className="h-8 w-8 rounded-lg text-text-secondary hover:bg-bg-primary/40 hover:text-text-primary"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={6}
                  className="z-50 min-w-46 rounded-xl border border-border-primary/85 bg-bg-secondary p-1.5 shadow-xl"
                >
                  {menuActions.map((action) => (
                    <DropdownMenu.Item
                      key={action.key}
                      onSelect={action.onSelect}
                      className={cn(
                        'flex cursor-pointer items-center rounded-lg px-3 py-2 text-sm text-text-secondary outline-none transition-colors hover:bg-bg-tertiary/90 focus:bg-bg-tertiary/90 focus:text-text-primary',
                        action.className,
                      )}
                    >
                      {action.label}
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          ) : null}
        </div>
      </div>
    </div>
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
  const firstEntryMetadata = firstEntry ? metadataMap.get(firstEntry.entry.anilistId) ?? firstEntry.metadata ?? null : null;
  const uniqueSources = Array.from(new Set(row.sources));
  const prefersAniListTitle = !row.externalId;
  const preferredProviderTitle = prefersAniListTitle ? null : row.providerMeta?.title;
  const targetTitle =
    preferredProviderTitle ??
    (firstEntry ? resolveAniListTitle(firstEntryMetadata, firstEntry.title) : null) ??
    row.providerMeta?.title ??
    (row.externalId ? `${row.externalId.kind.toUpperCase()} #${row.externalId.id}` : 'Unmapped');
  const externalIdLabel = row.externalId
    ? `${row.externalId.kind.toUpperCase()} #${row.externalId.id}`
    : null;
  const updatedLabel = row.updatedAt ? formatRelativeTime(row.updatedAt) : null;
  const providerIcon = row.provider === 'sonarr' ? SonarrIcon : RadarrIcon;
  const providerLabel = row.provider === 'sonarr' ? 'Sonarr' : 'Radarr';
  const inLibraryCount = row.entries.filter((e) => e.entry.status === 'in-provider').length;
  const hasMapping = Boolean(row.externalId);
  const linkedLabel = !hasMapping
    ? uniqueSources.includes('rejected')
      ? 'Rejected candidate'
      : uniqueSources.includes('blocked')
        ? 'Blocked candidate'
        : uniqueSources.includes('ignored')
          ? 'Title ignored'
          : uniqueSources.includes('unresolved')
            ? 'Unresolved attempt'
            : 'No target linked'
    : inLibraryCount > 0
      ? `${row.entries.length} linked · ${inLibraryCount} in library`
      : `${row.entries.length} linked`;
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
