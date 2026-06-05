/** Responsive options-page navigation, page header, and mobile command bars. */
// src/options-page/components/options-navigation.tsx

import type { ComponentType } from "react";
import { browser } from "wxt/browser";
import { Palette, Plug, ShieldCheck, SlidersHorizontal, Link2 } from "lucide-react";
import ani2arrIconUrl from "@/assets/icon.png";
import type { Provider } from "@/providers/types";
import type { ProviderConnectionStatusView } from "@/queries/provider-connection";
import { cn } from "@/shared/utils/cn";
import type { PageId } from "../navigation";
import { RadarrIcon, SonarrIcon } from "./icons";

type IconComponent = ComponentType<{ className?: string }>;

interface OptionsNavItem {
  id: PageId;
  title: string;
  sidebarLabel: string;
  bottomLabel: string;
  group: "Providers" | "Extension";
  icon: IconComponent;
  provider?: Provider;
}

const NAV_ITEMS =[
  { id: "sonarr", title: "Sonarr", sidebarLabel: "Sonarr", bottomLabel: "Sonarr", group: "Providers", icon: SonarrIcon, provider: "sonarr" },
  { id: "radarr", title: "Radarr", sidebarLabel: "Radarr", bottomLabel: "Radarr", group: "Providers", icon: RadarrIcon, provider: "radarr" },
  { id: "mappings", title: "Manage mappings", sidebarLabel: "Manage mappings", bottomLabel: "Mappings", group: "Extension", icon: Link2 },
  { id: "ui", title: "UI & Actions", sidebarLabel: "UI & actions", bottomLabel: "UI & Actions", group: "Extension", icon: Palette },
  { id: "advanced", title: "Advanced", sidebarLabel: "Advanced", bottomLabel: "Advanced", group: "Extension", icon: SlidersHorizontal },
] as const satisfies readonly OptionsNavItem[];

const extensionVersion = browser.runtime.getManifest()?.version ?? "unknown";

function getPageMeta(page: PageId): OptionsNavItem {
  return NAV_ITEMS.find((item) => item.id === page) ?? NAV_ITEMS[0];
}

function getPageProvider(page: PageId): Provider | null {
  return getPageMeta(page).provider ?? null;
}

interface ProviderStatusLookup {
  sonarr: ProviderConnectionStatusView;
  radarr: ProviderConnectionStatusView;
}

function ProviderStatus({ status, compact = false }: { status: ProviderConnectionStatusView; compact?: boolean }) {
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
    <span className={cn("inline-flex min-w-0 items-center gap-2", compact ? "text-sm" : "text-[11px] font-medium", textClassName)}>
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotClassName)} />
      <span className="truncate">{status.shortLabel}</span>
    </span>
  );
}

function getStatusForPage(page: PageId, statuses: ProviderStatusLookup) {
  const provider = getPageProvider(page);
  return provider ? statuses[provider] : undefined;
}

