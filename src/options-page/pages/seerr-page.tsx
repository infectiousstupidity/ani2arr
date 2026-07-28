/** Seerr options page section for request-backend connection settings. */
// src/options-page/pages/seerr-page.tsx

import { SeerrIcon } from "@/features/provider-ui/provider-icons";
import { SeerrConnectionForm } from "../components/seerr-connection-form";
import { SettingsSection } from "../components/settings-section";
import type { SeerrConnectionFailure } from "../hooks/seerr-connection-actions";

interface SeerrPageProps {
	checkSeerrSession: (url: string) => Promise<void>;
	connectSeerrApiKey: (url: string, apiKey: string) => Promise<void>;
	enableSeerrCsrfSupport: () => Promise<void>;
	openSeerrLogin: (url: string) => Promise<void>;
	isConnecting: boolean;
	isCsrfSupportEnabled: boolean;
	showCsrfSupport: boolean;
	connectionFailure: SeerrConnectionFailure | null;
}

export const SeerrPage = ({
	checkSeerrSession,
	connectSeerrApiKey,
	connectionFailure,
	enableSeerrCsrfSupport,
	isConnecting,
	isCsrfSupportEnabled,
	openSeerrLogin,
	showCsrfSupport,
}: SeerrPageProps) => (
	<div className="space-y-10 md:space-y-12">
		<SeerrConnectionForm
			failure={connectionFailure}
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
				has a TMDb movie ID.
			</p>
		</SettingsSection>
	</div>
);
