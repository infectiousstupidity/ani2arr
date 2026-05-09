/** Owns shared provider settings save/connect helpers for options-page hooks. */
// src/options-page/hooks/provider-settings-actions.shared.ts

import type { Dispatch, SetStateAction } from "react";
import type { QueryClient } from "@tanstack/react-query";
import {
	createDefaultExtensionOptions,
	parseExtensionOptions,
	normalizeProviderConnectionInput,
	normalizeProviderConnectionSettings,
	type ExtensionOptions,
	type NormalizedProviderConnection,
} from "@/settings";
import { getProviderLabel } from "@/providers/provider-labels";
import {
	PROVIDERS,
	type Provider,
	type ProviderCredentials,
} from "@/providers";
import {
	removeProviderHostPermission,
	requestProviderHostPermission,
} from "@/providers/settings/host-permissions";
import { logger } from "@/shared/utils/logger";
import {
	notifyProviderConnectionChanged,
	type ProviderConnectionChangeInput,
} from "../provider-settings-effects";

export type ProviderTestConnectionState = {
	mutateAsync(input: {
		provider: Provider;
		credentials: ProviderCredentials;
	}): Promise<{ version: string }>;
	reset(): void;
};

export type ProviderConnectionState = {
	current: NormalizedProviderConnection | null;
	previous: NormalizedProviderConnection | null;
};

export type ProviderStateSnapshot = ProviderConnectionState & {
	provider: Provider;
	changed: boolean;
};

function serializeSettings(settings: ExtensionOptions | undefined): string {
	return JSON.stringify(
		parseExtensionOptions(settings ?? createDefaultExtensionOptions()),
	);
}

export function hasConnectionChanged(
	current: NormalizedProviderConnection | null,
	previous: NormalizedProviderConnection | null,
): boolean {
	return (
		(current?.url ?? "") !== (previous?.url ?? "") ||
		(current?.apiKey ?? "") !== (previous?.apiKey ?? "")
	);
}

export function hasPermissionChanged(
	current: NormalizedProviderConnection | null,
	previous: NormalizedProviderConnection | null,
): boolean {
	return (
		(current?.permissionPattern ?? null) !==
		(previous?.permissionPattern ?? null)
	);
}

export function buildNormalizedProviderSettings<P extends Provider>(
	previousSettings: ExtensionOptions,
	nextSettings: ExtensionOptions,
	provider: P,
	connection: NormalizedProviderConnection | null,
): ExtensionOptions["providers"][P] {
	return {
		...previousSettings.providers[provider],
		...nextSettings.providers[provider],
		url: connection?.url ?? "",
		apiKey: connection?.apiKey ?? "",
	};
}

export function mergeProviderSettingsIntoForm<P extends Provider>(
	currentSettings: ExtensionOptions,
	provider: P,
	providerSettings: ExtensionOptions["providers"][P],
): ExtensionOptions {
	return {
		...currentSettings,
		providers: {
			...currentSettings.providers,
			[provider]: providerSettings,
		},
	};
}

export function hasUnsavedSettingsChanges(
	currentSettings: ExtensionOptions | undefined,
	savedSettings: ExtensionOptions | undefined,
): boolean {
	return (
		serializeSettings(currentSettings) !== serializeSettings(savedSettings)
	);
}

export function shouldResetSettingsFormFromSavedSnapshot(
	currentSettings: ExtensionOptions | undefined,
	previousSavedSettings: ExtensionOptions | undefined,
): boolean {
	return !hasUnsavedSettingsChanges(currentSettings, previousSavedSettings);
}

export function credentialsMatchSaved(
	current: ProviderCredentials | null,
	saved: ProviderCredentials | null,
): boolean {
	return (
		current !== null &&
		saved !== null &&
		current.url === saved.url &&
		current.apiKey === saved.apiKey
	);
}

export function shouldEnableProviderFormOptions(input: {
	savedCredentials: ProviderCredentials | null;
	formCredentials: ProviderCredentials | null;
	isEditingConnection: boolean;
}): boolean {
	const { savedCredentials, formCredentials, isEditingConnection } = input;
	if (savedCredentials === null) {
		return false;
	}

	return (
		!isEditingConnection ||
		credentialsMatchSaved(formCredentials, savedCredentials)
	);
}

export function getNormalizedConnectionOrSetError(
	setSaveError: Dispatch<SetStateAction<string | null>>,
	settings: ExtensionOptions,
	provider: Provider,
): NormalizedProviderConnection | null | undefined {
	try {
		return normalizeProviderConnectionSettings(settings, provider);
	} catch (error) {
		setSaveError(
			error instanceof Error
				? error.message
				: "Please review the configured provider settings.",
		);
		return undefined;
	}
}

export function normalizeConnectionInputOrSetError(
	setSaveError: Dispatch<SetStateAction<string | null>>,
	input: Partial<ProviderCredentials> | undefined,
	provider: Provider,
): NormalizedProviderConnection | undefined {
	try {
		const normalized = normalizeProviderConnectionInput(input, provider);
		if (!normalized) {
			setSaveError(
				`Please enter a valid ${getProviderLabel(provider)} URL and API key.`,
			);
			return undefined;
		}
		return normalized;
	} catch (error) {
		setSaveError(
			error instanceof Error
				? error.message
				: "Please review the configured provider settings.",
		);
		return undefined;
	}
}