export function DesktopSidebar({ activePage, statuses, onPageSelect }: { activePage: PageId; statuses: ProviderStatusLookup; onPageSelect: (page: PageId) => void }) {
  return (
    <aside className="hidden h-screen w-72 shrink-0 overflow-y-auto border-r border-border-primary bg-bg-secondary px-4 py-8 md:flex md:flex-col">
      <div className="px-4">
        <div className="flex items-center gap-3">
          <img
            src={ani2arrIconUrl}
            alt=""
            aria-hidden="true"
            className="h-8 w-8 shrink-0"
          />
          <div className="text-2xl font-bold leading-none text-text-primary">ani2arr</div>
        </div>
      </div>

      <nav className="mt-12 space-y-8 flex-1">
        {(["Providers", "Extension"] as const).map((group) => (
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
                    onClick={() => onPageSelect(item.id)}
                    className={cn(
                      "flex min-h-[44px] w-full items-center gap-3.5 rounded-md px-4 text-left text-sm transition-colors",
                      active ? "bg-bg-tertiary text-text-primary" : "text-text-secondary hover:bg-bg-tertiary/50 hover:text-text-primary"
                    )}
                  >
                    <Icon className={cn("h-5 w-5 shrink-0", active ? "text-text-primary" : "")} />
                    <span className="min-w-0 flex flex-col justify-center">
                      <span className="block truncate font-medium">{item.sidebarLabel}</span>
                      {status && <ProviderStatus status={status} />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-auto pt-6 border-t border-border-primary/50">
        <button
          onClick={() => onPageSelect("advanced")}
          className="flex min-h-[44px] w-full items-center gap-3.5 rounded-md px-4 text-left text-sm text-text-secondary transition-colors hover:bg-bg-tertiary/50 hover:text-text-primary"
        >
          <ShieldCheck className="h-5 w-5 shrink-0" />
          <span className="font-medium">Privacy</span>
        </button>
        <div className="px-4 pt-4 text-xs font-medium text-text-secondary/60">
          v{extensionVersion}
        </div>
      </div>
    </aside>
  );
}

interface PageCommandProps {
  activePage: PageId;
  statuses: ProviderStatusLookup;
  onDisconnect: (provider: Provider) => void;
  isDisconnecting: boolean;
}

export function DesktopPageHeader({ activePage, statuses, onDisconnect, isDisconnecting }: PageCommandProps) {
  const meta = getPageMeta(activePage);
  const provider = getPageProvider(activePage);
  const status = getStatusForPage(activePage, statuses);

  const title = provider ? `${meta.title} Connection` : meta.title;
  const Icon = provider ? Plug : meta.icon;

  return (
    <header className="hidden items-center justify-between gap-8 md:flex border-b border-border-primary/50 pb-5 mb-6 md:mb-8">
      <div className="min-w-0 flex items-center gap-3">
        <Icon className="h-5 w-5 shrink-0 text-text-secondary" />
        <h1 className="text-xl font-semibold text-text-primary md:text-lg truncate">
          {title}
        </h1>
        {status && (
          <div className="ml-3 flex items-center gap-3 shrink-0">
            <ProviderStatus status={status} compact />
            {provider && status.isProviderConfigured && (
              <>
                <span className="text-border-primary/50">|</span>
                <button
                  onClick={() => onDisconnect(provider)}
                  disabled={isDisconnecting}
                  className="text-sm font-medium text-text-secondary hover:text-error transition-colors"
                >
                  Disconnect
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

export function MobileTopBar({ activePage, statuses, onDisconnect, isDisconnecting }: PageCommandProps) {
  const meta = getPageMeta(activePage);
  const Icon = meta.icon;
  const provider = getPageProvider(activePage);
  const status = getStatusForPage(activePage, statuses);

  return (
    <header className="sticky top-0 z-40 flex min-h-[72px] items-center gap-3 border-b border-border-primary bg-bg-secondary/95 backdrop-blur px-4 py-3 md:hidden">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Icon className="h-6 w-6 shrink-0 text-text-primary" />
        <div className="min-w-0 flex flex-col">
          <h1 className="truncate text-base font-bold text-text-primary leading-tight">
            {meta.title}
          </h1>
          {status && <ProviderStatus status={status} />}
        </div>
      </div>
      {provider && status?.isProviderConfigured && (
        <button
          onClick={() => onDisconnect(provider)}
          disabled={isDisconnecting}
          className="shrink-0 px-2 text-xs font-semibold text-error disabled:opacity-50"
        >
          Disconnect
        </button>
      )}
    </header>
  );
}

export function MobileBottomNav({ activePage, onPageSelect }: { activePage: PageId; onPageSelect: (page: PageId) => void }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border-primary bg-bg-secondary/95 backdrop-blur px-2 pb-[env(safe-area-inset-bottom)] md:hidden">
      <div className="grid h-[72px] grid-cols-5 gap-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activePage === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onPageSelect(item.id)}
              className={cn(
                "flex flex-col items-center justify-center gap-1 rounded-md px-1 py-1 transition-colors relative",
                active ? "text-text-primary" : "text-text-secondary hover:text-text-primary"
              )}
            >
              <span className={cn("flex h-8 w-12 items-center justify-center rounded-full transition-colors", active && "bg-accent-primary/20 text-accent-primary")}>
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
