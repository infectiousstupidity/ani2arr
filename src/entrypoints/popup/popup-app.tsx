/** Popup quick settings surface for provider status and UI visibility toggles. */
// src/entrypoints/popup/popup-app.tsx

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { browser } from "wxt/browser";
import { PROVIDERS, type Provider } from "@/providers";
import { getProviderLabel } from "@/providers/provider-labels";
import {
	useProviderConnectionStatus,
	type ProviderConnectionStatusView,
} from "@/queries/provider-connection";
import {
	useExtensionOptions,
	useOptionsQuerySync,
	usePublicOptions,
	useSavePublicOptions,
} from "@/queries/options";
import {
	getProviderCredentials,
	type BadgeVisibility,
	type PublicOptions,
} from "@/settings";
import { cn } from "@/shared/utils/cn";

const extensionVersion = browser.runtime.getManifest()?.version ?? "unknown";

const badgeOptions: Array<{ value: BadgeVisibility; label: string }> = [
	{ value: "always", label: "Always" },
	{ value: "hover", label: "On hover" },
];

function openOptions(sectionId?: Provider): void {
	void browser.runtime
		.sendMessage({
			_a2a: true,
			type: "OPEN_OPTIONS_PAGE",
			...(sectionId ? { sectionId } : {}),
		})
		.catch(() => {});
}

