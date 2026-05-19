/** Skeleton options page for manual mapping diagnostics and future mapping tools. */
// src/options-page/pages/mapping-page.tsx

import { Zap } from "lucide-react";
import { SettingsSection } from "../components/settings-section";

/*
Move mapping diagnostics here when the mapping page becomes real:
- current context: AniList ID, provider, provider ID, row status, entry kind,
  source, reason, resolver outcome, suppression, and library status.
- explanation records formerly shown by the media modal diagnostics tab.
- review state: needs-review summary, reasons, current/proposed provider IDs.
- loading/error states for mapping inspection payloads.
Do not duplicate linked AniList entries here; they stay user-facing in the
media modal details pane.
*/

export const MappingsPage = (): React.JSX.Element => (
	<SettingsSection
		title="Manual mappings"
		description="Mapping review and diagnostics will live here instead of inside add/edit modals."
		icon={<Zap className="h-4 w-4" />}
		divider="none"
	>
		<div className="rounded-lg border border-border-primary bg-bg-secondary p-4 text-sm text-text-secondary">
			<p className="text-text-primary">Mapping tools coming in a later pass.</p>
		</div>
	</SettingsSection>
);
