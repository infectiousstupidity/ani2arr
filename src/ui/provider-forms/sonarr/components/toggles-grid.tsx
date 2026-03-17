import type { SonarrFormState } from '@/shared/types';
import { SwitchField } from '@/shared/ui/form/form';
import { cn } from '@/shared/utils/cn';
import type { FieldPath, FieldPathValue } from 'react-hook-form';

type TogglesGridProps = {
  disabled: boolean;
  values: Pick<
    SonarrFormState,
    'seasonFolder' | 'searchForMissingEpisodes' | 'searchForCutoffUnmet'
  >;
  onChange: <K extends FieldPath<SonarrFormState>>(
    field: K,
    value: FieldPathValue<SonarrFormState, K>,
  ) => void;
  includeSearchToggle: boolean;
  portalContainer: HTMLElement | ShadowRoot | null;
  fullWidthClass?: string | undefined;
};

export const TogglesGrid = (props: TogglesGridProps) => {
  const { disabled, values, onChange, includeSearchToggle, portalContainer, fullWidthClass } = props;

  return (
    <div className={cn('pt-1', fullWidthClass)}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SwitchField
          label="Season Folders"
          disabled={disabled}
          checked={values.seasonFolder}
          onChange={v => onChange('seasonFolder', v)}
          labelHelp="Organize episodes into per-season subfolders created automatically."
          labelHelpDelay={600}
          labelHelpContainer={portalContainer}
        />

        {includeSearchToggle ? (
          <>
            <SwitchField
              label="Search on Add"
              disabled={disabled}
              checked={values.searchForMissingEpisodes}
              onChange={v => onChange('searchForMissingEpisodes', v)}
              labelHelp="Automatically trigger a search for any missing episodes once the series is added."
              labelHelpDelay={600}
              labelHelpContainer={portalContainer}
            />

            <SwitchField
              label="Cutoff Unmet"
              disabled={disabled}
              checked={values.searchForCutoffUnmet}
              onChange={v => onChange('searchForCutoffUnmet', v)}
              labelHelp="Trigger searches for episodes that are below the quality cutoff to find better releases."
              labelHelpDelay={600}
              labelHelpContainer={portalContainer}
            />
          </>
        ) : null}
      </div>
    </div>
  );
};
