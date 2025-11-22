// src/features/media-modal/tabs/sonarr-tab/sonarr-tab-layout.tsx
import SonarrForm from "@/shared/components/sonarr-form";
import type { SonarrTabMode, SonarrTabProps } from ".";
import type { UseSonarrTabControllerResult } from "./hooks/use-sonarr-tab-controller";

export interface SonarrTabLayoutProps {
  mode: SonarrTabMode;
  title: string;
  tvdbId: number | null;
  controller: UseSonarrTabControllerResult;
  metadata: SonarrTabProps["metadata"];
  sonarrReady: boolean;
  disabled?: boolean;
  portalContainer?: HTMLElement | ShadowRoot | null;
}

export function SonarrTabLayout(props: SonarrTabLayoutProps): React.JSX.Element {
  const { mode, title, tvdbId, controller, metadata, sonarrReady, disabled, portalContainer } = props;

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
    <div className="space-y-4">
      <SonarrForm
        form={controller.form}
        metadata={ensuredMetadata}
        disabled={disabled || !sonarrReady}
        portalContainer={portalContainer ?? null}
        computedPath={controller.computedPath}
        pathHintTitle={title}
        pathHintTvdbId={tvdbId}
        className="space-y-4"
      />
    </div>
  );
}
