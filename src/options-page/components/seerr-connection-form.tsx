/** Seerr browser-session and advanced API-key connection controls. */
// src/options-page/components/seerr-connection-form.tsx

import { useState, type SubmitEvent } from "react";
import { ExternalLink, KeyRound, LogIn, Plug } from "lucide-react";
import { isPublicHttpProviderUrl } from "@/providers/settings/insecure-url";
import { useExtensionOptions } from "@/queries/options";
import {
	getSeerrConnection,
	getSeerrConnectionDraft,
} from "@/settings/seerr-config";
import Button from "@/shared/ui/primitives/button";
import { Input, PasswordInput } from "@/shared/ui/primitives/input";
import type { SeerrConnectionFailure } from "../hooks/seerr-connection-actions";
import { SettingsRow, SettingsSection } from "./settings-section";
import { getSeerrSessionControl } from "./seerr-connection-state";

interface SeerrConnectionFormProps {
	onCheckSession: (url: string) => Promise<void>;
	onConnectApiKey: (url: string, apiKey: string) => Promise<void>;
	onEnableCsrfSupport: () => Promise<void>;
	onOpenLogin: (url: string) => Promise<void>;
	isConnecting: boolean;
	isCsrfSupportEnabled: boolean;
	showCsrfSupport: boolean;
	failure: SeerrConnectionFailure | null;
}

function getSeerrApiKeyButtonLabel(input: {
	isConnecting: boolean;
	isApiKeyConnection: boolean;
}): string {
	if (input.isConnecting) return "Connecting...";
	return input.isApiKeyConnection
		? "Reconnect with API key"
		: "Use global API key";
}

export const SeerrConnectionForm = ({
	failure,
	isConnecting,
	isCsrfSupportEnabled,
	onCheckSession,
	onConnectApiKey,
	onEnableCsrfSupport,
	onOpenLogin,
	showCsrfSupport,
}: SeerrConnectionFormProps) => {
	const { data: savedSettings } = useExtensionOptions();
	const savedDraft = getSeerrConnectionDraft(savedSettings);
	const savedConnection = getSeerrConnection(savedSettings);
	const savedApiKey =
		savedDraft.auth.mode === "apiKey" ? savedDraft.auth.apiKey : "";

	return (
		<SeerrConnectionDraft
			key={[
				savedDraft.url,
				savedDraft.auth.mode,
				savedApiKey,
				savedDraft.account?.id ?? "",
			].join("\u0000")}
			failure={failure}
			isConnecting={isConnecting}
			onCheckSession={onCheckSession}
			onConnectApiKey={onConnectApiKey}
			onEnableCsrfSupport={onEnableCsrfSupport}
			onOpenLogin={onOpenLogin}
			isCsrfSupportEnabled={isCsrfSupportEnabled}
			showCsrfSupport={showCsrfSupport}
			savedApiKey={savedApiKey}
			savedConnection={savedConnection}
			savedUrl={savedDraft.url}
		/>
	);
};

interface SeerrConnectionDraftProps extends SeerrConnectionFormProps {
	savedUrl: string;
	savedApiKey: string;
	savedConnection: ReturnType<typeof getSeerrConnection>;
}

function SeerrCsrfSupportPanel(props: {
	isEnabled: boolean;
	isConnecting: boolean;
	onEnable: () => Promise<void>;
}): React.JSX.Element {
	return (
		<div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3">
			<p className="text-sm font-semibold text-warning">
				Seerr CSRF protection detected
			</p>
			<p className="mt-1 text-xs text-text-secondary">
				Allow ani2arr to read only the configured server&apos;s readable
				XSRF-TOKEN cookie. The HTTP-only session cookie is never read.
			</p>
			{props.isEnabled ? (
				<p className="mt-3 text-sm font-semibold text-success">
					CSRF support enabled. Return to AniList or AniChart and retry the
					request.
				</p>
			) : (
				<div className="mt-3 flex justify-end">
					<Button
						type="button"
						variant="outline"
						onClick={() => void props.onEnable()}
						disabled={props.isConnecting}
					>
						Enable CSRF support
					</Button>
				</div>
			)}
		</div>
	);
}

function SeerrSessionFeedback(props: {
	savedConnection: ReturnType<typeof getSeerrConnection>;
	failure: SeerrConnectionFailure | null;
	showCsrfSupport: boolean;
	isCsrfSupportEnabled: boolean;
	isConnecting: boolean;
	onEnableCsrfSupport: () => Promise<void>;
}): React.JSX.Element {
	return (
		<>
			{props.savedConnection?.auth.mode === "session" ? (
				<div className="rounded-lg border border-success/25 bg-success/5 px-4 py-3">
					<p className="text-sm font-semibold text-text-primary">
						Connected as {props.savedConnection.account?.displayName}
					</p>
					<p className="mt-1 text-xs text-text-secondary">
						Using your existing Seerr browser login. ani2arr does not store
						the session cookie.
					</p>
				</div>
			) : null}

			{props.savedConnection?.auth.mode === "apiKey" ? (
				<div className="rounded-lg border border-border-primary/50 bg-bg-tertiary/30 px-4 py-3 text-sm text-text-secondary">
					Currently connected with the global Seerr API key. Check the browser
					session above to switch to user-scoped requests.
				</div>
			) : null}

			{props.failure ? (
				<p
					className="rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-sm font-semibold text-error"
					role="alert"
				>
					{props.failure.message}
				</p>
			) : null}

			{props.showCsrfSupport &&
			props.savedConnection?.auth.mode === "session" ? (
				<SeerrCsrfSupportPanel
					isEnabled={props.isCsrfSupportEnabled}
					isConnecting={props.isConnecting}
					onEnable={props.onEnableCsrfSupport}
				/>
			) : null}
		</>
	);
}

