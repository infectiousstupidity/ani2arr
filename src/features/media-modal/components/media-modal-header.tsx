/** Renders the media modal banner chrome and embedded AniList-to-provider summary strip. */
// src/features/media-modal/components/media-modal-header.tsx

import { ExternalLink, Settings, X } from "lucide-react";
import type { MouseEventHandler, ReactNode } from "react";
import type { AniListMediaFormat } from "@/anilist/schemas/media.schema";
import type { MappingSearchResult } from "@/features/mapping";
import type { Provider } from "@/providers";
import { getProviderLabel } from "@/providers/provider-routing";
import Button from "@/shared/ui/primitives/button";
import { buildExternalMediaLink } from "@/shared/utils/provider-links";
import { cn } from "@/shared/utils/cn";

export type HeaderProps = {
  title: string;
  bannerImage: string | null;
  coverImage: string | null;
  anilistId: number;
  provider: Provider;
  format?: AniListMediaFormat | null;
  year?: number | null;
  baseUrl: string;
  currentMapping: MappingSearchResult | null;
  workspaceClassName?: string;
  onClose: MouseEventHandler<HTMLButtonElement>;
  onOpenSettings?: () => void;
  tooltipContainer?: HTMLElement | null;
};

function formatMediaFormat(format: AniListMediaFormat | null | undefined): string | null {
  return format ? format.replaceAll("_", " ") : null;
}

