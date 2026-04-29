/** Owns the modal's right-side tabs and details/logs composition. */
// src/features/media-modal/components/details/details-panel.tsx

import { useState } from "react";
import type { AniListId } from "@/anilist";
import type { MappingDetailsPayload } from "@/mapping/queries/mapping-details";
import type { MappingSearchResult } from "@/features/media-modal/mapping-search/types";
import type { Provider } from "@/providers";
import { useMediaModalContext } from "../../context";
import { MappingInspectionLogs } from "./logs-tab";
import { MappingPreviewDetails } from "./details-tab";

type MappingInspectionQuery = {
  data: MappingDetailsPayload | undefined;
  error: unknown;
  isPending: boolean;
};

type RightPanelTab = "details" | "logs";

export type DetailsPanelProps = {
  anilistId: AniListId;
  effectiveMapping: MappingSearchResult | null;
  previewMapping: MappingSearchResult | null;
  isInMappingMode: boolean;
  inspectionQuery: MappingInspectionQuery;
  onClearPreview: () => void;
};

function getRightPanelHeading(
  providerLabel: Capitalize<Provider>,
  isInMappingMode: boolean,
): string {
  return isInMappingMode
    ? `PREVIEWING ${providerLabel.toUpperCase()} MATCH`
    : "CURRENT TARGET DETAILS";
}

function TabButton(props: {
  tab: RightPanelTab;
  activeTab: RightPanelTab;
  onTabChange: (tab: RightPanelTab) => void;
  children: React.ReactNode;
}): React.JSX.Element {
  const { tab, activeTab, onTabChange, children } = props;
  const isActive = activeTab === tab;

  return (
    <button
      type="button"
      onClick={() => onTabChange(tab)}
      className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] transition-colors ${
        isActive
          ? "bg-bg-primary text-text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
          : "text-text-secondary hover:text-text-primary"
      }`}
      aria-pressed={isActive}
    >
      {children}
    </button>
  );
}

export function DetailsPanel(props: DetailsPanelProps): React.JSX.Element {
  const {
    anilistId,
    effectiveMapping,
    previewMapping,
    isInMappingMode,
    inspectionQuery,
    onClearPreview,
  } = props;
  const { provider, providerLabel } = useMediaModalContext();
  const [activeTab, setActiveTab] = useState<RightPanelTab>("details");
  const showPreviewReset = isInMappingMode && Boolean(previewMapping);
  const headingLabel = getRightPanelHeading(providerLabel, isInMappingMode);
  const inspection = inspectionQuery.data ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl bg-bg-secondary/34 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
      <div className="flex shrink-0 items-end justify-between gap-3 pb-4">
        <p className="text-[11px] font-semibold leading-none tracking-[0.16em] text-text-secondary uppercase">
          {headingLabel}
        </p>

        <div className="inline-flex rounded-full border border-border-primary/50 bg-bg-primary/20 p-1">
          <TabButton tab="details" activeTab={activeTab} onTabChange={setActiveTab}>
            Details
          </TabButton>
          <TabButton tab="logs" activeTab={activeTab} onTabChange={setActiveTab}>
            Logs
          </TabButton>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {activeTab === "details" ? (
          <MappingPreviewDetails
            aniListEntryId={anilistId}
            effectiveMapping={effectiveMapping}
            previewMapping={previewMapping}
            isInMappingMode={isInMappingMode}
            showResetPreview={showPreviewReset}
            onResetPreview={onClearPreview}
            linkedAniListEntries={inspection?.linkedAniListEntries ?? []}
          />
        ) : (
          <div className="min-h-0 overflow-y-auto pr-1">
            {inspectionQuery.isPending && !inspection ? (
              <div className="rounded-xl bg-bg-secondary/35 px-3 py-6 text-sm text-text-secondary">
                Loading mapping diagnostics...
              </div>
            ) : null}

            {inspectionQuery.error && !inspection ? (
              <div className="rounded-xl bg-warning/8 px-3 py-4 text-sm text-text-secondary">
                Mapping diagnostics are unavailable right now.
              </div>
            ) : null}

            {inspection ? <MappingInspectionLogs inspection={inspection} provider={provider} /> : null}
          </div>
        )}
      </div>
    </div>
  );
}
