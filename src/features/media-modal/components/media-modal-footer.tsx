import type { ReactNode } from "react";

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

  const effectivePrimaryDisabled = primaryDisabled || primaryLoading;

  return (
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border-primary bg-bg-secondary px-6 py-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
        {leftContent}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {secondaryLabel && onSecondaryClick ? (
          <button
            type="button"
            onClick={onSecondaryClick}
            className="inline-flex items-center rounded-lg border border-border-primary bg-bg-tertiary px-3 py-2 text-sm text-text-secondary hover:bg-bg-primary"
          >
            {secondaryLabel}
          </button>
        ) : null}

        {showTertiary && tertiaryLabel && onTertiaryClick ? (
          <button
            type="button"
            onClick={onTertiaryClick}
            className="inline-flex items-center rounded-lg border border-border-primary bg-bg-secondary px-3 py-2 text-xs font-medium text-text-secondary hover:border-accent-primary hover:text-text-primary"
          >
            {tertiaryLabel}
          </button>
        ) : null}

        <button
          type="button"
          onClick={onPrimaryClick}
          disabled={effectivePrimaryDisabled}
          className={`inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium ${
            effectivePrimaryDisabled
              ? "cursor-not-allowed bg-bg-tertiary text-text-secondary/40"
              : "bg-accent-primary text-white hover:bg-accent-hover"
          }`}
        >
          {primaryLoading ? "Working..." : primaryLabel}
        </button>
      </div>
    </footer>
  );
}
