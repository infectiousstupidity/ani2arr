/** Renders linked AniList entries for the active mapping context pane. */
// src/features/mapping/mapping-linked-entries.tsx

import { ExternalLink } from 'lucide-react';
import { resolveTitlePreference } from '@/anilist/title-preference';
import type { MappingInspectionLinkedAniListEntry } from '@/mapping/inspection/inspection-types';
import { useAniListMetadataBatch } from '@/shared/queries';
import type { AniListMetadata } from '@/anilist/schemas/metadata.schema';
import { formatToken } from './mapping-inspection-pane';

interface MappingLinkedEntriesProps {
  currentAniListId: number;
  linkedAniListIds: readonly number[];
  entries?: readonly MappingInspectionLinkedAniListEntry[];
  className?: string;
}

type LinkedEntryRow = {
  anilistId: number;
  title: string;
  format?: string | null;
  year?: number | null;
  posterUrl?: string | null;
};

function titleFromMetadata(metadata: AniListMetadata | undefined, fallback?: string): string {
  if (metadata?.titles) {
    return resolveTitlePreference({ titles: metadata.titles }).primary;
  }

  return fallback ?? 'Unknown AniList entry';
}

export function MappingLinkedEntries(props: MappingLinkedEntriesProps): React.JSX.Element | null {
  const { currentAniListId, linkedAniListIds, entries = [], className } = props;
  const otherLinkedIds = [...new Set(linkedAniListIds.filter((id) => id !== currentAniListId))];
  const metadataQuery = useAniListMetadataBatch(otherLinkedIds, {
    enabled: otherLinkedIds.length > 0,
    refreshStale: false,
  });

  if (otherLinkedIds.length === 0) {
    return null;
  }

  const metadataById = new Map((metadataQuery.data?.metadata ?? []).map((item) => [item.id, item]));
  const entryById = new Map(entries.map((entry) => [entry.anilistId, entry]));
  const rows: LinkedEntryRow[] = otherLinkedIds.map((anilistId) => {
    const entry = entryById.get(anilistId);
    const metadata = metadataById.get(anilistId);

    return {
      anilistId,
      title: titleFromMetadata(metadata, entry?.title ?? `AniList #${anilistId}`),
      format: metadata?.format ?? entry?.format ?? null,
      year: metadata?.seasonYear ?? entry?.year ?? null,
      posterUrl: metadata?.coverImage?.medium ?? metadata?.coverImage?.large ?? null,
    };
  });

  return (
    <section className={className ?? 'space-y-2'}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
        {`Also linked AniList entr${rows.length === 1 ? 'y' : 'ies'}`}
      </p>
      <div className="min-h-0 overflow-y-auto rounded-xl border border-border-primary/50 bg-bg-primary/18 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
        <div className="divide-y divide-border-primary/50">
          {rows.map((row) => (
            <a
              key={row.anilistId}
              href={`https://anilist.co/anime/${row.anilistId}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 px-3 py-3 transition-colors hover:bg-bg-primary/35"
            >
              <div className="h-12 w-9 shrink-0 overflow-hidden rounded-md bg-bg-primary/65">
                {row.posterUrl ? (
                  <img src={row.posterUrl} alt="" className="h-full w-full object-cover" />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-text-primary">{row.title}</div>
                <div className="mt-0.5 text-xs text-text-secondary">
                  {row.format ? formatToken(row.format) : 'Unknown format'}
                  {row.year ? ` • ${row.year}` : ''}
                </div>
              </div>
              <ExternalLink className="h-4 w-4 shrink-0 text-text-secondary" />
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
