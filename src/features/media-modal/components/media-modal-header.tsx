import { type MouseEventHandler } from "react";
import { ArrowRight, Database, Pencil, X } from "lucide-react";
import type { AniFormat, MediaStatus } from "@/shared/types";

export type MediaModalTabId = "series" | "mapping";

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
  onEnterMapping: () => void;
  onExitMapping: () => void;
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

function statusTone(status?: MediaStatus | null): "success" | "warning" | "info" {
  if (status === "RELEASING") return "success";
  if (status === "NOT_YET_RELEASED") return "warning";
  return "info";
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
    onEnterMapping,
    onExitMapping,
    onClose,
  } = props;

  const aniDisplay = formatAniListIds(anilistIds);
  const formatLabel = formatMediaFormat(format);
  const yearLabel = year ?? null;
  const statusLabel = formatMediaStatus(status);
  const currentTone = statusTone(status);

  return (
    <header className="relative">
      <div
        className="relative h-[200px] w-full overflow-hidden bg-bg-tertiary bg-cover bg-center bg-no-repeat shadow-[inset_0_0_250px_#121722]"
        style={{
          backgroundImage: bannerImage ? `url(${bannerImage})` : undefined,
        }}
      >
        <div className="absolute inset-0 bg-linear-to-r from-[rgba(31,40,53,0.78)] via-[rgba(31,40,53,0.64)] to-[rgba(31,40,53,0.44)]" />
        <div className="absolute inset-0 bg-linear-to-b from-transparent via-[rgba(14,22,39,0.32)] to-[rgba(14,22,39,0.52)]" />
      </div>

      <div className="absolute inset-x-0 top-0 z-10 flex flex-col">
        <div className="flex items-start justify-between px-6 pt-4">
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="ml-auto rounded-full bg-bg-secondary/80 p-1.5 text-text-secondary backdrop-blur hover:bg-bg-tertiary hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-auto px-6 pb-6">
          <div className="flex items-start gap-4">
            <div className="hidden h-[150px] w-[110px] shrink-0 overflow-hidden rounded-xl border border-border-primary/60 bg-bg-tertiary/80 shadow-lg sm:block">
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

            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex flex-wrap items-start gap-3">
                <h1 className="truncate text-xl font-semibold tracking-tight text-text-primary drop-shadow-lg">
                  {title}
                </h1>
                {formatLabel ? (
                  <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white/80 shadow-sm">
                    {formatLabel}
                  </span>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[12px] font-medium text-text-secondary">
                {yearLabel ? (
                  <MetadataBadge tone="muted" label={String(yearLabel)} />
                ) : null}
                {statusLabel ? (
                  <MetadataBadge
                    tone={currentTone}
                    label={statusLabel}
                  />
                ) : null}
                {inLibrary ? (
                  <MetadataBadge
                    tone="success"
                    icon={Database}
                    label="In library"
                  />
                ) : null}
                <span className="flex-1" />
                <MappingPill
                  aniListLabel={aniDisplay}
                  tvdbId={tvdbId ?? null}
                  isActive={activeTab === "mapping"}
                  onEdit={onEnterMapping}
                  onExit={onExitMapping}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

type MetadataBadgeProps = {
  label: string;
  icon?: typeof Database;
  tone?: "muted" | "success" | "warning" | "info";
};

function MetadataBadge(props: MetadataBadgeProps) {
  const { label, icon: Icon, tone = "muted" } = props;
  const toneClasses: Record<NonNullable<MetadataBadgeProps["tone"]>, string> = {
    muted: "border-white/15 bg-white/10 text-white/80",
    success: "border-success/25 bg-success/20 text-success",
    warning: "border-amber-200/30 bg-amber-100/15 text-amber-100",
    info: "border-white/15 bg-white/10 text-white/80",
  };

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] ${toneClasses[tone]}`}>
      {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
      <span className="leading-none">{label}</span>
    </span>
  );
}

type MappingPillProps = {
  aniListLabel: string;
  tvdbId: number | null;
  isActive: boolean;
  onEdit: () => void;
  onExit: () => void;
};

function MappingPill(props: MappingPillProps) {
  const { aniListLabel, tvdbId, isActive, onEdit, onExit } = props;
  const isUnmapped = tvdbId == null;
  const ActionIcon = isActive ? X : Pencil;
  const actionLabel = isActive ? "Back to series" : "Edit mapping";

  return (
    <div className="flex items-center overflow-hidden rounded-full border border-white/10 bg-black/50 text-[11px] font-medium text-gray-200 shadow-sm backdrop-blur">
      <div className="flex items-center gap-1.5 bg-white/5 px-3 py-1.5">
        <span className="flex h-5 w-5 items-center justify-center rounded-full border border-white/20 bg-[#2c80ff]/40 text-[10px] font-semibold text-white shadow-inner">
          A
        </span>
        <span className="tabular-nums text-gray-100">{aniListLabel}</span>
      </div>

      <div className="flex items-center justify-center px-2 text-gray-500">
        <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.2} />
      </div>

      <button
        type="button"
        onClick={isActive ? onExit : onEdit}
        className={`group flex items-center gap-2 pl-2 pr-3 py-1.5 transition-colors border-l border-white/5 ${
          isActive ? "bg-white/15 text-white" : "hover:bg-white/15 hover:text-white"
        }`}
        title={actionLabel}
        aria-label={actionLabel}
      >
        <div className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-full border border-emerald-200/50 bg-emerald-400/15 text-[10px] font-semibold uppercase text-emerald-50 shadow-inner">
            TV
          </span>
          <span className={`tabular-nums ${isUnmapped ? "text-amber-200" : "text-white"}`}>
            {isUnmapped ? "Unmapped" : tvdbId}
          </span>
        </div>
        <span className="flex h-5 w-5 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white/70 transition group-hover:border-white/40 group-hover:text-white">
          <ActionIcon className="h-3.5 w-3.5" />
        </span>
      </button>
    </div>
  );
}
