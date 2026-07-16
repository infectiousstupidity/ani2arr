/** Seerr options page section for request-backend connection settings. */
// src/options-page/pages/seerr-page.tsx

import { SeerrIcon } from "../components/icons";
import { SeerrConnectionForm } from "../components/seerr-connection-form";
import { SettingsSection } from "../components/settings-section";
import type { ErrorCode } from "@/shared/errors/error.types";

interface SeerrPageProps {
	checkSeerrSession: (url: string) => Promise<boolean>;
	connectSeerrApiKey: (url: string, apiKey: string) => Promise<boolean>;
	enableSeerrCsrfSupport: () => Promise<boolean>;
	openSeerrLogin: (url: string) => Promise<boolean>;
	isConnecting: boolean;
	isCsrfSupportEnabled: boolean;
	showCsrfSupport: boolean;
	connectionError: string | null;
	connectionErrorCode: ErrorCode | null;
}

export const SeerrPage = ({
	checkSeerrSession,
	connectSeerrApiKey,
	connectionError,
	connectionErrorCode,
	enableSeerrCsrfSupport,
	isConnecting,
	isCsrfSupportEnabled,
	openSeerrLogin,
	showCsrfSupport,
}: SeerrPageProps) => (
	<div className="space-y-10 md:space-y-12">
		<SeerrConnectionForm
			error={connectionError}
			errorCode={connectionErrorCode}
			isConnecting={isConnecting}
			isCsrfSupportEnabled={isCsrfSupportEnabled}
			onCheckSession={checkSeerrSession}
			onConnectApiKey={connectSeerrApiKey}
			onEnableCsrfSupport={enableSeerrCsrfSupport}
			onOpenLogin={openSeerrLogin}
			showCsrfSupport={showCsrfSupport}
		/>
		<SettingsSection
			title="Request behavior"
			description="ani2arr sends the smallest Seerr request and lets Seerr use its own Sonarr/Radarr defaults."
			icon={<SeerrIcon className="h-4 w-4" />}
			divider="top"
		>
			<p className="py-5 text-sm text-text-secondary">
				Seerr actions appear only when Seerr is connected and ani2arr already
				has a TMDB movie ID.
			</p>
		</SettingsSection>
	</div>
);
