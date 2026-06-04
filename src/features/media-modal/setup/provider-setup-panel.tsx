/** Owns the generic provider setup shell used by Sonarr and Radarr panes. */
// src/features/media-modal/setup/provider-setup-panel.tsx

import type { ReactNode } from "react";

export function BaseProviderSetupPanel(props: {
	providerName: string;
	isConfigured: boolean;
	hasFormResources: boolean;
	headerDescription: string;
	statusNotice?: ReactNode;
	children: ReactNode;
}): React.JSX.Element {
	const {
		providerName,
		isConfigured,
		hasFormResources,
		headerDescription,
		statusNotice,
		children,
	} = props;

	let setupContent: ReactNode;
	if (isConfigured && hasFormResources) {
		setupContent = (
			<div className="space-y-3">
				{statusNotice ? (
					<div className="rounded-xl border border-border-primary/45 bg-bg-primary/35 px-3 py-2 text-xs leading-5 text-text-secondary">
						{statusNotice}
					</div>
				) : null}
				{children}
			</div>
		);
	} else if (isConfigured) {
		setupContent = (
			<div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-sm text-text-secondary">
				<p>Loading {providerName} choices...</p>
			</div>
		);
	} else {
		setupContent = (
			<div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-sm text-text-secondary">
				<p>
					Connect {providerName} in the extension options to load provider
					choices.
				</p>
				<p className="text-xs">
					Add your {providerName} URL and API key, then return here to
					continue.
				</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col pt-2 pb-4 md:h-full md:min-h-0">
			<div className="overscroll-contain touch-pan-y md:min-h-0 md:flex-1 md:overflow-y-auto md:pr-3 md:scrollbar-gutter-stable">
				<div className="pb-3">
					<div className="flex items-start justify-between gap-3">
						<div className="space-y-1">
							<p className="text-sm font-semibold leading-none text-text-primary">
								{providerName} Configuration
							</p>
							<p className="text-xs leading-5 text-text-secondary">
								{headerDescription}
							</p>
						</div>
					</div>
				</div>

				{setupContent}
			</div>
		</div>
	);
}
