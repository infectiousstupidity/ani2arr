/** Renders the media modal footer layout from direct left and right content. */
// src/features/media-modal/components/footer.tsx

import type { ReactNode } from "react";

type FooterProps = {
  left?: ReactNode;
  right: ReactNode;
};

export function Footer(props: FooterProps): React.JSX.Element {
  const { left, right } = props;

  return (
    <footer className="flex flex-wrap items-center justify-between gap-3 bg-bg-primary px-8 py-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
        {left}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {right}
      </div>
    </footer>
  );
}
