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

  const headerTitle = mode === "edit" ? 'Update Radarr options' : 'Setup Radarr options';
  const headerDescription =
    mode === "edit"
      ? "Update configuration or move files to a new location."
      : "Choose the root folder and add options for this movie.";

  return (
    <div className="flex h-full flex-col">
      <div className="pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
              {headerTitle}
            </p>
            <p className="text-xs text-text-secondary">
              {headerDescription}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0">
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
