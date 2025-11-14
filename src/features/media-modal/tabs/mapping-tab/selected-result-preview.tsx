import type { MappingSearchResult } from '@/shared/types';
import { buildExternalMediaLink } from '@/shared/utils/build-external-media-link';

interface SelectedResultPreviewProps {
  selected: MappingSearchResult | null;
  baseUrl: string;
}

export function SelectedResultPreview(props: SelectedResultPreviewProps) {
  const { selected, baseUrl } = props;
  if (!selected) {
    return (
      <div className="flex items-center justify-center rounded border text-sm text-gray-500">
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
    <div className="flex gap-4 p-3 rounded border bg-white">
      {selected.posterUrl ? (
        <img src={selected.posterUrl} alt="poster" className="w-24 h-36 object-cover rounded" />
      ) : (
        <div className="w-24 h-36 bg-gray-200 rounded" />
      )}
      <div className="flex flex-col">
        <div className="text-sm text-gray-500">TVDB {String(selected.target.id)}</div>
        <div className="text-lg font-semibold">{selected.title}</div>
        <div className="text-sm text-gray-600">
          {selected.year ? `${selected.year} • ` : ''}
          {selected.typeLabel ?? ''}
        </div>
        <div className="text-sm text-gray-600 mt-1">
          {selected.inLibrary ? 'In Sonarr' : 'Not in Sonarr'}
        </div>
        <a href={link} target="_blank" rel="noreferrer" className="text-blue-600 text-sm mt-2">
          Open in Sonarr
        </a>
        {selected.linkedAniListIds && selected.linkedAniListIds.length > 0 && (
          <div className="text-xs text-gray-500 mt-2">
            Also linked to {selected.linkedAniListIds.length} other AniList entries
          </div>
        )}
      </div>
    </div>
  );
}
