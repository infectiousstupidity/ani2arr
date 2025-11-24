// src/features/media-modal/components/sonarr-panel.tsx
import SonarrForm from "@/shared/components/sonarr-form";
import type { SonarrPanelProps } from "../types";

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

  if (!sonarrReady || !metadata) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-sm text-text-secondary">
        <p>Configure Sonarr to enable {mode === "edit" ? "editing" : "adding"} series.</p>
        <p className="text-xs">
          Open the extension options and provide your Sonarr URL and API key.
        </p>
      </div>
    );
  }

  const ensuredMetadata = metadata;

  return (
    <SonarrForm
      form={controller.form}
      metadata={ensuredMetadata}
      disabled={Boolean(disabled) || !sonarrReady}
      portalContainer={portalContainer ?? null}
      computedPath={controller.computedPath}
      pathHintTitle={title}
      pathHintTvdbId={tvdbId}
      includeSearchToggle
      displayRootWithSlug
      folderSlug={folderSlug ?? null}
      className="space-y-4"
    />
  );
}
