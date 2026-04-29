/** Sonarr provider-settings panel for connection state and default add options. */
// src/options-page/provider-settings/sonarr-settings-panel.tsx

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
import { useProviderConnectionCheck } from "@/providers/hooks/provider-connection.queries";
import { deriveProviderStatus } from "@/providers/hooks/provider-connection.status";
import { getAniListTitleLanguageLabel } from "@/anilist/title-preference";
import { useToast } from "@/shared/ui/feedback/toast-provider";

import {
	ProviderConnectionCard,
	ProviderConnectionStatusBadge,
	PreferredAniListTitleLanguageField,
} from "./provider-connection-card";
import type { SonarrAddOptionsFieldsLayout } from "@/components/provider-add-options/sonarr-add-options-fields";
import { SonarrDefaultsSection } from "./sonarr-defaults-section";
import { useSelectPortal } from "./use-select-portal";
import type { ExtensionOptions } from "@/options";
import { useSonarrMetadata } from "@/providers/hooks/sonarr.queries";
import { deriveProviderPanelConnectionState } from "./provider-settings-panel-state.shared";

export interface SonarrSettingsPanelProps {
	actions: SettingsActions;
	savedSettings?: ExtensionOptions;
	layout?: SonarrAddOptionsFieldsLayout;
	isLoading?: boolean;
}

const SonarrSettingsPanel: React.FC<SonarrSettingsPanelProps> = ({
	actions,
	savedSettings,
	layout,
	isLoading,
}) => {
	const methods = useFormContext<ExtensionOptions>();
	const queryClient = useQueryClient();
	const toast = useToast();

	const sonarrUrl =
		useWatch({ control: methods.control, name: "providers.sonarr.url" }) ?? "";
	const sonarrApiKey =
		useWatch({ control: methods.control, name: "providers.sonarr.apiKey" }) ??
		"";
	const preferredAniListTitleLanguage =
		useWatch({
			control: methods.control,
			name: "providers.sonarr.preferredAniListTitleLanguage",
		}) ?? "english";

	const selectPortal = useSelectPortal();

	const sonarrUrlInputRef = useRef<HTMLInputElement | null>(null);
	const [forceEditing, setForceEditing] = useState(false);
	const {
		formCredentials,
		savedCredentials,
		isEditingConnection,
		isProviderConfigured,
		hasConnectionChanges,
		metadataEnabled,
		normalizedUrl,
		shouldAutofocusUrl,
	} = useMemo(
		() =>
			deriveProviderPanelConnectionState({
				savedSettings,
				provider: "sonarr",
				url: String(sonarrUrl),
				apiKey: String(sonarrApiKey),
				forceEditing,
				isLoading: Boolean(isLoading),
			}),
		[forceEditing, isLoading, savedSettings, sonarrApiKey, sonarrUrl],
	);

	useEffect(() => {
		if (!shouldAutofocusUrl) {
			return;
		}

		sonarrUrlInputRef.current?.focus();
	}, [shouldAutofocusUrl]);
	const metadataCredentials =
		metadataEnabled && savedCredentials ? savedCredentials : null;

	const liveConnectionQuery = useProviderConnectionCheck({
		provider: "sonarr",
		enabled: metadataEnabled,
		credentials: metadataCredentials,
	});

	const metadataQuery = useSonarrMetadata({
		enabled: metadataEnabled,
		credentials: metadataCredentials,
	});

	const isCheckingProviderConnection =
		actions.sonarrTestConnectionState.isPending ||
		(metadataEnabled && liveConnectionQuery.isFetching);
	const isConnectDisabled =
		!hasConnectionChanges ||
		!formCredentials ||
		actions.connectPendingState.sonarr;
	const connectionStatus = deriveProviderStatus({
		isProviderConfigured: isProviderConfigured,
		isCheckingProviderConnection,
		isProviderConnected: liveConnectionQuery.isSuccess,
	});

	const setSonarrUrl = useCallback(
		(value: string) => {
			methods.setValue("providers.sonarr.url", value, { shouldDirty: true });
			actions.sonarrTestConnectionState.reset();
		},
		[actions.sonarrTestConnectionState, methods],
	);

	const setSonarrApiKey = useCallback(
		(value: string) => {
			methods.setValue("providers.sonarr.apiKey", value, { shouldDirty: true });
			actions.sonarrTestConnectionState.reset();
		},
		[actions.sonarrTestConnectionState, methods],
	);

	const setPreferredAniListTitleLanguage = useCallback(
		(value: typeof preferredAniListTitleLanguage) => {
			methods.setValue(
				"providers.sonarr.preferredAniListTitleLanguage",
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

		const connected = await actions.connectProvider("sonarr", formCredentials);
		if (!connected) {
			return false;
		}

		toast.showToast({
			title: "Sonarr connected",
			description:
				"Connection details and initial default add options were saved.",
			variant: "success",
		});
		return true;
	}, [actions, formCredentials, toast]);

	const handleRefresh = useCallback(() => {
		queryClient.invalidateQueries({
			queryKey: queryKeys.sonarrMetadataRoot(),
		});
	}, [queryClient]);

	const handleDisconnect = useCallback(async () => {
		const disconnected = await actions.disconnectProvider("sonarr");
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
							Connect Sonarr, then set the defaults ani2arr reuses for series
							actions.
						</p>
					</div>
					<ProviderConnectionStatusBadge status={connectionStatus} />
				</div>
				<div className="mt-4">
					<ProviderConnectionCard
						providerLabel="Sonarr"
						urlLabel="Sonarr URL"
						urlPlaceholder="http://localhost:8989"
						apiKeyLabel="Sonarr API key"
						urlHelp={
							<>
								Firefox needs an optional host permission for the exact Sonarr
								origin you enter here. ani2arr declares broad optional host
								patterns so it can request access to your specific self-hosted
								server at runtime.
							</>
						}
						apiKeyHelp={
							<>
								The API key lets ani2arr authenticate with your Sonarr server so
								it can test the connection, read metadata, and add or update
								series. It is stored only in browser local storage and sent only
								to the Sonarr origin you configure.
							</>
						}
						urlDescription="Only the exact origin you enter is requested at runtime. Saved credentials stay in browser local storage."
						urlInputRef={sonarrUrlInputRef}
						isEditingConnection={isEditingConnection}
						isConfigured={isProviderConfigured}
						url={String(sonarrUrl)}
						apiKey={String(sonarrApiKey)}
						onStartEditing={() => setForceEditing(true)}
						onConnectionConfirmed={() => setForceEditing(false)}
						onDisconnect={handleDisconnect}
						onTestConnection={handleTestConnection}
						setUrl={setSonarrUrl}
						setApiKey={setSonarrApiKey}
						testConnectionState={actions.sonarrTestConnectionState}
						isConnectDisabled={isConnectDisabled}
						isLoading={Boolean(isLoading)}
						isBusy={actions.isBusy}
						summaryFields={[
							{ label: "Sonarr URL", value: normalizedUrl || "Not configured" },
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

			<SonarrDefaultsSection
				actions={actions}
				portalContainer={selectPortal}
				metadataEnabled={metadataEnabled}
				metadataQuery={metadataQuery}
				onRefresh={handleRefresh}
				layout={layout}
			/>
		</div>
	);
};

export default memo(SonarrSettingsPanel);