export function getProviderTestState(
	provider: Provider,
	sonarrTestConnectionState: ProviderTestConnectionState,
	radarrTestConnectionState: ProviderTestConnectionState,
): ProviderTestConnectionState {
	return provider === "sonarr"
		? sonarrTestConnectionState
		: radarrTestConnectionState;
}

export function resetProviderTestState(
	provider: Provider,
	sonarrTestConnectionState: ProviderTestConnectionState,
	radarrTestConnectionState: ProviderTestConnectionState,
): void {
	getProviderTestState(
		provider,
		sonarrTestConnectionState,
		radarrTestConnectionState,
	).reset();
}

export async function testProviderConnectionOrSetError(input: {
	provider: Provider;
	credentials: ProviderCredentials;
	sonarrTestConnectionState: ProviderTestConnectionState;
	radarrTestConnectionState: ProviderTestConnectionState;
	setSaveError: Dispatch<SetStateAction<string | null>>;
}): Promise<{ version: string } | null> {
	const {
		provider,
		credentials,
		sonarrTestConnectionState,
		radarrTestConnectionState,
		setSaveError,
	} = input;

	try {
		return await getProviderTestState(
			provider,
			sonarrTestConnectionState,
			radarrTestConnectionState,
		).mutateAsync({ provider, credentials });
	} catch (error) {
		logger.error(
			`${getProviderLabel(provider)} connection test failed.`,
			error,
		);
		setSaveError(
			"Connection test failed. Please check your Arr URLs and API keys.",
		);
		return null;
	}
}

export async function requestPermissionIfNeededOrSetError(
	provider: Provider,
	current: NormalizedProviderConnection | null,
	previous: NormalizedProviderConnection | null,
	setSaveError: Dispatch<SetStateAction<string | null>>,
): Promise<boolean> {
	if (!current || !hasPermissionChanged(current, previous)) {
		return true;
	}

	const hostPermission = await requestProviderHostPermission(current.url);
	if (!hostPermission.ok) {
		logger.warn(
			`${getProviderLabel(provider)} permission request failed.`,
			hostPermission.error,
		);
		setSaveError(hostPermission.error);
		return false;
	}

	if (!hostPermission.value.granted) {
		setSaveError(
			`${getProviderLabel(provider)} host permission was not granted.`,
		);
		return false;
	}

	return true;
}

export async function requestPermissionForCredentialsOrSetError(
	provider: Provider,
	credentials: ProviderCredentials,
	setSaveError: Dispatch<SetStateAction<string | null>>,
): Promise<boolean> {
	const providerLabel = getProviderLabel(provider);
	const hostPermission = await requestProviderHostPermission(credentials.url);

	if (!hostPermission.ok) {
		logger.warn(
			`${providerLabel} permission request failed, aborting connection test.`,
			hostPermission.error,
		);
		setSaveError(hostPermission.error);
		return false;
	}

	if (!hostPermission.value.granted) {
		logger.warn(
			`${providerLabel} permission denied, aborting connection test.`,
		);
		setSaveError(`${providerLabel} host permission was not granted.`);
		return false;
	}

	return true;
}

export async function cleanupPreviousPermission(
	provider: Provider,
	previous: NormalizedProviderConnection | null,
	currentSettings: ExtensionOptions,
	context: "save" | "disconnect" = "save",
): Promise<void> {
	if (!previous) {
		return;
	}

	const activePermissionPatterns = new Set(
		PROVIDERS.map((configuredProvider) =>
			normalizeProviderConnectionSettings(currentSettings, configuredProvider),
		)
			.filter((connection) => connection !== null)
			.map((connection) => connection.permissionPattern),
	);

	if (activePermissionPatterns.has(previous.permissionPattern)) {
		return;
	}

	const providerLabel = getProviderLabel(provider);
	const hostPermissionRemoval = await removeProviderHostPermission(
		previous.url,
	);
	if (!hostPermissionRemoval.ok) {
		logger.warn(
			context === "disconnect"
				? `Failed to remove ${providerLabel} host permission during disconnect.`
				: `Failed to remove previous ${providerLabel} host permission after provider save.`,
			hostPermissionRemoval.error,
		);
		return;
	}

	if (!hostPermissionRemoval.value.removed) {
		logger.warn(
			context === "disconnect"
				? `${providerLabel} host permission removal was rejected during disconnect.`
				: `Previous ${providerLabel} host permission removal was rejected after provider save.`,
		);
	}
}

export async function notifyProviderChanges(
	queryClient: QueryClient,
	input: ProviderConnectionChangeInput,
	setSaveError: Dispatch<SetStateAction<string | null>>,
): Promise<boolean> {
	return notifyProviderConnectionChanged(queryClient, input, (message) => {
		setSaveError(message);
	});
}