export function QuickSettings(): React.JSX.Element {
	useOptionsQuerySync();

	const optionsQuery = useExtensionOptions();
	const publicOptionsQuery = usePublicOptions();
	const saveOptions = useSavePublicOptions();
	const [saveError, setSaveError] = useState<string | null>(null);

	const settings = optionsQuery.data;
	const publicSettings = publicOptionsQuery.data;
	const sonarrStatus = useProviderConnectionStatus(
		"sonarr",
		getProviderCredentials(settings, "sonarr"),
	);
	const radarrStatus = useProviderConnectionStatus(
		"radarr",
		getProviderCredentials(settings, "radarr"),
	);
	const providerStatuses: Record<Provider, ProviderConnectionStatusView> = {
		sonarr: sonarrStatus,
		radarr: radarrStatus,
	};
	const hasAnyProviderConfigured =
		sonarrStatus.isProviderConfigured || radarrStatus.isProviderConfigured;
	const isLoading = optionsQuery.isLoading || publicOptionsQuery.isLoading;
	const isSaving = saveOptions.isPending;
	const isBusy = isLoading || isSaving;

	let statusMessage = saveError;
	if (isLoading) {
		statusMessage = "Loading settings...";
	} else if (isSaving) {
		statusMessage = "Saving...";
	}

	const updateSettings = async (
		updater: (current: PublicOptions) => PublicOptions,
	): Promise<void> => {
		if (!publicSettings || isSaving) return;

		setSaveError(null);

		try {
			await saveOptions.mutateAsync(updater(publicSettings));
		} catch (error) {
			setSaveError((error as Error)?.message ?? "Failed to save settings.");
		}
	};

	const updateBrowseProvider = (
		provider: Provider,
		patch: Partial<PublicOptions["ui"]["browseCards"][Provider]>,
	): void => {
		void updateSettings((current) => ({
			...current,
			ui: {
				...current.ui,
				browseCards: {
					...current.ui.browseCards,
					[provider]: {
						...current.ui.browseCards[provider],
						...patch,
					},
				},
			},
		}));
	};

	const updateAnimeProvider = (
		provider: Provider,
		enabled: boolean,
	): void => {
		void updateSettings((current) => ({
			...current,
			ui: {
				...current.ui,
				animePages: {
					...current.ui.animePages,
					[provider]: {
						...current.ui.animePages[provider],
						enabled,
					},
				},
			},
		}));
	};

	return (
		<div className="p-4 text-text-primary">
			<header className="mb-4 flex items-center justify-between">
				<div className="flex items-center gap-2">
					<img
						src="/icons/48.png"
						alt="ani2arr logo"
						className="h-8 w-8 rounded-md"
					/>
					<div>
						<div className="flex items-baseline gap-1.5 leading-none">
							<p className="text-sm font-semibold">ani2arr</p>
							<span className="text-[10px] font-medium tracking-wide text-text-secondary/80">
								v{extensionVersion}
							</span>
						</div>
						<p className="text-xs text-text-secondary">Quick settings</p>
					</div>
				</div>
				<button
					type="button"
					onClick={() => openOptions()}
					className="inline-flex items-center gap-1 rounded-md border border-border-primary px-2.5 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-secondary hover:text-text-primary"
					aria-label="Open full settings page"
				>
					<ExternalLink className="h-3.5 w-3.5" />
					Full
				</button>
			</header>

			<section className="mb-3 grid grid-cols-2 gap-2">
				{PROVIDERS.map((provider) => {
					const status = providerStatuses[provider];
					const providerLabel = getProviderLabel(provider);

					return (
						<div
							key={provider}
							className="relative rounded-xl border border-border-primary bg-bg-secondary/70 px-3 py-2"
						>
							<button
								type="button"
								onClick={() => openOptions(provider)}
								className="absolute right-2 top-2 rounded p-1 text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
								aria-label={`Open ${providerLabel} options in a new tab`}
							>
								<ExternalLink className="h-3.5 w-3.5" />
							</button>
							<p className="text-[11px] uppercase tracking-wide text-text-secondary">
								{providerLabel}
							</p>
							<div className="mt-1 flex items-center gap-2 text-sm">
								<span
									className={cn(
										"a2a-provider-status inline-flex items-center gap-2",
										status.variantClassName,
									)}
								>
									<span
										className="a2a-provider-status-dot inline-block h-2.5 w-2.5 rounded-full"
										aria-hidden
									/>
									<span className="a2a-provider-status-text">
										{status.shortLabel}
									</span>
								</span>
							</div>
						</div>
					);
				})}
			</section>

			<section className="space-y-3 rounded-xl border border-border-primary bg-bg-secondary/70 p-3">
				<div>
					<p className="text-sm font-semibold">Browse cards</p>
					<p className="text-xs text-text-secondary">
						Enabled controls whether browse-card UI is injected. Visibility
						applies only while enabled.
					</p>
				</div>

				{PROVIDERS.map((provider) => {
					const providerLabel = getProviderLabel(provider);
					const providerSettings = publicSettings?.ui.browseCards[provider];

					return (
						<div
							key={provider}
							className="rounded-lg border border-border-primary/70 bg-bg-tertiary/40 p-3"
						>
							<div className="flex items-center justify-between gap-3">
								<div>
									<p className="text-sm font-semibold">{providerLabel}</p>
								</div>
								<input
									type="checkbox"
									className="h-4 w-4"
									checked={providerSettings?.enabled ?? false}
									disabled={isBusy || !publicSettings}
									onChange={(event) => {
										updateBrowseProvider(provider, {
											enabled: event.currentTarget.checked,
										});
									}}
								/>
							</div>

							<div className="mt-3">
								<div className="mt-2 grid grid-cols-2 gap-2">
									{badgeOptions.map((option) => {
										const selected =
											providerSettings?.visibility === option.value;

										return (
											<button
												key={option.value}
												type="button"
												disabled={
													isBusy ||
													!publicSettings ||
													!(providerSettings?.enabled ?? false)
												}
												onClick={() => {
													updateBrowseProvider(provider, {
														visibility: option.value,
													});
												}}
												className={cn(
													"rounded-md border px-2 py-1.5 text-xs transition-colors",
													selected
														? "border-accent-primary bg-accent-primary/20 text-text-primary"
														: "border-border-primary text-text-secondary hover:bg-bg-secondary",
												)}
											>
												{option.label}
											</button>
										);
									})}
								</div>
							</div>
						</div>
					);
				})}

				<div>
					<p className="text-sm font-semibold">Anime pages</p>
					<p className="text-xs text-text-secondary">
						Button above AniList&apos;s native page buttons.
					</p>
				</div>

				{PROVIDERS.map((provider) => {
					const providerLabel = getProviderLabel(provider);
					const enabled =
						publicSettings?.ui.animePages[provider].enabled ?? false;

					return (
						<div
							key={`${provider}-anime`}
							className="flex items-center justify-between rounded-lg bg-bg-tertiary/60 px-3 py-2"
						>
							<div>
								<p className="text-sm">{providerLabel}</p>
								<p className="text-xs text-text-secondary">
									{provider === "sonarr"
										? "Show series actions on supported anime pages."
										: "Show movie actions on supported anime pages."}
								</p>
							</div>
							<input
								type="checkbox"
								className="h-4 w-4"
								checked={enabled}
								disabled={isBusy || !publicSettings}
								onChange={(event) => {
									updateAnimeProvider(
										provider,
										event.currentTarget.checked,
									);
								}}
							/>
						</div>
					);
				})}

				{hasAnyProviderConfigured ? null : (
					<div className="rounded-lg border border-border-primary/70 bg-bg-tertiary/40 px-3 py-2">
						<p className="text-sm font-semibold">No provider configured yet</p>
						<p className="mt-1 text-xs text-text-secondary">
							Configure Sonarr, Radarr, or both in the full settings page to
							enable add and update actions.
						</p>
					</div>
				)}
			</section>

			<div
				className="mt-2 min-h-5 text-xs text-text-secondary"
				role="status"
				aria-live="polite"
			>
				{statusMessage}
			</div>
		</div>
	);
}
