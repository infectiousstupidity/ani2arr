/** Renders the Radarr setup surface used by the media modal action area. */
// src/features/media-modal/components/radarr-panel.tsx

import { RadarrAddOptionsFields } from '@/components/provider-add-options/radarr-add-options-fields';

import type { RadarrPanelProps } from '../types';

export function RadarrPanel(props: RadarrPanelProps): React.JSX.Element {
  const {
    mode,
    controller,
    metadata,
    radarrReady,
    disabled,
    portalContainer,
    folderSlug,
  } = props;

  const headerTitle = 'Radarr configuration';
  const headerDescription =
    mode === "edit"
      ? 'Update the folder and quality settings for this source match.'
      : 'Choose the root folder and add options for this movie.';

  return (
    <div className="flex h-full min-h-0 flex-col px-4 pt-2">
      <div className="shrink-0 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold leading-none uppercase tracking-[0.16em] text-text-secondary">
              {headerTitle}
            </p>
            <p className="text-xs leading-5 text-text-secondary">
              {headerDescription}
            </p>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {!radarrReady || !metadata ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-sm text-text-secondary">
            <p>Configure Radarr to enable {mode === "edit" ? "editing" : "adding"} movies.</p>
            <p className="text-xs">
              Open the extension options and provide your Radarr URL and API key.
            </p>
          </div>
        ) : (
          <RadarrAddOptionsFields
            values={controller.current}
            metadata={metadata}
            onChange={controller.handleFieldChange}
            disabled={Boolean(disabled) || !radarrReady}
            portalContainer={portalContainer ?? null}
            computedPath={controller.computedPath}
            displayRootWithSlug
            folderSlug={folderSlug ?? null}
            layout="stacked"
          />
        )}
      </div>
    </div>
  );
}
