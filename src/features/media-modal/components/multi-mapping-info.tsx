// src/features/media-modal/components/multi-mapping-info.tsx
import * as Tooltip from '@radix-ui/react-tooltip';

interface MultiMappingInfoProps {
  currentAniListId: number;
  linkedAniListIds: number[];
}

export function MultiMappingInfo(props: MultiMappingInfoProps) {
  const { currentAniListId, linkedAniListIds } = props;
  const others = (linkedAniListIds || []).filter(id => id !== currentAniListId);
  if (!others.length) return null;
  return (
    <Tooltip.Provider>
      <Tooltip.Root delayDuration={200}>
        <Tooltip.Trigger asChild>
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700 cursor-default">
            +{others.length}
          </span>
        </Tooltip.Trigger>
        <Tooltip.Content side="top" className="rounded bg-black text-white text-xs px-2 py-1">
          Also linked to {others.length} other AniList entr{others.length === 1 ? 'y' : 'ies'}
        </Tooltip.Content>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
