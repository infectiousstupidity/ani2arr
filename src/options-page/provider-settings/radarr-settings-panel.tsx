/** Radarr provider-settings panel for connection state and default add options. */
// src/options-page/provider-settings/radarr-settings-panel.tsx

import React, {
	memo,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/shared/queries";
import type { SettingsActions } from "../hooks/use-settings-actions";
import { getAniListTitleLanguageLabel } from "@/anilist/title-preference";
import { useToast } from "@/shared/ui/feedback/toast-provider";
import {
	deriveProviderConnectionStatusView,
	useProviderConnectionCheck,
} from "@/queries/provider-connection";
import {
	ProviderConnectionCard,
	ProviderConnectionStatusBadge,
	PreferredAniListTitleLanguageField,
} from "./provider-connection-card";
import { RadarrDefaultsSection } from "./radarr-defaults-section";
import { useSelectPortal } from "./use-select-portal";
import type { ExtensionOptions } from "@/options";
import { useRadarrFormOptions } from "@/queries/radarr";
import { deriveProviderPanelConnectionState } from "./provider-settings-panel-state.shared";

export interface RadarrSettingsPanelProps {
	actions: SettingsActions;
	savedSettings?: ExtensionOptions;
	isLoading?: boolean;
}

const RadarrSettingsPanel: React.FC<RadarrSettingsPanelProps> = ({
	actions,
	savedSettings,
	isLoading,
}) => {
	const methods = useFormContext<ExtensionOptions>();
	const queryClient = useQueryClient();
	const toast = useToast();

	const radarrUrl =
		useWatch({ control: methods.control, name: "providers.radarr.url" }) ?? "";
	const radarrApiKey =
		useWatch({ control: methods.control, name: "providers.radarr.apiKey" }) ??
		"";
	const preferredAniListTitleLanguage =
		useWatch({
			control: methods.control,
			name: "providers.radarr.preferredAniListTitleLanguage",
		}) ?? "english";

	const selectPortal = useSelectPortal();

	const radarrUrlInputRef = useRef<HTMLInputElement | null>(null);
	const [forceEditing, setForceEditing] = useState(false);
	const {
		formCredentials,
		savedCredentials,
		isEditingConnection,
		isProviderConfigured,
		hasConnectionChanges,
		formOptionsEnabled,
		normalizedUrl,
		shouldAutofocusUrl,
	} = useMemo(
		() =>
			deriveProviderPanelConnectionState({
				savedSettings,
				provider: "radarr",
				url: String(radarrUrl),
				apiKey: String(radarrApiKey),
				forceEditing,
				isLoading: Boolean(isLoading),
			}),
		[forceEditing, isLoading, radarrApiKey, radarrUrl, savedSettings],
	);

	useEffect(() => {
		if (!shouldAutofocusUrl) {
			return;
		}

		radarrUrlInputRef.current?.focus();
	}, [shouldAutofocusUrl]);
	const formOptionsCredentials =
		formOptionsEnabled && savedCredentials ? savedCredentials : null;

	const liveConnectionQuery = useProviderConnectionCheck({
		provider: "radarr",
		enabled: formOptionsEnabled,
		credentials: formOptionsCredentials,
	});

	const formOptionsQuery = useRadarrFormOptions({
		enabled: formOptionsEnabled,
		credentials: formOptionsCredentials,
	});

	const isCheckingProviderConnection =
		actions.radarrTestConnectionState.isPending ||
		(formOptionsEnabled && liveConnectionQuery.isFetching);
	const isConnectDisabled =
		!hasConnectionChanges ||
		!formCredentials ||
		actions.connectPendingState.radarr;
	const connectionStatus = deriveProviderConnectionStatusView({
		isProviderConfigured: isProviderConfigured,
		isCheckingProviderConnection,
		isProviderConnected: liveConnectionQuery.isSuccess,
	});

	const setRadarrUrl = useCallback(
		(value: string) => {
			methods.setValue("providers.radarr.url", value, { shouldDirty: true });
			actions.radarrTestConnectionState.reset();
		},
		[actions.radarrTestConnectionState, methods],
	);

	const setRadarrApiKey = useCallback(
		(value: string) => {
			methods.setValue("providers.radarr.apiKey", value, { shouldDirty: true });
			actions.radarrTestConnectionState.reset();
		},
		[actions.radarrTestConnectionState, methods],
	);

	const setPreferredAniListTitleLanguage = useCallback(
		(value: typeof preferredAniListTitleLanguage) => {
			methods.setValue(
				"providers.radarr.preferredAniListTitleLanguage",
				value,
				{ shouldDirty: true },
			);
		},
		[methods],
	);

	const handleTestConnection = useCallback(async (): Promise<boolean> => {
		if (!formCredentials) {
			return false;
		}

		const connected = await actions.connectProvider("radarr", formCredentials);
		if (!connected) {
			return false;
		}

		toast.showToast({
			title: "Radarr connected",
			description:
				"Connection details and initial default add options were saved.",
			variant: "success",
		});
		return true;
	}, [actions, formCredentials, toast]);

	const handleRefresh = useCallback(() => {
		queryClient.invalidateQueries({ queryKey: queryKeys.radarrFormOptionsRoot() });
	}, [queryClient]);

	const handleDisconnect = useCallback(async () => {
		const disconnected = await actions.disconnectProvider("radarr");
		if (!disconnected) {
			return;
		}

		setForceEditing(true);
	}, [actions]);

	if (isLoading) {
		return (
			<div className="text-center p-8 text-text-secondary">
				Loading settings...
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<section className="a2a-settings-panel p-5 md:p-6">
				<div className="a2a-settings-panel__header flex items-start justify-between gap-3 border-b pb-4">
					<div>
						<h3 className="text-base font-semibold text-text-primary">
							Connection
						</h3>
						<p className="mt-1 text-xs text-text-secondary">
							Connect Radarr, then set the defaults ani2arr reuses for movie
							actions.
						</p>
					</div>
					<ProviderConnectionStatusBadge status={connectionStatus} />
				</div>
				<div className="mt-4">
					<ProviderConnectionCard
						providerLabel="Radarr"
						urlLabel="Radarr URL"
						urlPlaceholder="http://localhost:7878"
						apiKeyLabel="Radarr API key"
						urlHelp={
							<>
								Firefox needs an optional host permission for the exact Radarr
								origin you enter here. ani2arr requests access only for the
								origin you configure at runtime.
							</>
						}
						apiKeyHelp={
							<>
								The API key lets ani2arr authenticate with your Radarr server so
								it can test the connection, read available options, and add or update
								movies. It is stored only in browser local storage and sent only
								to the Radarr origin you configure.
							</>
						}
						urlDescription="Only the exact origin you enter is requested at runtime. Saved credentials stay in browser local storage."
						urlInputRef={radarrUrlInputRef}
						isEditingConnection={isEditingConnection}
						isConfigured={isProviderConfigured}
						url={String(radarrUrl)}
						apiKey={String(radarrApiKey)}
						onStartEditing={() => setForceEditing(true)}
						onConnectionConfirmed={() => setForceEditing(false)}
						onDisconnect={handleDisconnect}
						onTestConnection={handleTestConnection}
						setUrl={setRadarrUrl}
						setApiKey={setRadarrApiKey}
						testConnectionState={actions.radarrTestConnectionState}
						isConnectDisabled={isConnectDisabled}
						isLoading={Boolean(isLoading)}
						isBusy={actions.isBusy}
						summaryFields={[
							{ label: "Radarr URL", value: normalizedUrl || "Not configured" },
							{
								label: "Preferred AniList title language",
								value: getAniListTitleLanguageLabel(
									preferredAniListTitleLanguage,
								),
							},
						]}
					>
						<PreferredAniListTitleLanguageField
							preferredAniListTitleLanguage={preferredAniListTitleLanguage}
							setPreferredAniListTitleLanguage={
								setPreferredAniListTitleLanguage
							}
							selectPortal={selectPortal}
							isDisabled={Boolean(isLoading || actions.isBusy)}
						/>
					</ProviderConnectionCard>
				</div>
			</section>

			<RadarrDefaultsSection
				actions={actions}
				portalContainer={selectPortal}
				formOptionsEnabled={formOptionsEnabled}
				formOptionsQuery={formOptionsQuery}
				onRefresh={handleRefresh}
			/>
		</div>
	);
};

export default memo(RadarrSettingsPanel);
