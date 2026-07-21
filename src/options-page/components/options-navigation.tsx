/** Responsive options-page navigation, page header, and mobile command bars. */
// src/options-page/components/options-navigation.tsx

import { Link2, Palette, Plug, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { browser } from "wxt/browser";
import ani2arrIconUrl from "@/assets/icon.png";
import type { Provider } from "@/providers/types";
import type { ProviderConnectionStatusView } from "../hooks/provider-connection-status";
import { cn } from "@/shared/utils/cn";
import type { PageId } from "../navigation";
import {
	RadarrIcon,
	SeerrIcon,
	SonarrIcon,
} from "@/features/provider-ui/provider-icons";

type ConnectionPage = Provider | "seerr";
type ProviderStatusLookup = Record<ConnectionPage, ProviderConnectionStatusView>;

interface PageCommandProps {
	activePage: PageId;
	statuses: ProviderStatusLookup;
	onDisconnect: (connection: ConnectionPage) => void;
	isDisconnecting: boolean;
}

const NAV_GROUPS = ["Providers", "Extension"] as const;
const NAV_ITEMS = [
	{ id: "sonarr", title: "Sonarr", sidebarLabel: "Sonarr", bottomLabel: "Sonarr", group: "Providers", icon: SonarrIcon, connection: "sonarr" },
	{ id: "radarr", title: "Radarr", sidebarLabel: "Radarr", bottomLabel: "Radarr", group: "Providers", icon: RadarrIcon, connection: "radarr" },
	{ id: "seerr", title: "Seerr", sidebarLabel: "Seerr", bottomLabel: "Seerr", group: "Providers", icon: SeerrIcon, connection: "seerr" },
	{ id: "mappings", title: "Manage mappings", sidebarLabel: "Manage mappings", bottomLabel: "Mappings", group: "Extension", icon: Link2 },
	{ id: "ui", title: "UI & Actions", sidebarLabel: "UI & actions", bottomLabel: "UI & Actions", group: "Extension", icon: Palette },
	{ id: "advanced", title: "Advanced", sidebarLabel: "Advanced", bottomLabel: "Advanced", group: "Extension", icon: SlidersHorizontal },
] as const;

const extensionVersion = browser.runtime.getManifest()?.version ?? "unknown";

function getPageMeta(page: PageId) {
	return NAV_ITEMS.find((item) => item.id === page) ?? NAV_ITEMS[0];
}

function getPageConnection(page: PageId): ConnectionPage | null {
	const meta = getPageMeta(page);
	return "connection" in meta ? meta.connection : null;
}

function getStatusForPage(
	page: PageId,
	statuses: ProviderStatusLookup,
): ProviderConnectionStatusView | undefined {
	const connection = getPageConnection(page);
	return connection ? statuses[connection] : undefined;
}

function ProviderStatus({
	status,
	compact = false,
}: {
	status: ProviderConnectionStatusView;
	compact?: boolean;
}) {
	const isConnected = status.shortLabel === "Connected";
	const isChecking = status.shortLabel === "Checking";
	let textClassName = "text-text-secondary";
	let dotClassName = "bg-text-secondary";

	if (isConnected) {
		textClassName = "text-success";
		dotClassName = "bg-success";
	} else if (isChecking) {
		textClassName = "text-warning";
		dotClassName = "bg-warning";
	} else if (status.isProviderConfigured) {
		textClassName = "text-accent-primary";
		dotClassName = "bg-accent-primary";
	}

	return (
		<span
			className={cn(
				"inline-flex min-w-0 items-center gap-2",
				compact ? "text-sm" : "text-[11px] font-medium",
				textClassName,
			)}
		>
			<span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotClassName)} />
			<span className="truncate">{status.shortLabel}</span>
		</span>
	);
}

export function DesktopSidebar({
	activePage,
	statuses,
	onPageSelect,
}: {
	activePage: PageId;
	statuses: ProviderStatusLookup;
	onPageSelect: (page: PageId) => void;
}) {
	return (
		<aside className="hidden h-screen w-72 shrink-0 overflow-y-auto border-r border-border-primary bg-bg-secondary px-4 py-8 md:flex md:flex-col">
			<div className="px-4">
				<div className="flex items-center gap-3">
					<img src={ani2arrIconUrl} alt="" aria-hidden="true" className="h-8 w-8 shrink-0" />
					<div className="text-2xl font-bold leading-none text-text-primary">ani2arr</div>
				</div>
			</div>

			<nav className="mt-12 flex-1 space-y-8">
				{NAV_GROUPS.map((group) => (
					<div key={group} className="space-y-2">
						<div className="px-4 pb-2 text-[11px] font-bold uppercase tracking-wider text-text-secondary">
							{group}
						</div>
						<div className="space-y-1">
							{NAV_ITEMS.filter((item) => item.group === group).map((item) => {
								const Icon = item.icon;
								const active = item.id === activePage;
								const status = getStatusForPage(item.id, statuses);

								return (
									<button
										key={item.id}
										type="button"
										onClick={() => onPageSelect(item.id)}
										className={cn(
											"flex min-h-[44px] w-full cursor-pointer items-center gap-3.5 rounded-md px-4 text-left text-sm transition-colors",
											active
												? "bg-bg-tertiary text-text-primary"
												: "text-text-secondary hover:bg-bg-tertiary/50 hover:text-text-primary",
										)}
									>
										<Icon className={cn("h-5 w-5 shrink-0", active && "text-text-primary")} />
										<span className="min-w-0 flex flex-col justify-center">
											<span className="block truncate font-medium">{item.sidebarLabel}</span>
											{status ? <ProviderStatus status={status} /> : null}
										</span>
									</button>
								);
							})}
						</div>
					</div>
				))}
			</nav>

			<div className="mt-auto border-t border-border-primary/50 pt-6">
				<button
					type="button"
					onClick={() => onPageSelect("advanced")}
					className="flex min-h-[44px] w-full cursor-pointer items-center gap-3.5 rounded-md px-4 text-left text-sm text-text-secondary transition-colors hover:bg-bg-tertiary/50 hover:text-text-primary"
				>
					<ShieldCheck className="h-5 w-5 shrink-0" />
					<span className="font-medium">Privacy</span>
				</button>
				<div className="px-4 pt-4 text-xs font-medium text-text-secondary/60">v{extensionVersion}</div>
			</div>
		</aside>
	);
}

