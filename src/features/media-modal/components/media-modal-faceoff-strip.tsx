/** Renders the persistent source-versus-target identity strip above modal work panes. */
// src/features/media-modal/components/media-modal-faceoff-strip.tsx

import { ArrowRight, ExternalLink } from 'lucide-react';
import type { AniListMediaFormat } from '@/anilist/schemas/media.schema';
import type { MappingSearchResult } from '@/features/mapping/types';
import type { Provider } from '@/providers';
import { getProviderLabel } from '@/providers/provider-routing';
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

function SummaryCard(props: {
  provider: Provider;
  baseUrl: string;
  mapping: MappingSearchResult | null;
}): React.JSX.Element {
  const { provider, baseUrl, mapping } = props;
  const providerLabel = getProviderLabel(provider);

  if (!mapping) {
    return (
      <div className="min-w-0">
        <p className="text-[11px] leading-none font-semibold uppercase tracking-[0.16em] text-text-secondary">
          {`TARGET: ${providerLabel.toUpperCase()}`}
        </p>
        <div className="mt-3 flex items-start gap-3">
          <div className="h-18 w-13 shrink-0 rounded-xl border border-border-primary/45 bg-bg-primary/22" />
          <div className="min-w-0 pt-1">
            <p className="text-sm font-medium text-text-primary">No match selected</p>
            <p className="mt-1 text-xs leading-5 text-text-secondary">
              {`Search below to choose the ${providerLabel} target.`}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const externalLabel = `${mapping.provider === 'radarr' ? 'TMDB' : 'TVDB'} ${mapping.providerId}`;
  const metadataTokens = [
    externalLabel,
    mapping.year ? String(mapping.year) : null,
    mapping.inLibrary ? (mapping.typeLabel ?? null) : null,
  ].filter(Boolean);
  const link = buildExternalMediaLink({
    provider,
    baseUrl,
    inLibrary: mapping.inLibrary,
    ...(mapping.librarySlug ? { librarySlug: mapping.librarySlug } : {}),
    searchTerm: mapping.title,
  });

  return (
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
        <div className="h-18 w-13 shrink-0 overflow-hidden rounded-xl border border-border-primary/45 bg-bg-primary/18 shadow-[0_10px_24px_rgba(0,0,0,0.14)]">
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

          <p className="mt-2 text-xs text-text-secondary">
            {metadataTokens.join(' • ')}
          </p>

          {mapping.inLibrary ? (
            <p className="mt-1 text-xs text-success">
              {`In ${providerLabel}${mapping.fileCount ? ` - ${mapping.fileCount} eps` : ''}`}
            </p>
          ) : null}
        </div>
      </div>
    </div>
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

  return (
    <div className="mx-auto grid max-w-220 gap-4 lg:grid-cols-[minmax(0,1fr)_3.6rem_minmax(0,1fr)] lg:items-start lg:gap-3">
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
          <div className="h-18 w-13 shrink-0 overflow-hidden rounded-xl border border-border-primary/45 bg-bg-primary/18 shadow-[0_10px_24px_rgba(0,0,0,0.14)]">
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

            <p className="mt-2 text-xs text-text-secondary">
              {[formatLabel, sourceYear ? String(sourceYear) : null].filter(Boolean).join(' • ')}
            </p>
            <p className="mt-1 text-xs font-mono text-text-secondary">{`AniList ${sourceAniListId}`}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center self-center text-accent-primary/90">
        <ArrowRight className="h-4 w-4 lg:h-5 lg:w-5" />
      </div>

      <SummaryCard
        provider={provider}
        baseUrl={baseUrl}
        mapping={currentMapping}
      />
    </div>
  );
}
