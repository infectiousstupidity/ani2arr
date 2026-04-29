/** Renders the media modal banner chrome and embedded AniList-to-provider summary strip. */
// src/features/media-modal/components/header.tsx

import { Settings, X } from "lucide-react";
import type { MouseEventHandler, ReactNode } from "react";
import type { AniListId } from "@/anilist";
import { buildAniListAnimeUrl } from "@/anilist/anilist-links";
import type { MappingSearchResult } from "@/features/media-modal/mapping-search/types";
import type { Provider } from "@/providers";
import {
  getProviderIdentityIdLabel,
  getProviderLabel,
} from "@/providers/provider-labels";
import { buildProviderOpenUrl } from "@/providers/provider-links";
import Button from "@/shared/ui/primitives/button";
import { cn } from "@/shared/utils/cn";
import { useMediaModalContext } from "../context";
import { formatToken } from "../helpers";
import type { AniListHeaderData } from "../types";
import { MappingCard, MappingOpenLink, MappingPoster } from "./mapping-card";

export type HeaderProps = {
  anilistHeaderData: AniListHeaderData;
  anilistId: AniListId;
  effectiveMapping: MappingSearchResult | null;
  workspaceClassName?: string;
  onClose: MouseEventHandler<HTMLButtonElement>;
  onOpenSettings?: () => void;
  modeSwitchLabel?: string | null;
  onModeSwitch?: () => void;
  providerActions?: ReactNode;
};

const CHROME_BUTTON_CLASS =
  "rounded-full p-1.5 text-text-secondary hover:text-text-primary";

const MODE_SWITCH_BUTTON_CLASS =
  "mt-3 h-8 rounded-lg border border-border-primary/40 bg-bg-primary/12 px-3 text-xs font-medium text-text-secondary shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] hover:border-border-primary/60 hover:bg-bg-secondary/45 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/45 focus-visible:ring-offset-0";

