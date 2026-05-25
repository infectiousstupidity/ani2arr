/** Shared mapping-card primitives for media modal header cards. */
// src/features/media-modal/chrome/header-mapping-card.tsx

import { ExternalLink } from "lucide-react";
import { useState, type ReactNode } from "react";

export function MappingCard(props: { children: ReactNode }): React.JSX.Element {
  const { children } = props;

  return (
    <div className="relative isolate min-w-0">
      <div className="pointer-events-none absolute inset-x-[-0.9rem] -top-4 bottom-0 -z-10 rounded-4xl bg-linear-to-b from-bg-primary/44 via-bg-primary/16 to-transparent" />
      <div className="relative px-1.5 pt-1.5 pb-2">{children}</div>
    </div>
  );
}

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
      className={`${alignClass} flex w-fit max-w-full items-center gap-1 text-[10px] leading-tight font-medium text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary md:text-xs`}
      aria-label={ariaLabel}
    >
      {side === "left" ? (
        <>
          <ExternalLink className="h-3 w-3 shrink-0 md:h-3.5 md:w-3.5" />
          <span className="truncate">{children}</span>
        </>
      ) : (
        <>
          <span className="truncate">{children}</span>
          <ExternalLink className="h-3 w-3 shrink-0 md:h-3.5 md:w-3.5" />
        </>
      )}
    </a>
  );
}
