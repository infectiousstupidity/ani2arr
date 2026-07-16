/** Options-page advanced settings for diagnostics, privacy details, and full reset. */
// src/options-page/pages/advanced-page.tsx

import { useState } from "react";
import { Bug, RotateCcw, ShieldCheck, TriangleAlert } from "lucide-react";
import { usePublicOptions, useSavePublicOptions } from "@/queries/options";
import Button from "@/shared/ui/primitives/button";
import { cn } from "@/shared/utils/cn";
import { SettingsRow, SettingsSection } from "../components/settings-section";
import { ConfirmDialog } from "../components/ui/alert-dialog";
import { Switch } from "../components/ui/switch";
import { useResetExtensionState } from "../hooks/use-reset-extension-state";
import { getActionErrorMessage } from "../hooks/action-helpers";

export const AdvancedPage = () => {
	const { data: publicOptions } = usePublicOptions();
	const saveOptions = useSavePublicOptions();
	const [showResetDialog, setShowResetDialog] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	const {
		resetExtensionState,
		isResetting,
		resetError,
		resetSuccess,
	} = useResetExtensionState();
	const debugLogging = publicOptions?.debugLogging ?? false;

	const resetStatus = resetError
		?? (resetSuccess
			? "Settings, mappings, cached data, and permissions were reset."
			: null);
	const diagnosticsStatus = saveError;

	const updateDebugLogging = async (checked: boolean): Promise<void> => {
		if (!publicOptions || saveOptions.isPending) return;
		setSaveError(null);

		try {
			await saveOptions.mutateAsync({
				...publicOptions,
				debugLogging: checked,
			});
		} catch (error) {
			setSaveError(
				getActionErrorMessage(error, "Failed to save diagnostics setting."),
			);
		}
	};

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
						service. Provider URLs, API keys, Seerr connection mode, the
						last verified Seerr account, and extension settings are stored
						locally in the browser.
					</p>
					<ul className="mt-4 list-disc space-y-2 pl-5 text-xs leading-5">
						<li>Only the configured provider scheme and host are requested at runtime.</li>
						<li>Host permissions cannot be limited to subfolders, and Firefox cannot limit them by port.</li>
						<li>Provider API keys are sent only to their configured provider URLs. HTTP provider URLs send API keys in cleartext; use HTTPS outside trusted localhost or LAN setups.</li>
						<li>Seerr session cookies remain browser-managed; ani2arr does not store or expose their values.</li>
						<li>AniList and AniChart content UI can show provider library status, matched titles, saved defaults, root folders, quality profiles, tags, and search candidates.</li>
						<li>
							AniList metadata is fetched from AniList GraphQL and public mapping
							files from GitHub release downloads.
						</li>
					</ul>
					<p className="mt-4 text-xs">
						Full policy text is available in the repository PRIVACY.md file.
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
						disabled={saveOptions.isPending || !publicOptions}
						onCheckedChange={(checked) =>
							void updateDebugLogging(checked)
						}
					/>
				</SettingsRow>
				{diagnosticsStatus ? (
					<p className="text-sm font-semibold text-error" role="alert">
						{diagnosticsStatus}
					</p>
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
