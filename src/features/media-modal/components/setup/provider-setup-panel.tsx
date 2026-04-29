/** Owns the generic provider setup shell used by Sonarr and Radarr panes. */
// src/features/media-modal/components/setup/provider-setup-panel.tsx

import type { ReactNode } from "react";

export function BaseProviderSetupPanel(props: {
	providerName: string;
	isConfigured: boolean;
	hasMetadata: boolean;
	headerDescription: string;
	statusNotice?: ReactNode;
	children: ReactNode;
}): React.JSX.Element {
	const {
		providerName,
		isConfigured,
		hasMetadata,
		headerDescription,
		statusNotice,
		children,
	} = props;

	return (
		<div className="flex h-full min-h-0 flex-col px-4 pt-2">
			<div className="shrink-0 pb-3">
				<div className="flex items-start justify-between gap-3">
					<div className="space-y-1">
						<p className="text-[11px] font-semibold leading-none uppercase tracking-[0.16em] text-text-secondary">
							{providerName} configuration
						</p>
						<p className="text-xs leading-5 text-text-secondary">
							{headerDescription}
						</p>
					</div>
				</div>
			</div>

			<div className="min-h-0 flex-1">
				{!isConfigured || !hasMetadata ? (
					<div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-sm text-text-secondary">
						<p>
							Connect {providerName} in the extension options to load provider
							metadata.
						</p>
						<p className="text-xs">
							Add your {providerName} URL and API key, then return here to
							continue.
						</p>
					</div>
				) : (
					<div className="flex h-full min-h-0 flex-col gap-3">
						{statusNotice ? (
							<div className="rounded-xl border border-border-primary/45 bg-bg-primary/35 px-3 py-2 text-xs leading-5 text-text-secondary">
								{statusNotice}
							</div>
						) : null}
						<div className="min-h-0 flex-1">{children}</div>
					</div>
				)}
			</div>
		</div>
	);
}