export function DesktopPageHeader({
	activePage,
	statuses,
	onDisconnect,
	isDisconnecting,
}: PageCommandProps) {
	const meta = getPageMeta(activePage);
	const connection = getPageConnection(activePage);
	const status = getStatusForPage(activePage, statuses);
	const title = connection ? `${meta.title} Connection` : meta.title;
	const Icon = connection ? Plug : meta.icon;

	return (
		<header className="mb-6 hidden items-center justify-between gap-8 border-b border-border-primary/50 pb-5 md:mb-8 md:flex">
			<div className="min-w-0 flex items-center gap-3">
				<Icon className="h-5 w-5 shrink-0 text-text-secondary" />
				<h1 className="truncate text-xl font-semibold text-text-primary md:text-lg">{title}</h1>
				{status ? (
					<div className="ml-3 flex shrink-0 items-center gap-3">
						<ProviderStatus status={status} compact />
						{connection && status.isProviderConfigured ? (
							<>
								<span className="text-border-primary/50">|</span>
								<button
									type="button"
									onClick={() => onDisconnect(connection)}
									disabled={isDisconnecting}
									className="cursor-pointer text-sm font-medium text-text-secondary transition-colors hover:text-error disabled:cursor-not-allowed disabled:opacity-50"
								>
									Disconnect
								</button>
							</>
						) : null}
					</div>
				) : null}
			</div>
		</header>
	);
}

export function MobileTopBar({
	activePage,
	statuses,
	onDisconnect,
	isDisconnecting,
}: PageCommandProps) {
	const meta = getPageMeta(activePage);
	const Icon = meta.icon;
	const connection = getPageConnection(activePage);
	const status = getStatusForPage(activePage, statuses);

	return (
		<header className="sticky top-0 z-40 flex min-h-[72px] items-center gap-3 border-b border-border-primary bg-bg-secondary/95 px-4 py-3 backdrop-blur md:hidden">
			<div className="flex min-w-0 flex-1 items-center gap-3">
				<Icon className="h-6 w-6 shrink-0 text-text-primary" />
				<div className="min-w-0 flex flex-col">
					<h1 className="truncate text-base font-bold leading-tight text-text-primary">{meta.title}</h1>
					{status ? <ProviderStatus status={status} /> : null}
				</div>
			</div>
			{connection && status?.isProviderConfigured ? (
				<button
					type="button"
					onClick={() => onDisconnect(connection)}
					disabled={isDisconnecting}
					className="shrink-0 cursor-pointer px-2 text-xs font-semibold text-error disabled:cursor-not-allowed disabled:opacity-50"
				>
					Disconnect
				</button>
			) : null}
		</header>
	);
}

export function MobileBottomNav({
	activePage,
	onPageSelect,
}: {
	activePage: PageId;
	onPageSelect: (page: PageId) => void;
}) {
	return (
		<nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border-primary bg-bg-secondary/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
			<div className="grid h-[72px] grid-cols-6 gap-1">
				{NAV_ITEMS.map((item) => {
					const Icon = item.icon;
					const active = activePage === item.id;

					return (
						<button
							key={item.id}
							type="button"
							onClick={() => onPageSelect(item.id)}
							className={cn(
								"relative flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md px-1 py-1 transition-colors",
								active ? "text-text-primary" : "text-text-secondary hover:text-text-primary",
							)}
						>
							<span
								className={cn(
									"flex h-8 w-12 items-center justify-center rounded-full transition-colors",
									active && "bg-accent-primary/20 text-accent-primary",
								)}
							>
								<Icon className="h-5 w-5 shrink-0" />
							</span>
							<span className="w-full truncate text-center text-[10px] font-semibold tracking-tight">
								{item.bottomLabel}
							</span>
						</button>
					);
				})}
			</div>
		</nav>
	);
}
