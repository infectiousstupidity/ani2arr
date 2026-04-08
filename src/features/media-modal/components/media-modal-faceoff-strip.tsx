/** Renders the persistent source-versus-target identity strip above modal work panes. */
// src/features/media-modal/components/media-modal-faceoff-strip.tsx

import type { ReactNode } from 'react';
import { ArrowRight, ExternalLink } from 'lucide-react';
import type { AniListMediaFormat } from '@/anilist/schemas/media.schema';
import type { MappingSearchResult } from '@/features/mapping/types';
import type { Provider } from '@/providers';
import { getProviderLabel } from '@/providers/provider-routing';
import { cn } from '@/shared/utils/cn';
import { buildExternalMediaLink } from '@/shared/utils/provider-links';

interface MediaModalFaceoffStripProps {
  sourceTitle: string;
  sourceCoverImage: string | null;
  sourceFormat: AniListMediaFormat | null;
  sourceYear: number | null;
  sourceAniListId: number;
  provider: Provider;
  baseUrl: string;
  currentMapping: MappingSearchResult | null;
}

function formatMediaFormat(format: AniListMediaFormat | null): string | null {
  return format ? format.replaceAll('_', ' ') : null;
}

function toTitleCaseLabel(value: string): string {
  return value
    .replaceAll('_', ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatTargetTypeLabel(typeLabel: string | undefined): string | null {
  if (!typeLabel) {
    return null;
  }

  const normalized = typeLabel.trim().toLowerCase();
  if (normalized === 'anime' || normalized === 'standard' || normalized === 'daily') {
    return 'TV';
  }

  return toTitleCaseLabel(typeLabel);
}

function joinMetadataLine(parts: Array<string | null | undefined>): string | null {
  const tokens: string[] = [];

  for (const part of parts) {
    if (part) {
      tokens.push(part);
    }
  }

  return tokens.length > 0 ? tokens.join(' · ') : null;
}

function FaceoffSideShell(props: {
  align: 'left' | 'right';
  children: ReactNode;
}): React.JSX.Element {
  const { align, children } = props;

  return (
    <div className="relative isolate min-w-0">
      <div className="pointer-events-none absolute inset-x-[-0.9rem] -top-4 bottom-0 -z-10 rounded-4xl bg-linear-to-b from-bg-primary/44 via-bg-primary/16 to-transparent" />
      <div
        className={cn(
          'pointer-events-none absolute -top-5 bottom-8 -z-10 rounded-full bg-bg-primary/24 blur-2xl',
          align === 'left' ? '-left-4 right-14' : 'left-14 -right-4',
        )}
      />
      <div className="relative px-1.5 pt-1.5 pb-2">{children}</div>
    </div>
  );
}

function SummaryCard(props: {
  provider: Provider;
  baseUrl: string;
  mapping: MappingSearchResult | null;
}): React.JSX.Element {
  const { provider, baseUrl, mapping } = props;
  const providerLabel = getProviderLabel(provider);

  if (!mapping) {
    return (
      <FaceoffSideShell align="right">
        <div className="min-w-0">
          <p className="text-[11px] leading-none font-semibold uppercase tracking-[0.16em] text-text-secondary">
            {`TARGET: ${providerLabel.toUpperCase()}`}
          </p>
          <div className="mt-3 flex items-start gap-3">
            <div className="h-24 w-16 shrink-0 rounded-xl border border-border-primary/45 bg-bg-primary/22" />
            <div className="min-w-0 pt-1">
              <p className="text-sm font-medium text-text-primary">No match selected</p>
              <p className="mt-1 text-xs leading-5 text-text-secondary">
                {`Search below to choose the ${providerLabel} target.`}
              </p>
            </div>
          </div>
        </div>
      </FaceoffSideShell>
    );
  }

  const primaryMetadata = joinMetadataLine([
    formatTargetTypeLabel(mapping.typeLabel),
    mapping.year ? String(mapping.year) : null,
  ]);
  const secondaryMetadata = joinMetadataLine([
    mapping.provider === 'radarr' ? 'TMDB' : 'TVDB',
    String(mapping.providerId),
  ]);
  const link = buildExternalMediaLink({
    provider,
    baseUrl,
    inLibrary: mapping.inLibrary,
    ...(mapping.librarySlug ? { librarySlug: mapping.librarySlug } : {}),
    searchTerm: mapping.title,
  });

  return (
    <FaceoffSideShell align="right">
      <div className="relative min-w-0">
        <p className="pr-10 text-[11px] leading-none font-semibold uppercase tracking-[0.16em] text-text-secondary">
          {`TARGET: ${providerLabel.toUpperCase()}`}
        </p>
        {link ? (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="absolute right-0 top-0 inline-flex h-8 w-8 items-start justify-center pt-px rounded-full text-text-secondary transition-colors hover:bg-bg-primary/25 hover:text-text-primary"
            aria-label={`Open in ${providerLabel}`}
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        ) : null}

        <div className="mt-3 flex items-start gap-3">
          <div className="h-24 w-16 shrink-0 overflow-hidden rounded-xl border border-border-primary/45 bg-bg-primary/18 shadow-[0_10px_24px_rgba(0,0,0,0.14)]">
            {mapping.posterUrl ? (
              <img src={mapping.posterUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full bg-bg-primary/60" />
            )}
          </div>

          <div className="min-w-0 flex-1 pt-1">
            <h2 className="line-clamp-2 text-lg font-semibold leading-tight text-text-primary drop-shadow-[0_1px_8px_rgba(0,0,0,0.35)]">
              {mapping.title}
            </h2>

            {primaryMetadata ? (
              <p className="mt-2 text-xs text-text-secondary">
                {primaryMetadata}
              </p>
            ) : null}
            {secondaryMetadata ? (
              <p className="mt-1 text-xs text-text-secondary">{secondaryMetadata}</p>
            ) : null}
          </div>
        </div>
      </div>
    </FaceoffSideShell>
  );
}

export function MediaModalFaceoffStrip(props: MediaModalFaceoffStripProps): React.JSX.Element {
  const {
    sourceTitle,
    sourceCoverImage,
    sourceFormat,
    sourceYear,
    sourceAniListId,
    provider,
    baseUrl,
    currentMapping,
  } = props;
  const formatLabel = formatMediaFormat(sourceFormat);
  const sourceLink = `https://anilist.co/anime/${sourceAniListId}`;
  const sourcePrimaryMetadata = joinMetadataLine([formatLabel, sourceYear ? String(sourceYear) : null]);
  const sourceSecondaryMetadata = joinMetadataLine(['AniList', String(sourceAniListId)]);

  return (
    <div className="mx-auto grid max-w-220 gap-5 lg:grid-cols-[minmax(0,1fr)_4.75rem_minmax(0,1fr)] lg:items-start lg:gap-4">
      <FaceoffSideShell align="left">
        <div className="relative min-w-0">
          <p className="pr-10 text-[11px] leading-none font-semibold uppercase tracking-[0.16em] text-text-secondary">
            SOURCE: ANILIST
          </p>
          <a
            href={sourceLink}
            target="_blank"
            rel="noreferrer"
            className="absolute right-0 top-0 inline-flex h-8 w-8 items-start justify-center pt-px rounded-full text-text-secondary transition-colors hover:bg-bg-primary/25 hover:text-text-primary"
            aria-label="Open in AniList"
          >
            <ExternalLink className="h-4 w-4" />
          </a>

          <div className="mt-3 flex items-start gap-3">
            <div className="h-24 w-16 shrink-0 overflow-hidden rounded-xl border border-border-primary/45 bg-bg-primary/18 shadow-[0_10px_24px_rgba(0,0,0,0.14)]">
              {sourceCoverImage ? (
                <img src={sourceCoverImage} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-bg-primary/60" />
              )}
            </div>

            <div className="min-w-0 flex-1 pt-1">
              <h2 className="line-clamp-2 text-lg font-semibold leading-tight text-text-primary drop-shadow-[0_1px_8px_rgba(0,0,0,0.35)]">
                {sourceTitle}
              </h2>

              {sourcePrimaryMetadata ? (
                <p className="mt-2 text-xs text-text-secondary">
                  {sourcePrimaryMetadata}
                </p>
              ) : null}
              {sourceSecondaryMetadata ? (
                <p className="mt-1 text-xs text-text-secondary">{sourceSecondaryMetadata}</p>
              ) : null}
            </div>
          </div>
        </div>
      </FaceoffSideShell>

      <div className="relative flex items-center justify-center self-center lg:self-stretch">
        <div className="pointer-events-none absolute left-1/2 top-1/2 hidden h-px w-16 -translate-x-1/2 -translate-y-1/2 bg-linear-to-r from-transparent via-accent-primary/45 to-transparent lg:block" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 hidden h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-primary/10 blur-2xl lg:block" />
        <div className="relative inline-flex h-8 w-8 items-center justify-center rounded-full bg-bg-primary/22 text-accent-primary shadow-[0_8px_24px_rgba(11,22,34,0.22)] backdrop-blur-[2px] lg:h-9 lg:w-9">
          <ArrowRight className="h-4 w-4 lg:h-5 lg:w-5" />
        </div>
      </div>

      <SummaryCard
        provider={provider}
        baseUrl={baseUrl}
        mapping={currentMapping}
      />
    </div>
  );
}
