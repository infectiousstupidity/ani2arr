// src/features/media-modal/components/media-modal-footer.tsx
import type { ReactNode } from "react";
import Button from "@/shared/components/button";

export type FooterProps = {
  // Left side (tab-specific)
  leftContent?: ReactNode;

  // Primary action (right side, main button)
  primaryLabel: string;
  primaryDisabled: boolean;
  primaryLoading: boolean;
  onPrimaryClick: () => void;

  // Secondary (right side, usually "Cancel")
  secondaryLabel?: string;
  onSecondaryClick?: () => void;

  // Tertiary (right side, optional, for Mapping "Revert to automatic")
  showTertiary: boolean;
  tertiaryLabel: string;
  onTertiaryClick: (() => void) | undefined;
};

export function Footer(props: FooterProps): React.JSX.Element {
  const {
    leftContent,
    primaryLabel,
    primaryDisabled = false,
    primaryLoading = false,
    onPrimaryClick,
    secondaryLabel,
    onSecondaryClick,
    showTertiary,
    tertiaryLabel,
    onTertiaryClick,
  } = props;

  return (
    <footer className="flex flex-wrap items-center justify-between gap-3 border-border-primary bg-bg-primary px-8 py-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
        {leftContent}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {secondaryLabel && onSecondaryClick ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onSecondaryClick}
          >
            {secondaryLabel}
          </Button>
        ) : null}

        {showTertiary && tertiaryLabel && onTertiaryClick ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onTertiaryClick}
            className="text-xs font-medium"
          >
            {tertiaryLabel}
          </Button>
        ) : null}

        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={onPrimaryClick}
          disabled={primaryDisabled}
          isLoading={primaryLoading}
          loadingText={primaryLabel}
          className="font-medium"
        >
          {primaryLabel}
        </Button>
      </div>
    </footer>
  );
}
