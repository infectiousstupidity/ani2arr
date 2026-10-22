/** Seerr browser-session and API-key connection controls. */
// src/options-page/components/seerr-connection-form.tsx

import { useState, type SubmitEvent } from "react";
import { ExternalLink, KeyRound, LogIn, Plug } from "lucide-react";
import type { SeerrConnection } from "@/providers/seerr/types";
import { isPublicHttpProviderUrl } from "@/providers/settings/insecure-url";
import { useExtensionOptions } from "@/queries/options";
import {
	getSeerrConnection,
	getSeerrConnectionDraft,
} from "@/settings/seerr-config";
import Button from "@/shared/ui/primitives/button";
import { Input, PasswordInput } from "@/shared/ui/primitives/input";
import { cn } from "@/shared/utils/cn";
import type { SeerrConnectionFailure } from "../hooks/seerr-connection-actions";
import { SettingsRow, SettingsSection } from "./settings-section";
import { getSeerrSessionControl } from "./seerr-connection-state";

type SeerrConnectionMethod = SeerrConnection["auth"]["mode"];

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
		: "Connect with API key";
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
	const savedMethod: SeerrConnectionMethod = savedDraft.auth.mode;

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
			savedMethod={savedMethod}
			savedUrl={savedDraft.url}
		/>
	);
};

