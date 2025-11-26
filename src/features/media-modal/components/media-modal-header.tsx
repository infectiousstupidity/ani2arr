// src/features/media-modal/components/media-modal-header.tsx
import { type MouseEventHandler } from "react";
import { Database, X } from "lucide-react";
import TooltipWrapper from "@/shared/components/tooltip";
import Pill from '@/shared/components/pill';
import type { AniFormat, MediaStatus, TitleLanguage } from "@/shared/types";

export type MediaModalTabId = "series" | "mapping";

export type HeaderProps = {
  title: string;
  alternateTitles: Array<{ label: string; value: string }>;
  titleLanguage: TitleLanguage;
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
  tooltipContainer?: HTMLElement | null;
};

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
    alternateTitles,
    titleLanguage,
    bannerImage,
    coverImage,
    inLibrary,
    format,
    year,
    status,
    onClose,
    tooltipContainer,
  } = props;

  const formatLabel = formatMediaFormat(format);
  const yearLabel = year ?? null;
  const statusLabel = formatMediaStatus(status);
  const currentTone = statusTone(status);
  const hasAlternateTitles = alternateTitles.length > 0;
  const tooltipPortal = tooltipContainer ?? null;

  const titleNode = (
    <h1
      className={`truncate text-xl font-semibold tracking-tight text-text-primary drop-shadow-lg ${
        hasAlternateTitles ? "cursor-help" : ""
      }`}
    >
      {title}
    </h1>
  );

  return (
    <header className="relative mb-12">
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
        <div className="flex items-start justify-between px-8 pt-4">
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="ml-auto rounded-full bg-bg-secondary/80 p-1.5 text-text-secondary backdrop-blur hover:bg-bg-tertiary hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-auto px-8 pb-14">
          <div className="flex items-start gap-4">
            <div className="hidden h-[150px] w-[110px] shrink-0 overflow-hidden rounded-xl border border-border-primary/60 bg-bg-tertiary/80 shadow-lg sm:block relative z-20 translate-y-8">
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

            <div className="min-w-0 flex-1 space-y-3 mt-auto pb-5">
              <div className="flex flex-wrap items-start gap-3">
                {hasAlternateTitles ? (
                  <TooltipWrapper
                    content={(
                      <div className="space-y-1">
                        {alternateTitles.map(alt => (
                          <div key={`${titleLanguage}-${alt.label}`} className="space-y-0.5">
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                              {alt.label}
                            </div>
                            <div className="text-sm text-white leading-tight">
                              {alt.value}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    side="top"
                    align="start"
                    sideOffset={10}
                    container={tooltipPortal}
                  >
                    {titleNode}
                  </TooltipWrapper>
                ) : (
                  titleNode
                )}
                {formatLabel ? (
                  <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white/80 shadow-sm">
                    {formatLabel}
                  </span>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[12px] font-medium text-text-secondary">
                {yearLabel ? (
                  <Pill tone="muted" className="uppercase">{String(yearLabel)}</Pill>
                ) : null}
                {statusLabel ? (
                  <Pill tone={currentTone} className="uppercase">{statusLabel}</Pill>
                ) : null}
                {inLibrary ? (
                  <Pill tone="success" icon={Database} className="uppercase">In Sonarr</Pill>
                ) : null}
                <span className="flex-1" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}




