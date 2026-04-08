/** Renders atmospheric banner chrome and its overlaid comparison stage. */
// src/features/media-modal/components/media-modal-header.tsx

import { type MouseEventHandler, type ReactNode } from "react";
import { Settings, X } from "lucide-react";
import type { AniListTitleLanguage } from "@/anilist/schemas/title-language.schema";
import type { AniListMediaFormat, AniListMediaStatus } from "@/anilist/schemas/media.schema";
import type { Provider } from "@/providers";
import Button from "@/shared/ui/primitives/button";

export type MediaModalTabId = "series" | "mapping";

export type HeaderProps = {
  title: string;
  alternateTitles: Array<{ label: string; value: string }>;
  titleLanguage: AniListTitleLanguage;
  bannerImage: string | null;
  coverImage: string | null;
  anilistIds: number[];
  provider: Provider;
  inLibrary: boolean;
  format?: AniListMediaFormat | null;
  year?: number | null;
  status?: AniListMediaStatus | null;

  activeTab: MediaModalTabId;
  onEnterMapping: () => void;
  onExitMapping: () => void;
  onClose: MouseEventHandler<HTMLButtonElement>;
  onOpenSettings?: () => void;
  tooltipContainer?: HTMLElement | null;
  content?: ReactNode;
};

export function Header(props: HeaderProps): React.JSX.Element {
  const {
    bannerImage,
    onClose,
    onOpenSettings,
    tooltipContainer,
    content,
  } = props;

  const headerIconButtonClassName = 'rounded-full bg-bg-secondary/80 p-1.5 text-text-secondary backdrop-blur hover:bg-bg-tertiary hover:text-text-primary';

  return (
    <header className="relative shrink-0">
      <div
        className="relative h-60 w-full overflow-hidden bg-bg-tertiary sm:h-64"
        style={{
          backgroundImage: bannerImage ? `url(${bannerImage})` : undefined,
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          backgroundSize: 'cover',
        }}
      >
        <div className="absolute inset-0 bg-linear-to-r from-[rgba(11,22,34,0.9)] via-[rgba(11,22,34,0.72)] to-[rgba(11,22,34,0.38)]" />
        <div className="absolute inset-0 bg-linear-to-b from-[rgba(5,12,20,0.08)] via-[rgba(11,22,34,0.28)] to-[rgba(11,22,34,0.72)]" />
        <div className="absolute inset-x-0 bottom-0 h-28 bg-linear-to-b from-transparent via-bg-primary/75 to-bg-primary" />
        <div className="absolute inset-0 shadow-[inset_0_0_180px_rgba(11,22,34,0.58)]" />
      </div>

      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-end gap-2 px-4 pt-4 sm:px-6">
        {onOpenSettings ? (
          <Button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpenSettings();
            }}
            variant="ghost"
            size="icon"
            tooltip="Open Mapping & Overrides settings in the options page"
            portalContainer={tooltipContainer ?? undefined}
            className={headerIconButtonClassName}
            aria-label="Open Mapping & Overrides settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
        ) : null}
        <Button
          type="button"
          aria-label="Close"
          onClick={onClose}
          variant="ghost"
          size="icon"
          className={headerIconButtonClassName}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {content ? (
        <div className="absolute inset-x-0 bottom-0 z-10 px-4 pb-5 sm:px-8 sm:pb-7">
          {content}
        </div>
      ) : null}
    </header>
  );
}
