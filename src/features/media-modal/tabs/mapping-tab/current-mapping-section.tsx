import type { MappingSearchResult } from '@/shared/types';
import type { AniListEntrySummary } from './mapping-tab-layout';
import { MultiMappingInfo } from './multi-mapping-info';
import { buildExternalMediaLink } from '@/shared/utils/build-external-media-link';

interface CurrentMappingSectionProps {
  aniListEntry: AniListEntrySummary;
  currentMapping: MappingSearchResult | null;
  otherAniListIds: number[];
  baseUrl: string;
}

export function CurrentMappingSection(props: CurrentMappingSectionProps) {
  const { aniListEntry, currentMapping, otherAniListIds, baseUrl } = props;
  const link = currentMapping
    ? buildExternalMediaLink({
        service: 'sonarr',
        baseUrl,
        inLibrary: currentMapping.inLibrary,
        searchTerm: currentMapping.title,
        ...(currentMapping.librarySlug && { librarySlug: currentMapping.librarySlug }),

      })
    : undefined;

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="flex items-center gap-3 p-3 rounded-md border border-gray-300 bg-white">
        {aniListEntry.posterUrl ? (
          <img src={aniListEntry.posterUrl} alt="AniList poster" className="w-14 h-20 object-cover rounded" />
        ) : (
          <div className="w-14 h-20 bg-gray-200 rounded" />
        )}
        <div className="flex flex-col">
          <div className="text-sm text-gray-500 flex items-center gap-2">
            <span>AniList {aniListEntry.id}</span>
            <MultiMappingInfo currentAniListId={aniListEntry.id} linkedAniListIds={otherAniListIds} />
          </div>
          <div className="text-base font-medium">{aniListEntry.title}</div>
          {aniListEntry.seasonLabel && (
            <div className="text-sm text-gray-500">{aniListEntry.seasonLabel}</div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 p-3 rounded-md border border-gray-300 bg-white">
        {currentMapping?.posterUrl ? (
          <img src={currentMapping.posterUrl} alt="TVDB poster" className="w-14 h-20 object-cover rounded" />
        ) : (
          <div className="w-14 h-20 bg-gray-200 rounded" />
        )}
        <div className="flex flex-col">
          {!currentMapping ? (
            <div className="text-sm text-gray-500">No mapping yet</div>
          ) : (
            <>
              <div className="text-sm text-gray-500">TVDB {String(currentMapping.target.id)}</div>
              <div className="text-base font-medium">{currentMapping.title}</div>
              <div className="text-sm text-gray-500">
                {currentMapping.year ? `${currentMapping.year} • ` : ''}
                {currentMapping.typeLabel ?? ''}
              </div>
              <div className="text-sm text-gray-600">
                {currentMapping.inLibrary ? 'In Sonarr' : 'Not in Sonarr'}
              </div>
              {link && (
                <a href={link} target="_blank" rel="noreferrer" className="text-blue-600 text-sm mt-1">
                  Open in Sonarr
                </a>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
