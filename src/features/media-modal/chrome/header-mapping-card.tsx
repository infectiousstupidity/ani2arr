/** Shared mapping-card primitives for media modal header cards. */
// src/features/media-modal/chrome/header-mapping-card.tsx

import { useState, type ReactNode } from "react";
import Pill from "@/shared/ui/primitives/pill";

const ID_PILL_CLASS =
  "max-w-full border border-border-primary/45 bg-bg-tertiary/20 text-text-secondary normal-case transition-colors group-hover:border-accent-primary/35 group-hover:bg-accent-primary/10 group-hover:text-accent-primary group-focus-visible:border-accent-primary/45 group-focus-visible:bg-accent-primary/10 group-focus-visible:text-accent-primary";

export function MappingPoster(props: {
  src: string | null;
  side?: "left" | "right";
}): React.JSX.Element {
  const { src, side = "left" } = props;
  const separatorClass =
    side === "left"
      ? "border-r border-border-primary/35"
      : "border-l border-border-primary/35";
  const innerRadiusClass = side === "left" ? "rounded-r-xl" : "rounded-l-xl";
  const posterClass = `relative h-full aspect-2/3 shrink-0 overflow-hidden bg-bg-primary/18 shadow-sm ${separatorClass} ${innerRadiusClass}`;

  return (
    <div className={posterClass}>
      <div className="absolute inset-0 bg-bg-primary/60" />
      {src ? <MappingPosterImage key={src} src={src} /> : null}
    </div>
  );
}

function MappingPosterImage(props: { src: string }): React.JSX.Element {
  const { src } = props;
  const [imageLoaded, setImageLoaded] = useState(false);

  return (
    <img
      src={src}
      alt=""
      onLoad={() => setImageLoaded(true)}
      className={`relative h-full w-full object-cover transition-opacity duration-200 ${
        imageLoaded ? "opacity-100" : "opacity-0"
      }`}
    />
  );
}

export function MappingIdPill(props: {
  children: ReactNode;
}): React.JSX.Element {
  const { children } = props;

  return (
    <Pill small tone="muted" className={ID_PILL_CLASS}>
      <span className="truncate">{children}</span>
    </Pill>
  );
}

export function MappingOpenLink(props: {
  href: string;
  ariaLabel: string;
  side?: "left" | "right";
  children: ReactNode;
}): React.JSX.Element {
  const { href, ariaLabel, side = "right", children } = props;
  const alignClass = side === "left" ? "mr-auto" : "ml-auto";

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`${alignClass} group flex w-fit max-w-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary`}
      aria-label={ariaLabel}
    >
      <MappingIdPill>{children}</MappingIdPill>
    </a>
  );
}
