// src/features/media-modal/tabs/mapping-tab/selected-result-preview.tsx
import type { MappingSearchResult } from '@/shared/types';
import { buildExternalMediaLink } from '@/shared/utils/build-external-media-link';
import { ExternalLink } from 'lucide-react';

interface SelectedResultPreviewProps {
  selected: MappingSearchResult | null;
  baseUrl: string;
}

export function SelectedResultPreview(props: SelectedResultPreviewProps) {
  const { selected, baseUrl } = props;
  if (!selected) {
    return (
      <div className="flex items-center justify-center rounded border border-border-primary border-dashed bg-bg-tertiary/50 text-sm text-text-secondary h-full min-h-[200px]">
        Select a result to preview details
      </div>
    );
  }

  const link = buildExternalMediaLink({
    service: 'sonarr',
    baseUrl,
    inLibrary: selected.inLibrary,
    ...(selected.librarySlug ? { librarySlug: selected.librarySlug } : {}),
    searchTerm: selected.title,
  });

  return (
    <div className="flex flex-col h-full rounded border border-border-primary bg-bg-tertiary overflow-hidden">
      <div className="flex gap-4 p-4">
        {selected.posterUrl ? (
          <img src={selected.posterUrl} alt="poster" className="w-28 h-40 object-cover rounded shadow-md shrink-0" />
        ) : (
          <div className="w-28 h-40 bg-bg-primary rounded shadow-md shrink-0" />
        )}
        <div className="flex flex-col min-w-0 gap-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary">
            <span className="font-mono bg-bg-primary/50 px-1.5 py-0.5 rounded">TVDB {selected.target.id}</span>
            {selected.imdbId && (
               <a 
                 href={`https://www.imdb.com/title/${selected.imdbId}/`} 
                 target="_blank" 
                 rel="noreferrer"
                 className="text-[#f5c518] hover:underline bg-black/20 px-1.5 py-0.5 rounded"
               >
                 IMDb {selected.imdbId}
               </a>
            )}
          </div>
          
          <div className="text-xl font-semibold text-text-primary leading-tight mt-1">
            {selected.title}
          </div>
          
          <div className="text-sm text-text-secondary">
            {selected.year}{selected.year && ' • '}{selected.networkOrStudio}{selected.networkOrStudio && ' • '}{selected.typeLabel || 'Series'}
          </div>

           <div className="text-xs text-text-secondary/80 mt-0.5 capitalize">
             Status: {selected.statusLabel || 'Unknown'}
           </div>

          <div className="mt-2">
             {selected.inLibrary ? (
               <span className="inline-flex items-center gap-1.5 rounded bg-success/10 px-2 py-1 text-xs font-medium text-success border border-success/20">
                 <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
                  </span>
                 In Library {selected.fileCount !== undefined ? `(${selected.fileCount} eps)` : ''}
               </span>
             ) : (
               <span className="inline-flex items-center rounded bg-blue-500/10 px-2 py-1 text-xs font-medium text-blue-400 border border-blue-500/20">
                 Add New
               </span>
             )}
          </div>
        </div>
      </div>

      {/* Description Area */}
      <div className="px-4 pb-4 text-sm text-text-secondary flex-1 overflow-y-auto">
         {selected.overview ? (
           <p className="leading-relaxed">{selected.overview}</p>
         ) : (
           <p className="italic opacity-50">No overview available.</p>
         )}
         
         {selected.alternateTitles && selected.alternateTitles.length > 0 && (
           <div className="mt-4 pt-3 border-t border-border-primary/50">
             <div className="text-xs font-medium text-text-secondary uppercase mb-1">Aliases</div>
             <div className="text-xs text-text-secondary/80 leading-normal">
               {selected.alternateTitles.slice(0, 5).join(', ')}{selected.alternateTitles.length > 5 && ', ...'}
             </div>
           </div>
         )}
      </div>

      <div className="p-3 bg-bg-primary/30 border-t border-border-primary flex justify-end">
        <a href={link} target="_blank" rel="noreferrer" className="text-accent-primary hover:text-accent-hover text-sm font-medium flex items-center gap-1.5">
          Open in Sonarr <ExternalLink size={14} />
        </a>
      </div>
      
      {selected.linkedAniListIds && selected.linkedAniListIds.length > 0 && (
        <div className="px-4 pb-2 text-[10px] text-red-400">
          Warning: Linked to {selected.linkedAniListIds.length} other AniList entries
        </div>
      )}
    </div>
  );
}