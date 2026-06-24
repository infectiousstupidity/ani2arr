/** Popup quick settings entrypoint for provider state and UI visibility toggles. */
// src/entrypoints/popup/index.tsx

import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { i18n } from "#i18n";
import { ExternalLink } from "lucide-react";
import { browser } from "wxt/browser";
import { openOptionsPage } from "@/rpc/runtime-messages";
import { createExtensionQueryClient } from "@/queries/query-client";
import {
	useOptionsQuerySync,
	usePublicOptions,
	useSavePublicOptions,
} from "@/queries/options";
import { getProviderLabel } from "@/providers/provider-labels";
import { PROVIDERS, type Provider } from "@/providers/types";
import type { BadgeVisibility, PublicOptions } from "@/settings/types";
import { cn } from "@/shared/utils/cn";
import "./style.css";

type ConnectionId = Provider | "seerr";

type ProviderStatusView = {
	isProviderConfigured: boolean;
	shortLabel: string;
	variantClassName?: string;
};

const extensionVersion = browser.runtime.getManifest()?.version ?? "unknown";
const queryClient = createExtensionQueryClient();

const CONNECTIONS: readonly ConnectionId[] = [...PROVIDERS, "seerr"];

const badgeOptions: Array<{ value: BadgeVisibility; label: string }> = [
	{ value: "always", label: i18n.t("popup.always") },
	{ value: "hover", label: i18n.t("popup.onHover") },
];

const configuredStatus: ProviderStatusView = {
	isProviderConfigured: true,
	shortLabel: i18n.t("popup.configured"),
	variantClassName: "a2a-provider-status--configured",
};

const notConfiguredStatus: ProviderStatusView = {
	isProviderConfigured: false,
	shortLabel: i18n.t("popup.notConfigured"),
};

function getConnectionLabel(connection: ConnectionId): string {
	return connection === "seerr" ? "Seerr" : getProviderLabel(connection);
}

function getAnimePageConnectionDescription(connection: ConnectionId): string {
	if (connection === "sonarr") {
		return i18n.t("popup.sonarrAnimePageDescription");
	}

	if (connection === "radarr") {
		return i18n.t("popup.radarrAnimePageDescription");
	}

	return i18n.t("popup.seerrAnimePageDescription");
}

