/** Renders form labels with optional help tooltip beside them. */
// src/shared/ui/fields/field-label.tsx
import type { ReactNode } from 'react';
import { HelpTooltip } from '../primitives/tooltip';
import { Label } from '../primitives/label';
import type { FloatingPortalContainer } from '../portal-container';

interface FieldLabelProps {
  label: string;
  labelHelp?: ReactNode | undefined;
  labelHelpDelay?: number | undefined;
  labelHelpContainer?: FloatingPortalContainer | undefined;
  className?: string | undefined;
  wrapperClassName?: string | undefined;
}

export function FieldLabel({
  label,
  labelHelp,
  labelHelpDelay,
  labelHelpContainer,
  className,
  wrapperClassName = 'flex items-center gap-2',
}: FieldLabelProps): React.JSX.Element {
  if (!labelHelp) {
    return <Label className={className}>{label}</Label>;
  }

  return (
    <div className={wrapperClassName}>
      <Label className={className}>{label}</Label>
      <HelpTooltip
        content={labelHelp}
        container={labelHelpContainer ?? null}
        delayDuration={labelHelpDelay ?? 500}
      />
    </div>
  );
}