function toTitleCaseLabel(value: string): string {
  return value
    .replaceAll("_", " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatTargetTypeLabel(typeLabel: string | undefined): string | null {
  if (!typeLabel) {
    return null;
  }

  const normalized = typeLabel.trim().toLowerCase();
  if (normalized === "anime" || normalized === "standard" || normalized === "daily") {
    return "TV";
  }

  return toTitleCaseLabel(typeLabel);
}

function joinMetadataLine(parts: Array<string | null | undefined>): string | null {
  const tokens = parts.filter(Boolean);
  return tokens.length > 0 ? tokens.join(" · ") : null;
}

function FaceoffSideShell(props: {
  align: "left" | "right";
  children: ReactNode;
}): React.JSX.Element {
  const { align, children } = props;

  return (
    <div className="relative isolate min-w-0">
      <div className="pointer-events-none absolute inset-x-[-0.9rem] -top-4 bottom-0 -z-10 rounded-4xl bg-linear-to-b from-bg-primary/44 via-bg-primary/16 to-transparent" />
      <div
        className={cn(
          "pointer-events-none absolute -top-5 bottom-8 -z-10 rounded-full bg-bg-primary/24 blur-2xl",
          align === "left" ? "-left-4 right-14" : "left-14 -right-4",
        )}
      />
      <div className="relative px-1.5 pt-1.5 pb-2">{children}</div>
    </div>
  );
}

function SummaryCard(props: {
  provider: Provider;
  baseUrl: string;
  mapping: MappingSearchResult | null;
}): React.JSX.Element {
  const { provider, baseUrl, mapping } = props;
  const providerLabel = getProviderLabel(provider);

  if (!mapping) {
    return (
      <FaceoffSideShell align="right">
        <div className="min-w-0">
          <p className="text-[11px] leading-none font-semibold uppercase tracking-[0.16em] text-text-secondary">
            {providerLabel.toUpperCase()}
          </p>
          <div className="mt-3 flex items-start gap-3">
            <div className="h-24 w-16 shrink-0 rounded-xl border border-border-primary/45 bg-bg-primary/22" />
            <div className="min-w-0 pt-1">
              <p className="text-sm font-medium text-text-primary">No match selected</p>
              <p className="mt-1 text-xs leading-5 text-text-secondary">
                {`Search below to choose the ${providerLabel} target.`}
              </p>
            </div>
          </div>
        </div>
      </FaceoffSideShell>
    );
  }

  const primaryMetadata = joinMetadataLine([
    formatTargetTypeLabel(mapping.typeLabel),
    mapping.year ? String(mapping.year) : null,
  ]);
  const secondaryMetadata = joinMetadataLine([
    mapping.provider === "radarr" ? "TMDB" : "TVDB",
    String(mapping.providerId),
  ]);
  const link = buildExternalMediaLink({
    provider,
    baseUrl,
    inLibrary: mapping.inLibrary,
    ...(mapping.librarySlug ? { librarySlug: mapping.librarySlug } : {}),
    searchTerm: mapping.title,
  });

  return (
    <FaceoffSideShell align="right">
      <div className="relative min-w-0">
        <p className="pr-10 text-[11px] leading-none font-semibold uppercase tracking-[0.16em] text-text-secondary">
          {providerLabel.toUpperCase()}
        </p>
        {link ? (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="absolute right-0 top-0 inline-flex h-8 w-8 items-start justify-center rounded-full pt-px text-text-secondary transition-colors hover:bg-bg-primary/25 hover:text-text-primary"
            aria-label={`Open in ${providerLabel}`}
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        ) : null}

        <div className="mt-3 flex items-start gap-3">
          <div className="h-24 w-16 shrink-0 overflow-hidden rounded-xl border border-border-primary/45 bg-bg-primary/18 shadow-[0_10px_24px_rgba(0,0,0,0.14)]">
            {mapping.posterUrl ? (
              <img src={mapping.posterUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full bg-bg-primary/60" />
            )}
          </div>

          <div className="min-w-0 flex-1 pt-1">
            <h2 className="line-clamp-2 text-lg font-semibold leading-tight text-text-primary drop-shadow-[0_1px_8px_rgba(0,0,0,0.35)]">
              {mapping.title}
            </h2>
            {primaryMetadata ? (
              <p className="mt-2 text-xs text-text-secondary">{primaryMetadata}</p>
            ) : null}
            {secondaryMetadata ? (
              <p className="mt-1 text-xs text-text-secondary">{secondaryMetadata}</p>
            ) : null}
          </div>
        </div>
      </div>
    </FaceoffSideShell>
  );
}

export function Header(props: HeaderProps): React.JSX.Element {
  const {
    title,
    bannerImage,
    coverImage,
    anilistId,
    provider,
    format,
    year,
    baseUrl,
    currentMapping,
    workspaceClassName,
    onClose,
    onOpenSettings,
    tooltipContainer,
  } = props;
  const sourcePrimaryMetadata = joinMetadataLine([
    formatMediaFormat(format),
    year ? String(year) : null,
  ]);
  const sourceSecondaryMetadata = joinMetadataLine(["AniList", String(anilistId)]);
  const sourceLink = `https://anilist.co/anime/${anilistId}`;

  const headerIconButtonClassName = "rounded-full p-1.5 text-text-secondary hover:text-text-primary";

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

      <div className="absolute inset-x-0 bottom-0 z-10 px-4 pb-5 sm:px-8 sm:pb-7">
        <div
          className={cn(
            "grid w-full gap-5 lg:grid-cols-[minmax(0,1fr)_8.5rem_minmax(0,1fr)] lg:items-start lg:gap-x-0 lg:gap-y-4",
            workspaceClassName,
          )}
        >
          <FaceoffSideShell align="left">
            <div className="relative min-w-0">
              <p className="pr-10 text-[11px] leading-none font-semibold uppercase tracking-[0.16em] text-text-secondary">
                ANILIST
              </p>
              <a
                href={sourceLink}
                target="_blank"
                rel="noreferrer"
                className="absolute right-0 top-0 inline-flex h-8 w-8 items-start justify-center rounded-full pt-px text-text-secondary transition-colors hover:bg-bg-primary/25 hover:text-text-primary"
                aria-label="Open in AniList"
              >
                <ExternalLink className="h-4 w-4" />
              </a>

              <div className="mt-3 flex items-start gap-3">
                <div className="h-24 w-16 shrink-0 overflow-hidden rounded-xl border border-border-primary/45 bg-bg-primary/18 shadow-[0_10px_24px_rgba(0,0,0,0.14)]">
                  {coverImage ? (
                    <img src={coverImage} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full bg-bg-primary/60" />
                  )}
                </div>

                <div className="min-w-0 flex-1 pt-1">
                  <h2 className="line-clamp-2 text-lg font-semibold leading-tight text-text-primary drop-shadow-[0_1px_8px_rgba(0,0,0,0.35)]">
                    {title}
                  </h2>
                  {sourcePrimaryMetadata ? (
                    <p className="mt-2 text-xs text-text-secondary">{sourcePrimaryMetadata}</p>
                  ) : null}
                  {sourceSecondaryMetadata ? (
                    <p className="mt-1 text-xs text-text-secondary">{sourceSecondaryMetadata}</p>
                  ) : null}
                </div>
              </div>
            </div>
          </FaceoffSideShell>

          <div className="flex items-center justify-center self-center lg:self-stretch">
            <div className="flex w-full max-w-[8.5rem] flex-col items-center justify-center">
              <p className="whitespace-nowrap text-[10px] leading-none font-semibold uppercase tracking-[0.18em] text-text-secondary">
                MAPS TO
              </p>
              <div className="mt-1.5 flex w-full items-center">
                <div className="h-px flex-1 bg-text-primary/70" />
                <div className="h-2.5 w-2.5 shrink-0 rotate-45 border-t border-r border-text-primary/70" />
              </div>
            </div>
          </div>

          <SummaryCard
            provider={provider}
            baseUrl={baseUrl}
            mapping={currentMapping}
          />
        </div>
      </div>
    </header>
  );
}
