// src/features/media-modal/components/multi-mapping-info.tsx
import Pill from "@/shared/components/pill";
import Tooltip from "@/shared/components/tooltip";

interface MultiMappingInfoProps {
  currentAniListId: number;
  linkedAniListIds: number[];
}

export function MultiMappingInfo(props: MultiMappingInfoProps) {
  const { currentAniListId, linkedAniListIds } = props;
  const others = (linkedAniListIds || []).filter(id => id !== currentAniListId);
  const otherCount = others.length;
  const pill = (
    <Pill
      tone="accent"
      small
      className="cursor-default font-mono text-text-primary/90 normal-case"
    >
      AniList {currentAniListId}
    </Pill>
  );

  if (!otherCount) return pill;

  return (
    <Tooltip
      content={
        <div className="space-y-1">
          <div className="font-semibold">
            Also linked to {otherCount} other AniList entr{otherCount === 1 ? "y" : "ies"}:
          </div>
          <div className="font-mono text-[11px] text-white/90">{others.join(", ")}</div>
        </div>
      }
      side="top"
      sideOffset={6}
    >
      {pill}
    </Tooltip>
  );
}