function toTitleCase(value: string): string {
  return value
    .replaceAll("_", " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatProviderType(typeLabel: string | undefined): string | null {
  if (!typeLabel) {
    return null;
  }

  const normalized = typeLabel.trim().toLowerCase();
  if (
    normalized === "anime" ||
    normalized === "standard" ||
    normalized === "daily"
  ) {
    return "TV";
  }

  return toTitleCase(typeLabel);
}

function joinMetaLine(parts: Array<string | null | undefined>): string | null {
  const values: string[] = [];

  for (const part of parts) {
    if (part) {
      values.push(part);
    }
  }

  return values.length > 0 ? values.join(" - ") : null;
}

function MappingBridge(): React.JSX.Element {
  return (
    <div className="flex items-center justify-center self-center lg:self-stretch">
      <div className="flex w-full max-w-34 flex-col items-center justify-center">
        <p className="whitespace-nowrap text-[10px] leading-none font-semibold uppercase tracking-[0.18em] text-text-secondary">
          MAPS TO
        </p>
        <div className="mt-1.5 flex w-full items-center">
          <div className="h-px flex-1 bg-text-primary/70" />
          <div className="h-2.5 w-2.5 shrink-0 rotate-45 border-t border-r border-text-primary/70" />
        </div>
      </div>
    </div>
  );
}

function SourceCard(props: {
  anilistHeaderData: AniListHeaderData;
  anilistId: AniListId;
}): React.JSX.Element {
  const {
    anilistHeaderData: { title, coverImage, format, year },
    anilistId,
  } = props;

  const anilistMetaLine = joinMetaLine([
    format ? formatToken(format) : null,
    year ? String(year) : null,
  ]);
  const anilistIdLine = joinMetaLine(["AniList", String(anilistId)]);
  const anilistLink = buildAniListAnimeUrl(anilistId);

  return (
    <MappingCard>
      <div className="pointer-events-none absolute -top-5 bottom-8 -left-4 right-14 -z-10 rounded-full bg-bg-primary/24 blur-2xl" />

      <div className="relative min-w-0">
        <p className="pr-10 text-[11px] leading-none font-semibold uppercase tracking-[0.16em] text-text-secondary">
          ANILIST
        </p>

        <MappingOpenLink href={anilistLink} label="Open in AniList" />

        <div className="mt-3 flex items-start gap-3">
          <MappingPoster src={coverImage} />

          <div className="min-w-0 flex-1 pt-1">
            <h2 className="line-clamp-2 text-lg font-semibold leading-tight text-text-primary drop-shadow-[0_1px_8px_rgba(0,0,0,0.35)]">
              {title}
            </h2>

            {anilistMetaLine ? (
              <p className="mt-2 text-xs text-text-secondary">{anilistMetaLine}</p>
            ) : null}

            {anilistIdLine ? (
              <p className="mt-1 text-xs text-text-secondary">{anilistIdLine}</p>
            ) : null}
          </div>
        </div>
      </div>
    </MappingCard>
  );
}

function ProviderModeSwitchButton(props: {
  label: string;
  onClick: () => void;
}): React.JSX.Element {
  const { label, onClick } = props;

  return (
    <button type="button" onClick={onClick} className={MODE_SWITCH_BUTTON_CLASS}>
      {label}
    </button>
  );
}

type ProviderCardProps = {
  provider: Provider;
  baseUrl: string;
  effectiveMapping: MappingSearchResult | null;
  modeSwitchLabel?: string | null;
  onModeSwitch?: () => void;
  providerActions?: ReactNode;
};

function ProviderCard(props: ProviderCardProps): React.JSX.Element {
  const {
    provider,
    baseUrl,
    effectiveMapping,
    modeSwitchLabel,
    onModeSwitch,
    providerActions,
  } = props;

  const providerLabel = getProviderLabel(provider);

  const providerMetaLine = effectiveMapping
    ? joinMetaLine([
        formatProviderType(effectiveMapping.typeLabel),
        effectiveMapping.year ? String(effectiveMapping.year) : null,
      ])
    : null;

  const providerIdLine = effectiveMapping
    ? getProviderIdentityIdLabel(effectiveMapping)
    : null;

  const providerLink = effectiveMapping
    ? buildProviderOpenUrl({
        provider,
        baseUrl,
        isInLibrary: effectiveMapping.isInLibrary,
        ...(effectiveMapping.providerRouteSlug
          ? { providerRouteSlug: effectiveMapping.providerRouteSlug }
          : {}),
        searchTerm: effectiveMapping.title,
      })
    : null;

  const title = effectiveMapping ? effectiveMapping.title : "No match selected";
  const description = effectiveMapping
    ? null
    : `Search below to choose the ${providerLabel} target.`;
  const posterUrl = effectiveMapping?.posterUrl ?? null;

  const modeSwitch =
    modeSwitchLabel != null && onModeSwitch ? (
      <ProviderModeSwitchButton label={modeSwitchLabel} onClick={onModeSwitch} />
    ) : null;

  return (
    <MappingCard>
      <div className="pointer-events-none absolute -top-5 bottom-8 left-14 -right-4 -z-10 rounded-full bg-bg-primary/24 blur-2xl" />

      <div className="relative min-w-0">
        <p className="pr-10 text-[11px] leading-none font-semibold uppercase tracking-[0.16em] text-text-secondary">
          {providerLabel.toUpperCase()}
        </p>

        {providerLink ? (
          <MappingOpenLink href={providerLink} label={`Open in ${providerLabel}`} />
        ) : null}

        <div className="mt-3 flex items-start gap-3">
          <MappingPoster src={posterUrl} />

          <div className="min-w-0 flex-1 pt-1">
            <h2 className="line-clamp-2 text-lg font-semibold leading-tight text-text-primary drop-shadow-[0_1px_8px_rgba(0,0,0,0.35)]">
              {title}
            </h2>

            {providerMetaLine ? (
              <p className="mt-2 text-xs text-text-secondary">{providerMetaLine}</p>
            ) : null}

            {providerIdLine ? (
              <p className="mt-1 text-xs text-text-secondary">{providerIdLine}</p>
            ) : null}

            {description ? (
              <p className="mt-1 text-xs leading-5 text-text-secondary">
                {description}
              </p>
            ) : null}

            {modeSwitch}

            {providerActions ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">{providerActions}</div>
            ) : null}
          </div>
        </div>
      </div>
    </MappingCard>
  );
}

export function Header(props: HeaderProps): React.JSX.Element {
  const {
    anilistHeaderData,
    anilistId,
    effectiveMapping,
    workspaceClassName,
    onClose,
    onOpenSettings,
    modeSwitchLabel,
    onModeSwitch,
    providerActions,
  } = props;

  const { provider, baseUrl, contentContainer } = useMediaModalContext();
  const { bannerImage } = anilistHeaderData;

  return (
    <header className="relative shrink-0">
      <div
        className="relative h-60 w-full overflow-hidden bg-bg-tertiary sm:h-64"
        style={{
          backgroundImage: bannerImage ? `url(${bannerImage})` : undefined,
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          backgroundSize: "cover",
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
            tooltip="Open manual mapping settings in the options page"
            tooltipContainer={contentContainer ?? undefined}
            className={CHROME_BUTTON_CLASS}
            aria-label="Open manual mapping settings"
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
          className={CHROME_BUTTON_CLASS}
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
          <SourceCard anilistHeaderData={anilistHeaderData} anilistId={anilistId} />
          <MappingBridge />
          <ProviderCard
            provider={provider}
            baseUrl={baseUrl}
            effectiveMapping={effectiveMapping}
            {...(modeSwitchLabel === undefined ? {} : { modeSwitchLabel })}
            {...(onModeSwitch ? { onModeSwitch } : {})}
            {...(providerActions ? { providerActions } : {})}
          />
        </div>
      </div>
    </header>
  );
}
