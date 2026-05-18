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
    <div className="h-24 w-16 shrink-0 overflow-hidden rounded-xl border border-border-primary/45 bg-bg-primary/18 shadow-[0_10px_24px_rgba(0,0,0,0.14)]">
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
  label: string;
}): React.JSX.Element {
  const { href, label } = props;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="absolute right-0 top-0 inline-flex h-8 w-8 items-start justify-center rounded-full pt-px text-text-secondary transition-colors hover:bg-bg-primary/25 hover:text-text-primary"
      aria-label={label}
    >
      <ExternalLink className="h-4 w-4" />
    </a>
  );
}
