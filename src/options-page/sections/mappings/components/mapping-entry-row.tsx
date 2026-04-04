/** Renders one AniList mapping entry row with inline provider and suppression actions. */
// src/options-page/sections/mappings/components/mapping-entry-row.tsx

import React from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Ban, MoreHorizontal, Pencil, Trash2, Undo2 } from 'lucide-react';
import type { AniListMetadata } from '@/anilist/schemas/metadata.schema';
import type { Provider } from '@/providers';
import type { MappingExternalId, MappingSummary } from '@/services/mapping/types';
import Button from '@/shared/ui/primitives/button';
import Pill from '@/shared/ui/primitives/pill';
import { cn } from '@/shared/utils/cn';
import { buildExternalMediaLink } from '@/shared/utils/provider-links';
import {
  getProviderLibrarySlug,
  type ProviderMediaPathSource,
} from '@/providers/library/paths';
import { useMovieStatus } from '@/providers/hooks/radarr.queries';
import { useSeriesStatus } from '@/providers/hooks/sonarr.queries';

const sourceStyles: Record<MappingSummary['source'], { label: string; className: string }> = {
  manual: { label: 'Manual', className: 'bg-accent-primary/16 text-accent-primary border-accent-primary/30' },
  unresolved: { label: 'Unresolved', className: 'bg-warning/14 text-warning border-warning/24' },
  rejected: { label: 'Rejected', className: 'bg-warning/12 text-warning border-warning/20' },
  blocked: { label: 'Blocked', className: 'bg-error/16 text-error border-error/28' },
  auto: { label: 'Auto', className: 'bg-success/14 text-success border-success/24' },
  upstream: { label: 'Upstream', className: 'bg-bg-primary/46 text-text-secondary border-border-primary/70' },
  ignored: { label: 'Ignored', className: 'bg-error/12 text-error border-error/24' },
};

const getExternalLink = (provider: Provider, externalId: MappingExternalId | null) => {
  if (!externalId) return null;
  if (externalId.kind === 'tvdb') {
    return `https://thetvdb.com/dereferrer/series/${externalId.id}`;
  }
  const tmdbType = provider === 'sonarr' ? 'tv' : 'movie';
  return `https://www.themoviedb.org/${tmdbType}/${externalId.id}`;
};

const MetaSeparator: React.FC = () => <span className="text-text-tertiary/70">·</span>;

const getEditTooltip = (source: MappingSummary['source']): string => {
  switch (source) {
    case 'manual': {
      return 'Edit the manual mapping for this AniList entry. Saving keeps it as a manual override until you delete it.';
    }
    case 'ignored': {
      return 'Choose a mapping for this ignored AniList entry. Saving clears the ignore and creates a manual mapping.';
    }
    case 'rejected': {
      return 'Choose a manual mapping, or allow this rejected match again from the row actions.';
    }
    case 'blocked': {
      return 'Choose a manual mapping, or remove the permanent block for this exact ID from the row actions.';
    }
    case 'unresolved': {
      return 'Set a mapping for this AniList entry. Saving creates a manual mapping.';
    }
    default: {
      return 'Change the current mapping for this AniList entry. Saving creates a manual mapping.';
    }
  }
};

export type MappingEntryRowProps = {
  entry: MappingSummary;
  title: string;
  metadata?: AniListMetadata | null | undefined;
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

export const MappingEntryRow: React.FC<MappingEntryRowProps> = ({
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

  const formatLabel = anilistFormat ? anilistFormat.replaceAll('_', ' ') : null;
  const providerStatus = entry.providerMeta?.statusLabel ?? null;
  const metaParts = [formatLabel, anilistYear ? String(anilistYear) : null, providerStatus].filter(Boolean) as string[];

  const providerItem = entry.provider === 'radarr' ? radarrStatus.data?.movie : sonarrStatus.data?.series;
  const providerSlug = getProviderLibrarySlug(entry.provider, providerItem as ProviderMediaPathSource | null);
  const providerLink = buildExternalMediaLink({
    provider: entry.provider,
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

  const editTooltip = getEditTooltip(entry.source);

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
      switch (entry.source) {
        case 'manual': {
          return [{
            key: 'delete-mapping',
            icon: Trash2,
            tooltip:
              'Delete the manual mapping. ani2arr will fall back to upstream or automatic matching if one exists; otherwise the title becomes unresolved.',
            ariaLabel: 'Delete mapping',
            onClick: () => onDeleteOverride(entry),
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
        case 'blocked': {
          return [{
            key: 'restore-blocked-candidate',
            icon: Ban,
            tooltip: 'Remove the permanent block for this exact ID and allow ani2arr to use it again.',
            ariaLabel: 'Allow this ID again',
            onClick: () => onClearBlockedCandidate(entry),
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
      switch (entry.source) {
        case 'manual':
        case 'ignored': {
          return [];
        }
        case 'rejected': {
          return [
            ...(actionableExternalId
              ? [{
                  key: 'block-candidate',
                  label: 'Never use this ID',
                  onSelect: () => onBlockCandidate(entry),
                  className: 'text-error focus:text-error',
                }]
              : []),
            {
              key: 'ignore-title',
              label: 'Ignore title entirely',
              onSelect: () => onIgnoreTitle(entry),
              className: 'text-warning focus:text-warning',
            },
          ];
        }
        case 'blocked': {
          return [{
            key: 'ignore-title',
            label: 'Ignore title entirely',
            onSelect: () => onIgnoreTitle(entry),
            className: 'text-warning focus:text-warning',
          }];
        }
        default: {
          return [
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
          {hideSourceBadge ? (
            <span className="hidden h-6 w-26 md:block" aria-hidden="true" />
          ) : (
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