const SeerrConnectionDraft = ({
	failure,
	isConnecting,
	isCsrfSupportEnabled,
	onCheckSession,
	onConnectApiKey,
	onEnableCsrfSupport,
	onOpenLogin,
	showCsrfSupport,
	savedApiKey,
	savedConnection,
	savedUrl,
}: SeerrConnectionDraftProps) => {
	const [draftUrl, setDraftUrl] = useState(savedUrl);
	const [draftApiKey, setDraftApiKey] = useState(savedApiKey);
	const hasUrlChanges = draftUrl !== savedUrl;
	const hasApiKeyChanges = draftApiKey !== savedApiKey;
	const sessionControl = getSeerrSessionControl({
		connection: savedConnection,
		isConnecting,
		errorCode: failure?.code ?? null,
		hasUrlChanges,
	});
	const showPublicHttpWarning = isPublicHttpProviderUrl(draftUrl);
	const apiKeyButtonLabel = getSeerrApiKeyButtonLabel({
		isConnecting,
		isApiKeyConnection: savedConnection?.auth.mode === "apiKey",
	});

	const handleSessionSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (isConnecting || !draftUrl) return;
		await onCheckSession(draftUrl);
	};

	const handleApiKeySubmit = async (event: SubmitEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (isConnecting || !draftUrl || !draftApiKey) return;
		await onConnectApiKey(draftUrl, draftApiKey);
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
				onSubmit={(event) => void handleSessionSubmit(event)}
				className="flex flex-col gap-6"
			>
				<SettingsRow
					id="seerr-url"
					label="Seerr URL"
					description="Hostname, IP address, or reverse-proxy base path."
				>
					<Input
						id="seerr-url"
						value={draftUrl}
						onChange={(event) => setDraftUrl(event.target.value)}
						placeholder="http://localhost:5055"
						disabled={isConnecting}
					/>
				</SettingsRow>

				{showPublicHttpWarning ? (
					<p
						className="rounded-md border border-warning/35 bg-warning/10 px-3 py-2 text-sm font-medium text-warning"
						role="alert"
					>
						This Seerr connection uses unencrypted HTTP. Use HTTPS outside
						trusted localhost or LAN setups.
					</p>
				) : null}

				<SeerrSessionFeedback
					savedConnection={savedConnection}
					failure={failure}
					showCsrfSupport={showCsrfSupport}
					isCsrfSupportEnabled={isCsrfSupportEnabled}
					isConnecting={isConnecting}
					onEnableCsrfSupport={onEnableCsrfSupport}
				/>

				<div className="mt-2 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
					{hasUrlChanges ? (
						<Button
							type="button"
							variant="ghost"
							onClick={handleCancel}
							disabled={isConnecting}
						>
							Cancel
						</Button>
					) : null}
					{sessionControl.showLoginActions ? (
						<Button
							type="button"
							variant="outline"
							onClick={() => void onOpenLogin(draftUrl)}
							disabled={isConnecting || !draftUrl}
						>
							<ExternalLink className="mr-2 h-4 w-4" />
							Open Seerr login
						</Button>
					) : null}
					<Button
						type="submit"
						variant="primary"
						disabled={isConnecting || !draftUrl}
					>
						<LogIn className="mr-2 h-4 w-4" />
						{sessionControl.buttonLabel}
					</Button>
				</div>
			</form>

			<details
				defaultOpen={savedConnection?.auth.mode === "apiKey"}
				className="rounded-lg border border-border-primary/50 bg-bg-tertiary/15"
			>
				<summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-text-primary">
					Advanced connection
				</summary>
				<div className="border-t border-border-primary/40 px-4 py-5">
					<div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
						The global Seerr API key acts as a privileged server credential.
						Do not give it to untrusted users.
					</div>

					<form
						onSubmit={(event) => void handleApiKeySubmit(event)}
						className="mt-5 flex flex-col gap-5"
					>
						<SettingsRow
							id="seerr-api-key"
							label="Global Seerr API key"
							description="Find this in Seerr Settings > General."
						>
							<PasswordInput
								id="seerr-api-key"
								value={draftApiKey}
								onChange={(event) => setDraftApiKey(event.target.value)}
								placeholder="Your Seerr API key"
								disabled={isConnecting}
							/>
						</SettingsRow>

						{showPublicHttpWarning ? (
							<p
								className="rounded-md border border-warning/35 bg-warning/10 px-3 py-2 text-sm font-medium text-warning"
								role="alert"
							>
								HTTP sends this privileged API key without transport
								encryption.
							</p>
						) : null}

						<div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
							{hasUrlChanges || hasApiKeyChanges ? (
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
								variant="outline"
								disabled={isConnecting || !draftUrl || !draftApiKey}
							>
								<KeyRound className="mr-2 h-4 w-4" />
								{apiKeyButtonLabel}
							</Button>
						</div>
					</form>
				</div>
			</details>
		</SettingsSection>
	);
};
