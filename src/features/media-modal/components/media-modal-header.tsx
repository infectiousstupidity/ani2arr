import { type MouseEventHandler } from "react";
import { X, Database, List, Link2 } from "lucide-react";

export type MediaModalTabId = "series" | "mapping"; // extend later if needed

export type HeaderProps = {
  title: string;
  bannerImage: string | null;
  coverImage: string | null;
  anilistIds: number[];
  tvdbId?: number | null;
  inLibrary: boolean;

  activeTab: MediaModalTabId;
  onTabChange: (tab: MediaModalTabId) => void;
  onClose: MouseEventHandler<HTMLButtonElement>;
};

function formatAniListIds(anilistIds: number[]): string {
  if (anilistIds.length === 0) return "Unknown";
  if (anilistIds.length === 1) return String(anilistIds[0]);
  return `${anilistIds[0]} (+${anilistIds.length - 1})`;
}

export function Header(props: HeaderProps): React.JSX.Element {
  const {
    title,
    bannerImage,
    coverImage,
    anilistIds,
    tvdbId,
    inLibrary,
    activeTab,
    onTabChange,
    onClose,
  } = props;

  const aniDisplay = formatAniListIds(anilistIds);

  return (
    <header className="relative">
      {/* Banner */}
      <div className="relative h-28 w-full overflow-hidden">
        {bannerImage ? (
          <img
            src={bannerImage}
            alt={title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full bg-bg-tertiary" />
        )}
        <div className="pointer-events-none absolute inset-0 bg-[rgba(31,40,53,0.65)] shadow-[0_0_40px_rgba(0,0,0,0.8)]" />
      </div>

      {/* Close */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between px-6 pt-4">
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="ml-auto rounded-full bg-bg-secondary/80 p-1.5 text-text-secondary backdrop-blur hover:bg-bg-tertiary hover:text-text-primary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Cover + title + IDs */}
      <div className="absolute inset-x-0 top-0 flex items-center gap-4 px-6 py-4">
        <div className="hidden h-[140px] w-[100px] shrink-0 overflow-hidden rounded-xl border border-border-primary bg-bg-tertiary shadow-lg sm:block">
          {coverImage ? (
            <img
              src={coverImage}
              alt={title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full bg-bg-tertiary" />
          )}
        </div>

        <div className="min-w-0 flex-1 pb-1">
          <h1 className="truncate text-lg font-semibold tracking-tight text-text-primary">
            {title}
          </h1>

          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            {inLibrary && (
              <span className="inline-flex items-center gap-1 rounded-full bg-success/20 px-2.5 py-0.5 text-[11px] font-medium text-success">
                <Database className="h-3.5 w-3.5" />
                In library
              </span>
            )}

            <span className="inline-flex items-center gap-1 rounded-full bg-bg-tertiary px-2.5 py-0.5 text-[11px] text-text-secondary">
              AniList {aniDisplay}
            </span>

            {tvdbId ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-bg-tertiary px-2.5 py-0.5 text-[11px] text-text-secondary">
                TVDB {tvdbId}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border-primary bg-bg-secondary px-6 pt-20 pb-4">
        <div className="flex items-center gap-2">
          <TabButton
            id="series"
            label="Series"
            icon={List}
            isActive={activeTab === "series"}
            onClick={onTabChange}
          />
          <TabButton
            id="mapping"
            label="ID Mapping"
            icon={Link2}
            isActive={activeTab === "mapping"}
            onClick={onTabChange}
          />
        </div>
      </div>
    </header>
  );
}

type TabButtonProps = {
  id: MediaModalTabId;
  label: string;
  icon: typeof List;
  isActive: boolean;
  onClick: (id: MediaModalTabId) => void;
};

function TabButton(props: TabButtonProps): React.JSX.Element {
  const { id, label, icon: Icon, isActive, onClick } = props;

  const base =
    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition";
  const activeClasses = "bg-bg-tertiary text-text-primary shadow-sm";
  const inactiveClasses =
    "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary";

  return (
    <button
      type="button"
      onClick={() => onClick(id)}
      className={`${base} ${isActive ? activeClasses : inactiveClasses}`}
    >
      <Icon className="h-4 w-4" />
      <span className="font-medium">{label}</span>
    </button>
  );
}
