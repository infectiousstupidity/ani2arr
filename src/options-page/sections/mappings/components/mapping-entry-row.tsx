/** Renders one AniList mapping entry row with inline provider and suppression actions. */
// src/options-page/sections/mappings/components/mapping-entry-row.tsx
/* eslint-disable complexity -- Existing row combines mapping status, provider status, and actions. */

import React from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { MoreHorizontal, Pencil, Trash2, Undo2 } from 'lucide-react';
import { buildAniListAnimeUrl } from '@/anilist/anilist-links';
import type { AniListMetadata } from '@/anilist/schemas/metadata.schema';
import {
  createProviderMappingTarget,
  type EffectiveMappingKind,
  type ProviderMappingTarget,
} from '@/mapping/types';
import type { MappingListRow } from '@/mapping/queries/list-mappings';
import Button from '@/shared/ui/primitives/button';
import Pill from '@/shared/ui/primitives/pill';
import { cn } from '@/shared/utils/cn';
import { buildProviderOpenUrl } from '@/providers/provider-links';
import {
  getProviderRouteSlug,
  type ProviderRouteSlugSource,
} from '@/providers/provider-route-slug';
import { useMovieStatus } from '@/providers/hooks/radarr.queries';
import { useSeriesStatus } from '@/queries/sonarr';

const entryKindStyles: Record<EffectiveMappingKind, { label: string; className: string }> = {
  manual: { label: 'Manual', className: 'bg-accent-primary/16 text-accent-primary border-accent-primary/30' },
  unmapped: { label: 'Unmapped', className: 'bg-warning/14 text-warning border-warning/24' },
  unknown: { label: 'Unknown', className: 'bg-bg-primary/46 text-text-secondary border-border-primary/70' },
  rejected: { label: 'Rejected', className: 'bg-warning/12 text-warning border-warning/20' },
  auto: { label: 'Auto', className: 'bg-success/14 text-success border-success/24' },
  upstream: { label: 'Upstream', className: 'bg-bg-primary/46 text-text-secondary border-border-primary/70' },
  ignored: { label: 'Ignored', className: 'bg-error/12 text-error border-error/24' },
};

const statusStyles: Record<MappingListRow['mappingRowStatus'], { label: string; className: string }> = {
  'needs-review': { label: 'Needs review', className: 'bg-warning/14 text-warning border-warning/24' },
  'in-library': { label: 'In library', className: 'bg-success/14 text-success border-success/24' },
  'can-add': { label: 'Can add', className: 'bg-accent-primary/16 text-accent-primary border-accent-primary/30' },
  suppressed: { label: 'Suppressed', className: 'bg-error/12 text-error border-error/24' },
  unmapped: { label: 'Unmapped', className: 'bg-warning/14 text-warning border-warning/24' },
  unknown: { label: 'Unknown', className: 'bg-bg-primary/46 text-text-secondary border-border-primary/70' },
};

const getExternalLink = (target: ProviderMappingTarget | null) => {
  if (target == null) return null;
  if (target.provider === 'sonarr') {
    return `https://thetvdb.com/dereferrer/series/${target.providerId}`;
  }
  return `https://www.themoviedb.org/movie/${target.providerId}`;
};

const MetaSeparator: React.FC = () => <span className="text-text-tertiary/70">·</span>;

const getEditTooltip = (entryKind: EffectiveMappingKind): string => {
  switch (entryKind) {
    case 'manual': {
      return 'Edit the manual mapping for this AniList entry. Saving keeps it as a manual mapping until you delete it.';
    }
    case 'ignored': {
      return 'Choose a mapping for this ignored AniList entry. Saving clears the ignore and creates a manual mapping.';
    }
    case 'rejected': {
      return 'Choose a manual mapping, or allow this rejected match again from the row actions.';
    }
    case 'unmapped': {
      return 'Set a mapping for this AniList entry. Saving creates a manual mapping.';
    }
    case 'unknown': {
      return 'Mapping status is unknown right now. Saving a manual mapping bypasses the failed lookup state.';
    }
    default: {
      return 'Change the current mapping for this AniList entry. Saving creates a manual mapping.';
    }
  }
};

export type MappingEntryRowProps = {
  entry: MappingListRow;
  title: string;
  metadata?: AniListMetadata | null | undefined;
  isMutating: boolean;
  onEdit: (entry: MappingListRow) => void;
  onDeleteManualMapping: (entry: MappingListRow) => void;
  onRejectCandidate: (entry: MappingListRow) => void;
  onClearRejectedCandidate: (entry: MappingListRow) => void;
  onIgnoreTitle: (entry: MappingListRow) => void;
  onClearIgnoreTitle: (entry: MappingListRow) => void;
  providerUrl?: string | null;
  hideSourceBadge?: boolean;
};

