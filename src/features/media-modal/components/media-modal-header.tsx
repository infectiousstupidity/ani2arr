import { type MouseEventHandler } from "react";
import { X, Database, List, Link2 } from "lucide-react";
import type { AniFormat, MediaStatus } from "@/shared/types";

export type MediaModalTabId = "series" | "mapping"; // extend later if needed

export type HeaderProps = {
  title: string;
  bannerImage: string | null;
  coverImage: string | null;
  anilistIds: number[];
  tvdbId?: number | null;
  inLibrary: boolean;
  format?: AniFormat | null;
  year?: number | null;
  status?: MediaStatus | null;

  activeTab: MediaModalTabId;
  onTabChange: (tab: MediaModalTabId) => void;
  onClose: MouseEventHandler<HTMLButtonElement>;
};

function formatAniListIds(anilistIds: number[]): string {
  if (anilistIds.length === 0) return "Unknown";
  if (anilistIds.length === 1) return String(anilistIds[0]);
  return `${anilistIds[0]} (+${anilistIds.length - 1})`;
}

function formatMediaFormat(format?: AniFormat | null): string | null {
  return format ? format.replace(/_/g, " ") : null;
}

function formatMediaStatus(status?: MediaStatus | null): string | null {
  if (!status) return null;
  const normalized = status.toLowerCase().replace(/_/g, " ");
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function Header(props: HeaderProps): React.JSX.Element {
  const {
    title,
    bannerImage,
    coverImage,
    anilistIds,
    tvdbId,
    inLibrary,
    format,
    year,
    status,
    activeTab,
    onTabChange,
    onClose,
  } = props;

  const aniDisplay = formatAniListIds(anilistIds);
  const formatLabel = formatMediaFormat(format);
  const yearLabel = year ?? null;
  const statusLabel = formatMediaStatus(status);
  const isReleasing = status === "RELEASING";

  return (
    <header className="relative">
      {/* Banner */}
      <div
        className="relative h-[180px] w-full overflow-hidden bg-bg-tertiary bg-cover bg-center bg-no-repeat shadow-[inset_0_0_250px_#2f3133]"
        style={{
          backgroundImage: bannerImage ? `url(${bannerImage})` : undefined,
        }}
      >
        <div className="absolute inset-0 z-0 bg-[rgba(31,40,53,0.65)]" />
      </div>

      {/* Close */}
      <div className="absolute inset-x-0 top-0 z-10 flex items-start justify-between px-6 pt-4">
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
      <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-4 px-6 py-4">
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

          {(formatLabel || yearLabel || statusLabel) && (
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
              {formatLabel ? (
                <span className="font-semibold text-text-primary">{formatLabel}</span>
              ) : null}
              {yearLabel ? (
                <>
                  <span className="text-text-secondary/60">|</span>
                  <span>{yearLabel}</span>
                </>
              ) : null}
              {statusLabel ? (
                <>
                  <span className="text-text-secondary/60">|</span>
                  <span className={isReleasing ? "text-success" : "text-text-secondary"}>
                    {statusLabel}
                  </span>
                </>
              ) : null}
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
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
      <div className="border-b border-border-primary bg-bg-secondary px-6 py-4">
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
