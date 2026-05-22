/** Shared mapping-card primitives for media modal header cards. */
// src/features/media-modal/chrome/header-mapping-card.tsx

import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";

export function MappingCard(props: { children: ReactNode }): React.JSX.Element {
  const { children } = props;

  return (
    <div className="relative isolate min-w-0">
      <div className="pointer-events-none absolute inset-x-[-0.9rem] -top-4 bottom-0 -z-10 rounded-4xl bg-linear-to-b from-bg-primary/44 via-bg-primary/16 to-transparent" />
      <div className="relative px-1.5 pt-1.5 pb-2">{children}</div>
    </div>
  );
}

export function MappingPoster(props: { src: string | null }): React.JSX.Element {
  const { src } = props;

  return (
    <div className="h-18 w-12 shrink-0 overflow-hidden rounded-xl border border-border-primary/45 bg-bg-primary/18 shadow-[0_10px_24px_rgba(0,0,0,0.14)] md:h-24 md:w-16">
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="h-full w-full bg-bg-primary/60" />
      )}
    </div>
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
      className={`${alignClass} flex w-fit max-w-full items-center gap-1.5 rounded-full px-2 py-1 text-[9px] leading-none font-semibold uppercase tracking-[0.16em] text-text-secondary transition-colors hover:bg-bg-primary/25 hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary md:text-[11px]`}
      aria-label={ariaLabel}
    >
      {side === "left" ? (
        <>
          <ExternalLink className="h-3.5 w-3.5 shrink-0 md:h-4 md:w-4" />
          <span className="truncate">{children}</span>
        </>
      ) : (
        <>
          <span className="truncate">{children}</span>
          <ExternalLink className="h-3.5 w-3.5 shrink-0 md:h-4 md:w-4" />
        </>
      )}
    </a>
  );
}