export const MappingEntryRow: React.FC<MappingEntryRowProps> = ({
  entry,
  title,
  metadata,
  isMutating,
  onEdit,
  onDeleteManualMapping,
  onRejectCandidate,
  onClearRejectedCandidate,
  onIgnoreTitle,
  onClearIgnoreTitle,
  providerUrl,
  hideSourceBadge = false,
}) => {
  const entryKind = entry.mappingEntryKind;
  const entryKindBadge = entryKindStyles[entryKind];
  const statusBadge = statusStyles[entry.mappingRowStatus];
  const actionableProviderId = entry.providerId ?? entry.suppressedProviderId ?? null;
  const actionableProviderTarget = actionableProviderId == null
    ? null
    : createProviderMappingTarget(entry.provider, actionableProviderId);

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
      { enabled: entry.provider === 'sonarr' && entry.providerId !== null, network: 'never' },
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
      { enabled: entry.provider === 'radarr' && entry.providerId !== null, network: 'never' },
  );

  const anilistCover = metadata?.coverImage?.large ?? metadata?.coverImage?.medium;
  const anilistYear = metadata?.seasonYear;
  const anilistFormat = metadata?.format;

  const formatLabel = anilistFormat ? anilistFormat.replaceAll('_', ' ') : null;
  const providerStatus = entry.providerMeta?.statusLabel ?? null;
  const metaParts = [formatLabel, anilistYear ? String(anilistYear) : null, providerStatus].filter(Boolean) as string[];

  const providerItem = entry.provider === 'radarr' ? radarrStatus.data?.movie : sonarrStatus.data?.series;
  const providerRouteSlug = getProviderRouteSlug(entry.provider, providerItem as ProviderRouteSlugSource | null);
  const providerLink = buildProviderOpenUrl({
    provider: entry.provider,
    baseUrl: providerUrl ?? '',
    isInLibrary: entry.isInLibrary === true && Boolean(providerRouteSlug),
    ...(providerRouteSlug ? { providerRouteSlug } : {}),
    searchTerm: title,
  });
  const externalLink = getExternalLink(actionableProviderTarget);

  const linkItems: Array<{ label: string; href: string; tooltip: string }> = [
    { label: 'AniList ↗', href: buildAniListAnimeUrl(entry.anilistId), tooltip: 'Open on AniList' },
    providerLink
      ? {
          label: entry.provider === 'sonarr' ? 'Sonarr ↗' : 'Radarr ↗',
          href: providerLink,
          tooltip: entry.provider === 'sonarr' ? 'Open in Sonarr' : 'Open in Radarr',
        }
      : null,
    externalLink && (entry.provider !== 'sonarr' || externalLink !== providerLink)
      ? {
          label: entry.provider === 'radarr' ? 'TMDB ↗' : 'TVDB ↗',
          href: externalLink,
          tooltip: entry.provider === 'radarr' ? 'Open on TMDB' : 'Open on TVDB',
        }
      : null,
  ].filter((link): link is { label: string; href: string; tooltip: string } => Boolean(link?.href));

  const editTooltip = getEditTooltip(entryKind);

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
      className: 'text-accent-primary/85 hover:bg-accent-primary/14 hover:text-accent-primary',
    },
    ...(() => {
      switch (entryKind) {
        case 'manual': {
          return [{
            key: 'delete-mapping',
            icon: Trash2,
            tooltip:
              'Delete the manual mapping. ani2arr will fall back to upstream or automatic matching if one exists; otherwise the title becomes unmapped.',
            ariaLabel: 'Delete mapping',
            onClick: () => onDeleteManualMapping(entry),
            className: 'text-error/85 hover:bg-error/14 hover:text-error',
          }];
        }
        case 'rejected': {
          return [{
            key: 'restore-rejected-candidate',
            icon: Undo2,
            tooltip: 'Allow this rejected match again. ani2arr can use this exact ID if it resolves to it later.',
            ariaLabel: 'Allow this match again',
            onClick: () => onClearRejectedCandidate(entry),
            className: 'text-text-secondary hover:bg-bg-primary/45 hover:text-accent-primary',
          }];
        }
        case 'ignored': {
          return [{
            key: 'restore-ignore',
            icon: Undo2,
            tooltip: 'Remove the persistent title ignore and allow ani2arr to use upstream or automatic matching again.',
            ariaLabel: 'Remove title ignore',
            onClick: () => onClearIgnoreTitle(entry),
            className: 'text-text-secondary hover:bg-bg-primary/45 hover:text-accent-primary',
          }];
        }
        default: {
          return [];
        }
      }
    })(),
  ];

  const menuActions: Array<{
    key: string;
    label: string;
    onSelect: () => void;
    className?: string;
  }> = [
    ...(() => {
      switch (entryKind) {
        case 'manual':
        case 'ignored': {
          return [];
        }
        case 'rejected': {
          return [
            {
              key: 'ignore-title',
              label: 'Ignore title entirely',
              onSelect: () => onIgnoreTitle(entry),
              className: 'text-warning focus:text-warning',
            },
          ];
        }
        default: {
          const candidateActions = actionableProviderId === null
            ? []
            : [
                {
                  key: 'reject-candidate',
                  label: 'Not this match',
                  onSelect: () => onRejectCandidate(entry),
                },
              ];
          return [
            ...candidateActions,
            {
              key: 'ignore-title',
              label: 'Ignore title entirely',
              onSelect: () => onIgnoreTitle(entry),
              className: 'text-warning focus:text-warning',
            },
          ];
        }
      }
    })(),
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
                      return;
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
          <div className="flex flex-wrap items-center gap-1.5 md:justify-center">
            <Pill
              small
              tone="default"
              className={cn(
                'justify-center border text-[10px] uppercase tracking-[0.08em] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
                statusBadge.className,
              )}
            >
              {statusBadge.label}
            </Pill>
            {hideSourceBadge ? null : (
              <Pill
                small
                tone="default"
                className={cn(
                  'justify-center border text-[10px] uppercase tracking-[0.08em] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
                  entryKindBadge.className,
                )}
              >
                {entryKindBadge.label}
              </Pill>
            )}
          </div>
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
