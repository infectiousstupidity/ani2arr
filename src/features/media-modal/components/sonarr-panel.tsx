/** Renders the Sonarr media-modal panel and its reusable add-options fields. */
// src/features/media-modal/components/sonarr-panel.tsx

import { SonarrAddOptionsFields } from '@/components/provider-add-options/sonarr-add-options-fields';

import type { SonarrPanelProps } from '../types';

export function SonarrPanel(props: SonarrPanelProps): React.JSX.Element {
  const {
    mode,
    title,
    tvdbId,
    controller,
    metadata,
    sonarrReady,
    disabled,
    portalContainer,
    folderSlug,
  } = props;

  const headerTitle = mode === "edit" ? "Manage series" : "New series setup";
  const headerDescription =
    mode === "edit"
      ? "Update configuration or move files to a new location."
      : "Choose the root folder and monitoring options for this series.";

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
        {!sonarrReady || !metadata ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-sm text-text-secondary">
            <p>Configure Sonarr to enable {mode === "edit" ? "editing" : "adding"} series.</p>
            <p className="text-xs">
              Open the extension options and provide your Sonarr URL and API key.
            </p>
          </div>
        ) : (
          <SonarrAddOptionsFields
            values={controller.current}
            metadata={metadata}
            onChange={controller.handleFieldChange}
            disabled={Boolean(disabled) || !sonarrReady}
            className="w-full rounded-xl bg-bg-secondary p-5"
            portalContainer={portalContainer ?? null}
            computedPath={controller.computedPath}
            pathHintTitle={title}
            pathHintTvdbId={tvdbId}
            includeSearchToggle
            displayRootWithSlug
            folderSlug={folderSlug ?? null}
            layout="stacked"
          />
        )}
      </div>
    </div>
  );
}