export function QuickSettings(): React.JSX.Element {
	useOptionsQuerySync();

	const publicOptionsQuery = usePublicOptions();
	const saveOptions = useSavePublicOptions();
	const [saveError, setSaveError] = useState<string | null>(null);

	const publicSettings = publicOptionsQuery.data;
	const isSaving = saveOptions.isPending;

	if (publicOptionsQuery.isLoading || !publicSettings) {
		return (
			<div className="flex w-90 justify-center pb-4 pt-14 text-sm text-text-secondary">
				{i18n.t("popup.loading")}
			</div>
		);
	}

	const isSonarrConfigured = publicSettings.providers.sonarr.isConfigured;
	const isRadarrConfigured = publicSettings.providers.radarr.isConfigured;
	const isSeerrConfigured = publicSettings.seerr.isConfigured;

	const providerStatuses: Record<ConnectionId, ProviderStatusView> = {
		sonarr: isSonarrConfigured ? configuredStatus : notConfiguredStatus,
		radarr: isRadarrConfigured ? configuredStatus : notConfiguredStatus,
		seerr: isSeerrConfigured ? configuredStatus : notConfiguredStatus,
	};

	const hasAnyProviderConfigured =
		isSonarrConfigured || isRadarrConfigured || isSeerrConfigured;

	const updateSettings = async (
		updater: (current: PublicOptions) => PublicOptions,
	): Promise<void> => {
		if (isSaving) return;

		setSaveError(null);

		try {
			await saveOptions.mutateAsync(updater(publicSettings));
		} catch (error) {
			setSaveError((error as Error)?.message ?? i18n.t("popup.saveError"));
		}
	};

	const setBrowseCardEnabled = (
		provider: ConnectionId,
		enabled: boolean,
	): void => {
		void updateSettings((current) => {
			const currentSettings = current.ui.browseCards[provider];

			return {
				...current,
				ui: {
					...current.ui,
					browseCards: {
						...current.ui.browseCards,
						[provider]: {
							enabled,
							visibility: currentSettings?.visibility ?? "hover",
						},
					},
				},
			};
		});
	};

	const setBrowseCardVisibility = (
		provider: ConnectionId,
		visibility: BadgeVisibility,
	): void => {
		void updateSettings((current) => {
			const currentSettings = current.ui.browseCards[provider];

			return {
				...current,
				ui: {
					...current.ui,
					browseCards: {
						...current.ui.browseCards,
						[provider]: {
							enabled: currentSettings?.enabled ?? false,
							visibility,
						},
					},
				},
			};
		});
	};

	const setAnimePageEnabled = (
		provider: ConnectionId,
		enabled: boolean,
	): void => {
		void updateSettings((current) => ({
			...current,
			ui: {
				...current.ui,
				animePages: {
					...current.ui.animePages,
					[provider]: {
						enabled,
					},
				},
			},
		}));
	};

	return (
		<div className="p-3 text-text-primary">
			<header className="mb-3 flex items-center justify-between">
				<div className="flex items-center gap-2">
					<img
						src="/icons/48.png"
						alt={i18n.t("popup.logoAlt")}
						className="h-8 w-8 rounded-md"
					/>
					<div>
						<div className="flex items-baseline gap-1.5 leading-none">
							<p className="text-sm font-semibold">ani2arr</p>
							<span className="text-[10px] font-medium tracking-wide text-text-secondary/80">
								v{extensionVersion}
							</span>
						</div>
						<p className="text-xs text-text-secondary">
							{i18n.t("popup.quickSettings")}
						</p>
					</div>
				</div>

				<button
					type="button"
					onClick={() => openOptionsPage()}
					className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border-primary px-2.5 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-secondary hover:text-text-primary"
					aria-label={i18n.t("popup.openFullSettingsPage")}
					title={i18n.t("popup.openFullSettingsPage")}
				>
					<ExternalLink className="h-3.5 w-3.5" />
					{i18n.t("popup.fullSettingsCta")}
				</button>
			</header>

			<section className="mb-3 grid grid-cols-3 gap-2">
				{CONNECTIONS.map((provider) => {
					const status = providerStatuses[provider];
					const providerLabel = getConnectionLabel(provider);

					return (
						<div
							key={provider}
							className="relative rounded-xl border border-border-primary bg-bg-secondary/70 px-3 py-2"
						>
							<button
								type="button"
								onClick={() => openOptionsPage({ sectionId: provider })}
								className="absolute right-2 top-2 cursor-pointer rounded p-1 text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
								aria-label={i18n.t("popup.openProviderSettings", [
									providerLabel,
								])}
								title={i18n.t("popup.openProviderSettings", [providerLabel])}
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

			{hasAnyProviderConfigured ? (
				<section className="space-y-2.5 rounded-xl border border-border-primary bg-bg-secondary/70 p-3">
					<div>
						<p className="text-sm font-semibold">
							{i18n.t("popup.browseCards")}
						</p>
						<p className="text-xs text-text-secondary">
							{i18n.t("popup.browseCardsDescription")}
						</p>
					</div>

					{CONNECTIONS.map((provider) => {
						const providerLabel = getConnectionLabel(provider);
						const providerSettings = publicSettings.ui.browseCards[provider];

						return (
							<div
								key={provider}
								className="rounded-lg border border-border-primary/70 bg-bg-tertiary/40 px-3 py-2.5"
							>
								<div className="flex items-center justify-between gap-3">
									<p className="text-sm font-semibold">{providerLabel}</p>

									<input
										type="checkbox"
										className="h-4 w-4 cursor-pointer disabled:cursor-not-allowed"
										checked={providerSettings?.enabled ?? false}
										disabled={isSaving}
										onChange={(event) => {
											setBrowseCardEnabled(
												provider,
												event.currentTarget.checked,
											);
										}}
									/>
								</div>

								<div className="mt-2.5 grid grid-cols-2 gap-2">
									{badgeOptions.map((option) => {
										const selected =
											providerSettings?.visibility === option.value;

										return (
											<button
												key={option.value}
												type="button"
												disabled={
													isSaving || !(providerSettings?.enabled ?? false)
												}
												onClick={() => {
													setBrowseCardVisibility(provider, option.value);
												}}
												className={cn(
													"cursor-pointer rounded-md border px-2 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50",
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
						);
					})}

					<div>
						<p className="text-sm font-semibold">
							{i18n.t("popup.animePages")}
						</p>
						<p className="text-xs text-text-secondary">
							{i18n.t("popup.animePagesDescription")}
						</p>
					</div>

					{CONNECTIONS.map((provider) => {
						const providerLabel = getConnectionLabel(provider);
						const enabled =
							publicSettings.ui.animePages[provider]?.enabled ?? false;

						return (
							<div
								key={`${provider}-anime`}
								className="flex items-center justify-between rounded-lg bg-bg-tertiary/60 px-3 py-1.5"
							>
								<div>
									<p className="text-sm">{providerLabel}</p>
									<p className="text-[11px] text-text-secondary">
										{getAnimePageConnectionDescription(provider)}
									</p>
								</div>

								<input
									type="checkbox"
									className="h-4 w-4 cursor-pointer disabled:cursor-not-allowed"
									checked={enabled}
									disabled={isSaving}
									onChange={(event) => {
										setAnimePageEnabled(
											provider,
											event.currentTarget.checked,
										);
									}}
								/>
							</div>
						);
					})}
				</section>
			) : (
				<section className="rounded-xl border border-border-primary bg-bg-secondary/70 p-4 text-center">
					<p className="text-sm font-semibold">
						{i18n.t("popup.noProviderConfigured")}
					</p>
					<p className="mt-1 text-xs text-text-secondary">
						{i18n.t("popup.noProviderConfiguredDescription")}
					</p>
				</section>
			)}

			<div
				className="mt-2 min-h-5 text-center text-xs text-text-secondary"
				role="status"
				aria-live="polite"
			>
				{saveError ? (
					<span className="text-error">{saveError}</span>
				) : (isSaving ? (
					i18n.t("popup.saving")
				) : null)}
			</div>
		</div>
	);
}

const rootElement = document.querySelector("#popup-root");

if (rootElement) {
	const root = createRoot(rootElement);

	root.render(
		<React.StrictMode>
			<QueryClientProvider client={queryClient}>
				<QuickSettings />
			</QueryClientProvider>
		</React.StrictMode>,
	);

	if (import.meta.hot) {
		import.meta.hot.dispose(() => {
			root.unmount();
		});
	}
}
