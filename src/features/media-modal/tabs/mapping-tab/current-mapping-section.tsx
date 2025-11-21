// src/features/media-modal/tabs/mapping-tab/current-mapping-section.tsx
import type { MappingSearchResult } from '@/shared/types';
import type { AniListEntrySummary } from './mapping-tab-layout';
import { MultiMappingInfo } from './multi-mapping-info';
import { buildExternalMediaLink } from '@/shared/utils/build-external-media-link';
import { ExternalLink } from 'lucide-react';

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

  const altTitleMatch = currentMapping?.alternateTitles?.find(t => 
    t.toLowerCase().includes(aniListEntry.title.toLowerCase()) || 
    aniListEntry.title.toLowerCase().includes(t.toLowerCase())
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* AniList Source Card */}
      <div className="flex items-start gap-3 p-3 rounded-md border border-border-primary bg-bg-tertiary h-32 overflow-hidden">
        {aniListEntry.posterUrl ? (
          <img src={aniListEntry.posterUrl} alt="AniList poster" className="w-20 h-full object-cover rounded shrink-0" />
        ) : (
          <div className="w-20 h-full bg-bg-primary rounded shrink-0" />
        )}
        <div className="flex flex-col min-w-0">
          <div className="text-xs text-text-secondary flex items-center gap-2 mb-1">
            <span className="font-mono">AniList {aniListEntry.id}</span>
            <MultiMappingInfo currentAniListId={aniListEntry.id} linkedAniListIds={otherAniListIds} />
          </div>
          <div className="text-base font-medium text-text-primary leading-tight line-clamp-2 mb-1" title={aniListEntry.title}>
            {aniListEntry.title}
          </div>
          {aniListEntry.seasonLabel && (
            <div className="text-xs text-text-secondary">{aniListEntry.seasonLabel}</div>
          )}
          <a 
            href={`https://anilist.co/anime/${aniListEntry.id}`} 
            target="_blank" 
            rel="noreferrer" 
            className="text-accent-primary hover:text-accent-hover text-xs mt-auto flex items-center gap-1"
          >
            View on AniList <ExternalLink size={10} />
          </a>
        </div>
      </div>

      {/* Sonarr/TVDB Target Card */}
      <div className="flex items-start gap-3 p-3 rounded-md border border-border-primary bg-bg-tertiary h-32 overflow-hidden relative">
        {currentMapping?.posterUrl ? (
          <img src={currentMapping.posterUrl} alt="TVDB poster" className="w-20 h-full object-cover rounded shrink-0" />
        ) : (
          <div className="w-20 h-full bg-bg-primary rounded shrink-0" />
        )}
        <div className="flex flex-col min-w-0 w-full h-full">
          {!currentMapping ? (
            <div className="text-sm text-text-secondary m-auto">No mapping yet</div>
          ) : (
            <>
               <div className="flex items-center gap-2 mb-1">
                  <div className="text-xs text-text-secondary font-mono">TVDB {currentMapping.target.id}</div>
                  {currentMapping.imdbId && (
                     <a 
                       href={`https://www.imdb.com/title/${currentMapping.imdbId}/`} 
                       target="_blank" 
                       rel="noreferrer"
                       className="text-xs text-[#f5c518] hover:underline"
                       title="Open IMDb"
                     >
                       IMDb {currentMapping.imdbId}
                     </a>
                  )}
               </div>

              <div className="text-base font-medium text-text-primary leading-tight line-clamp-1" title={currentMapping.title}>
                {currentMapping.title}
              </div>

              {altTitleMatch && (
                 <div className="text-[10px] text-text-secondary italic line-clamp-1">
                   aka {altTitleMatch}
                 </div>
              )}

              <div className="text-xs text-text-secondary mt-0.5">
                {currentMapping.year ? `${currentMapping.year}` : ''}
                {currentMapping.networkOrStudio ? ` • ${currentMapping.networkOrStudio}` : ''}
                {currentMapping.episodeOrMovieCount ? ` • ${currentMapping.episodeOrMovieCount} eps` : ''}
              </div>

              <div className="mt-auto flex items-center justify-between w-full">
                <div className="text-xs font-medium">
                  {currentMapping.inLibrary ? (
                     <span className="text-success flex items-center gap-1">
                       In Library {currentMapping.fileCount !== undefined ? `(${currentMapping.fileCount} downloaded)` : ''}
                     </span>
                  ) : (
                    <span className="text-text-secondary/70">Not in Library</span>
                  )}
                </div>
                
                {link && (
                  <a href={link} target="_blank" rel="noreferrer" className="text-accent-primary hover:text-accent-hover text-xs flex items-center gap-1">
                    Open in Sonarr <ExternalLink size={10} />
                  </a>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}