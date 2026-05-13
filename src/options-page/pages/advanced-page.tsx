/** Options-page advanced settings for diagnostics, privacy details, and full reset. */
// src/options-page/pages/advanced-page.tsx

import { useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Bug, RotateCcw, ShieldCheck, TriangleAlert } from "lucide-react";
import type { PublicOptions } from "@/settings";
import { cn } from "@/shared/utils/cn";
import { SettingsRow, SettingsSection } from "../components/settings-section";
import { ConfirmDialog } from "../components/ui/alert-dialog";
import { Button } from "../components/ui/button";
import { Switch } from "../components/ui/switch";
import { useResetExtensionState } from "../hooks/use-reset-extension-state";

export const AdvancedPage = () => {
	const { control, setValue } = useFormContext<PublicOptions>();
	const debugLogging = Boolean(
		useWatch({ control, name: "debugLogging" }),
	);
	const schedulerDebugOverlayEnabled = Boolean(
		useWatch({ control, name: "ui.schedulerDebugOverlayEnabled" }),
	);
	const [showResetDialog, setShowResetDialog] = useState(false);
	const {
		resetExtensionState,
		isResetting,
		resetError,
		resetSuccess,
	} = useResetExtensionState();

	const resetStatus = resetError
		?? (resetSuccess
			? "Settings, mappings, cached data, and permissions were reset."
			: null);

	return (
		<div className="space-y-10">
			<SettingsSection
				title="Privacy & permissions"
				description="How ani2arr stores settings, requests host access, and talks to external services."
				icon={<ShieldCheck className="h-4 w-4" />}
				divider="none"
			>
				<div className="rounded-lg border border-border-primary/40 bg-bg-tertiary/10 p-4 text-sm leading-relaxed text-text-secondary md:p-5">
					<p>
						ani2arr does not use a developer-operated backend or analytics
						service. Your Sonarr URL, Radarr URL, API keys, and extension
						settings are stored locally in the browser.
					</p>
					<ul className="mt-4 list-disc space-y-2 pl-5 text-xs leading-5">
						<li>Only the exact provider origins you enter are requested at runtime.</li>
						<li>Provider API keys are sent only to their configured provider origins.</li>
						<li>
							AniList metadata is fetched from AniList GraphQL and public mapping
							files from GitHub.
						</li>
					</ul>
					<p className="mt-4 text-xs">
						Full policy text is available in the repository privacy POLICY.md file.
					</p>
				</div>
			</SettingsSection>

			<SettingsSection
				title="Diagnostics"
				icon={<Bug className="h-4 w-4" />}
				divider="top"
			>
				<SettingsRow
					id="advanced-debug-logging"
					label="Debug logging"
					description="Enable verbose console output for troubleshooting."
					inlineOnMobile={true}
				>
					<Switch
						id="advanced-debug-logging"
						checked={debugLogging}
						onCheckedChange={(checked) =>
							setValue("debugLogging", checked, {
								shouldDirty: true,
								shouldTouch: true,
							})
						}
					/>
				</SettingsRow>

				{import.meta.env.DEV ? (
					<SettingsRow
						id="advanced-scheduler-debug-overlay"
						label="Scheduler debug overlay"
						description="Show the AniList query inspector on browse pages with aggregate totals, merge previews, and sent batch history."
						inlineOnMobile={true}
					>
						<Switch
							id="advanced-scheduler-debug-overlay"
							checked={schedulerDebugOverlayEnabled}
							onCheckedChange={(checked) =>
								setValue("ui.schedulerDebugOverlayEnabled", checked, {
									shouldDirty: true,
									shouldTouch: true,
								})
							}
						/>
					</SettingsRow>
				) : null}
			</SettingsSection>

			<SettingsSection
				title="Danger zone"
				description="Reset ani2arr local state when you need a clean extension setup."
				icon={<TriangleAlert className="h-4 w-4" />}
				divider="top"
			>
				<div className="flex flex-col gap-4 rounded-lg border border-error/20 bg-error/5 p-4 sm:flex-row sm:items-center sm:justify-between">
					<div className="min-w-0">
						<p className="mt-1 text-xs leading-relaxed text-text-secondary">
							Clears provider configuration, stored manual mappings, cached page
							data, granted permissions, and session state. Sonarr and Radarr
							libraries are not affected.
						</p>
						<div
							role="status"
							aria-live="polite"
							className={cn(
								"mt-2 min-h-4 text-xs font-medium",
								resetError ? "text-error" : "text-success",
							)}
						>
							{resetStatus}
						</div>
					</div>
					<Button
						type="button"
						variant="destructive"
						onClick={() => setShowResetDialog(true)}
						disabled={isResetting}
						className="shrink-0"
					>
						<RotateCcw className="mr-2 h-4 w-4" />
						{isResetting ? "Resetting..." : "Reset all settings"}
					</Button>
				</div>
			</SettingsSection>

			<ConfirmDialog
				open={showResetDialog}
				onOpenChange={setShowResetDialog}
				title="Reset all settings?"
				description="This clears ani2arr configuration, stored manual mappings, cached page data, granted permissions, and session state. Sonarr and Radarr libraries are not affected."
				confirmText="Reset"
				cancelText="Cancel"
				onConfirm={() => {
					void resetExtensionState();
				}}
				isDestructive={true}
			/>
		</div>
	);
};
