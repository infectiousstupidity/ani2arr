/** Shared provider connection draft fields for the options page. */
// src/options-page/components/provider-connection-form.tsx

import { useState, type SubmitEvent } from "react";
import { Plug } from "lucide-react";
import { isPublicHttpProviderUrl } from "@/providers/settings/insecure-url";
import type { Provider } from "@/providers/types";
import { useExtensionOptions } from "@/queries/options";
import {
	getProviderConnectionDraft,
	hasConfiguredProviderCredentials,
} from "@/settings/provider-config";
import Button from "@/shared/ui/primitives/button";
import { Input, PasswordInput } from "@/shared/ui/primitives/input";
import { SettingsRow, SettingsSection } from "./settings-section";

interface ProviderConnectionFormProps {
	provider: Provider;
	label: string;
	urlPlaceholder: string;
	onConnect: (url: string, apiKey: string) => Promise<boolean>;
	isConnecting: boolean;
	error: string | null;
}

export const ProviderConnectionForm = ({
	error,
	isConnecting,
	label,
	onConnect,
	provider,
	urlPlaceholder,
}: ProviderConnectionFormProps) => {
	const { data: savedSettings } = useExtensionOptions();
	const savedCredentials = getProviderConnectionDraft(savedSettings, provider);

	const savedUrl = savedCredentials.url;
	const savedApiKey = savedCredentials.apiKey;
	const isConfigured = hasConfiguredProviderCredentials(
		savedSettings,
		provider,
	);

	return (
		<ProviderConnectionDraft
			key={`${savedUrl}\u0000${savedApiKey}`}
			error={error}
			isConfigured={isConfigured}
			isConnecting={isConnecting}
			label={label}
			onConnect={onConnect}
			provider={provider}
			savedApiKey={savedApiKey}
			savedUrl={savedUrl}
			urlPlaceholder={urlPlaceholder}
		/>
	);
};

interface ProviderConnectionDraftProps extends ProviderConnectionFormProps {
	savedUrl: string;
	savedApiKey: string;
	isConfigured: boolean;
}

const ProviderConnectionDraft = ({
	error,
	isConfigured,
	isConnecting,
	label,
	onConnect,
	provider,
	savedApiKey,
	savedUrl,
	urlPlaceholder,
}: ProviderConnectionDraftProps) => {
	const [draftUrl, setDraftUrl] = useState(savedUrl);
	const [draftApiKey, setDraftApiKey] = useState(savedApiKey);
	const hasDraftChanges = draftUrl !== savedUrl || draftApiKey !== savedApiKey;
	const showConnectionActions = !isConfigured || hasDraftChanges || Boolean(error);
	const showPublicHttpWarning = isPublicHttpProviderUrl(draftUrl);
	let connectButtonLabel = "Connect and save";

	if (isConnecting) {
		connectButtonLabel = "Connecting...";
	} else if (isConfigured) {
		connectButtonLabel = "Reconnect";
	}

	const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
		event.preventDefault();

		if (isConnecting || !draftUrl || !draftApiKey) {
			return;
		}

		await onConnect(draftUrl, draftApiKey);
	};

	const handleCancel = () => {
		setDraftUrl(savedUrl);
		setDraftApiKey(savedApiKey);
	};

	return (
		<SettingsSection
			title="Connection"
			icon={<Plug className="h-4 w-4" />}
			hideHeaderOnDesktop
		>
			<form
				onSubmit={(event) => void handleSubmit(event)}
				className="flex flex-col gap-6"
			>
				<SettingsRow
					id={`${provider}-url`}
					label={`${label} URL`}
					description="Hostname or IP address."
				>
					<Input
						id={`${provider}-url`}
						value={draftUrl}
						onChange={(event) => setDraftUrl(event.target.value)}
						placeholder={urlPlaceholder}
						disabled={isConnecting}
					/>
				</SettingsRow>

				{showPublicHttpWarning ? (
					<p
						className="rounded-md border border-warning/35 bg-warning/10 px-3 py-2 text-sm font-medium text-warning"
						role="alert"
					>
						This sends your API key over unencrypted HTTP. Anyone between your
						browser and this server may read it.
					</p>
				) : null}

				<SettingsRow
					id={`${provider}-api-key`}
					label={`${label} API Key`}
					description={`Find this in ${label}'s Settings > General.`}
				>
					<PasswordInput
						id={`${provider}-api-key`}
						value={draftApiKey}
						onChange={(event) => setDraftApiKey(event.target.value)}
						placeholder={`Your ${label} API key`}
						disabled={isConnecting}
					/>
				</SettingsRow>

				{showConnectionActions ? (
					<div className="mt-2 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
						{error ? (
							<p className="text-sm font-semibold text-error sm:mr-auto">
								{error}
							</p>
						) : null}
						{isConfigured && hasDraftChanges ? (
							<Button
								type="button"
								variant="ghost"
								onClick={handleCancel}
								disabled={isConnecting}
							>
								Cancel
							</Button>
						) : null}
						<Button
							type="submit"
							variant="primary"
							disabled={isConnecting || !draftUrl || !draftApiKey}
						>
							{connectButtonLabel}
						</Button>
					</div>
				) : null}
			</form>
		</SettingsSection>
	);
};