interface SeerrConnectionDraftProps extends SeerrConnectionFormProps {
	savedUrl: string;
	savedApiKey: string;
	savedConnection: ReturnType<typeof getSeerrConnection>;
	savedMethod: SeerrConnectionMethod;
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

function SeerrConnectionMethodFieldset(props: {
	connectionMethod: SeerrConnectionMethod;
	isConnecting: boolean;
	onChange: (method: SeerrConnectionMethod) => void;
}): React.JSX.Element {
	return (
		<fieldset aria-describedby="seerr-connection-method-description">
			<legend className="text-lg font-semibold text-text-primary">
				Connection method
			</legend>
			<p
				id="seerr-connection-method-description"
				className="mt-1 text-sm text-text-secondary"
			>
				Choose how ani2arr connects to your Seerr instance.
			</p>
			<div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
				{(
					[
						{
							method: "session",
							title: "Existing Seerr session",
							description: "Use your current Seerr session via browser.",
						},
						{
							method: "apiKey",
							title: "Global API key",
							description: "Use a global API key to connect.",
						},
					] as const
				).map((option) => (
					<label
						key={option.method}
						className={cn(
							"flex cursor-pointer select-none items-start gap-3 rounded-lg border bg-bg-secondary p-4 transition-colors hover:border-accent-primary/55 focus-within:ring-2 focus-within:ring-accent-primary",
							props.connectionMethod === option.method
								? "border-accent-primary bg-accent-primary/10"
								: "border-border-primary",
						)}
					>
						<input
							type="radio"
							name="seerr-connection-method"
							value={option.method}
							checked={props.connectionMethod === option.method}
							onChange={() => props.onChange(option.method)}
							disabled={props.isConnecting}
							className="mt-1 h-4 w-4 shrink-0 accent-accent-primary"
						/>
						<span className="min-w-0">
							<span className="flex flex-wrap items-center gap-2">
								<span className="text-sm font-semibold text-text-primary">
									{option.title}
								</span>
								{option.method === "session" ? (
									<span className="rounded-md bg-accent-primary/15 px-2 py-0.5 text-xs font-medium text-accent-primary">
										Recommended
									</span>
								) : null}
							</span>
							<span className="mt-1 block text-xs text-text-secondary">
								{option.description}
							</span>
						</span>
					</label>
				))}
			</div>
		</fieldset>
	);
}

function SeerrSessionConnectionFields(props: {
	isConnecting: boolean;
	isCsrfSupportEnabled: boolean;
	onEnableCsrfSupport: () => Promise<void>;
	savedConnection: ReturnType<typeof getSeerrConnection>;
	showCsrfSupport: boolean;
	showPublicHttpWarning: boolean;
}): React.JSX.Element {
	return (
		<>
			{props.showPublicHttpWarning ? (
				<p
					className="rounded-md border border-warning/35 bg-warning/10 px-3 py-2 text-sm font-medium text-warning"
					role="alert"
				>
					This Seerr connection uses unencrypted HTTP. Use HTTPS outside
					trusted localhost or LAN setups.
				</p>
			) : null}

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

function SeerrApiKeyConnectionFields(props: {
	draftApiKey: string;
	isConnecting: boolean;
	onApiKeyChange: (apiKey: string) => void;
	savedConnection: ReturnType<typeof getSeerrConnection>;
	showPublicHttpWarning: boolean;
}): React.JSX.Element {
	return (
		<>
			<p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
				The global Seerr API key is a privileged server credential. Do not
				share it with untrusted users.
			</p>

			<SettingsRow
				id="seerr-api-key"
				label="Global Seerr API key"
				description="Find this in Seerr Settings > General."
			>
				<PasswordInput
					id="seerr-api-key"
					value={props.draftApiKey}
					onChange={(event) => props.onApiKeyChange(event.target.value)}
					placeholder="Your Seerr API key"
					disabled={props.isConnecting}
				/>
			</SettingsRow>

			{props.showPublicHttpWarning ? (
				<p
					className="rounded-md border border-warning/35 bg-warning/10 px-3 py-2 text-sm font-medium text-warning"
					role="alert"
				>
					HTTP sends this privileged API key without transport encryption.
				</p>
			) : null}

			{props.savedConnection?.auth.mode === "apiKey" ? (
				<div className="rounded-lg border border-border-primary/50 bg-bg-tertiary/30 px-4 py-3 text-sm text-text-secondary">
					Currently connected with the global Seerr API key.
				</div>
			) : null}
		</>
	);
}

function SeerrConnectionActionRow(props: {
	apiKeyButtonLabel: string;
	connectionMethod: SeerrConnectionMethod;
	draftUrl: string;
	hasValueChanges: boolean;
	isConnecting: boolean;
	isSubmitDisabled: boolean;
	onCancel: () => void;
	onOpenLogin: (url: string) => Promise<void>;
	sessionControl: ReturnType<typeof getSeerrSessionControl> | null;
}): React.JSX.Element {
	return (
		<div className="mt-2 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
			{props.hasValueChanges ? (
				<Button
					type="button"
					variant="ghost"
					onClick={props.onCancel}
					disabled={props.isConnecting}
				>
					Cancel
				</Button>
			) : null}
			{props.sessionControl?.showLoginActions ? (
				<Button
					type="button"
					variant="outline"
					onClick={() => void props.onOpenLogin(props.draftUrl)}
					disabled={props.isConnecting || !props.draftUrl}
				>
					<ExternalLink className="mr-2 h-4 w-4" />
					Open Seerr login
				</Button>
			) : null}
			<Button
				type="submit"
				variant="primary"
				disabled={props.isSubmitDisabled}
			>
				{props.connectionMethod === "session" ? (
					<LogIn className="mr-2 h-4 w-4" />
				) : (
					<KeyRound className="mr-2 h-4 w-4" />
				)}
				{props.sessionControl?.buttonLabel ?? props.apiKeyButtonLabel}
			</Button>
		</div>
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
	savedMethod,
	savedUrl,
}: SeerrConnectionDraftProps) => {
	const [draftUrl, setDraftUrl] = useState(savedUrl);
	const [draftApiKey, setDraftApiKey] = useState(savedApiKey);
	const [connectionMethod, setConnectionMethod] = useState(savedMethod);
	const hasUrlChanges = draftUrl !== savedUrl;
	const hasValueChanges =
		draftUrl !== savedUrl || draftApiKey !== savedApiKey;
	const activeFailure =
		failure?.scope === "global" || failure?.scope === connectionMethod
			? failure
			: null;
	const sessionControl =
		connectionMethod === "session"
			? getSeerrSessionControl({
					connection: savedConnection,
					isConnecting,
					errorCode: activeFailure?.code ?? null,
					hasUrlChanges,
				})
			: null;
	const showPublicHttpWarning = isPublicHttpProviderUrl(draftUrl);
	const apiKeyButtonLabel = getSeerrApiKeyButtonLabel({
		isConnecting,
		isApiKeyConnection: savedConnection?.auth.mode === "apiKey",
	});
	const isSubmitDisabled =
		isConnecting ||
		!draftUrl ||
		(connectionMethod === "apiKey" && !draftApiKey);

	const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
		event.preventDefault();

		if (connectionMethod === "apiKey") {
			if (isConnecting || !draftUrl || !draftApiKey) return;
			await onConnectApiKey(draftUrl, draftApiKey);
			return;
		}

		if (isConnecting || !draftUrl) return;
		await onCheckSession(draftUrl);
	};

	const handleCancel = () => {
		setDraftUrl(savedUrl);
		setDraftApiKey(savedApiKey);
		setConnectionMethod(savedMethod);
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
				<SeerrConnectionMethodFieldset
					connectionMethod={connectionMethod}
					isConnecting={isConnecting}
					onChange={setConnectionMethod}
				/>

				<div className="flex flex-col gap-5 rounded-lg border border-border-primary/50 bg-bg-tertiary/15 px-4 py-5">
					<SettingsRow
						id="seerr-url"
						label="Seerr URL"
						description="The base URL of your Seerr instance."
					>
						<Input
							id="seerr-url"
							value={draftUrl}
							onChange={(event) => setDraftUrl(event.target.value)}
							placeholder="http://localhost:5055"
							disabled={isConnecting}
						/>
					</SettingsRow>

					{connectionMethod === "session" ? (
						<SeerrSessionConnectionFields
							isConnecting={isConnecting}
							isCsrfSupportEnabled={isCsrfSupportEnabled}
							onEnableCsrfSupport={onEnableCsrfSupport}
							savedConnection={savedConnection}
							showCsrfSupport={showCsrfSupport}
							showPublicHttpWarning={showPublicHttpWarning}
						/>
					) : (
						<SeerrApiKeyConnectionFields
							draftApiKey={draftApiKey}
							isConnecting={isConnecting}
							onApiKeyChange={setDraftApiKey}
							savedConnection={savedConnection}
							showPublicHttpWarning={showPublicHttpWarning}
						/>
					)}

					{activeFailure ? (
						<p
							className="rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-sm font-semibold text-error"
							role="alert"
						>
							{activeFailure.message}
						</p>
					) : null}
				</div>

				<SeerrConnectionActionRow
					apiKeyButtonLabel={apiKeyButtonLabel}
					connectionMethod={connectionMethod}
					draftUrl={draftUrl}
					hasValueChanges={hasValueChanges}
					isConnecting={isConnecting}
					isSubmitDisabled={isSubmitDisabled}
					onCancel={handleCancel}
					onOpenLogin={onOpenLogin}
					sessionControl={sessionControl}
				/>
			</form>
		</SettingsSection>
	);
};
