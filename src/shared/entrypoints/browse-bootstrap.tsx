import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import ToastProvider from '@/shared/ui/feedback/toast-provider';
import { ConfirmProvider } from '@/shared/hooks/common/use-confirm';
import { awaitBackgroundReady } from '@/shared/dom/background-ready';
import { createPersistOptions } from '@/cache/persist-options';
import { logger } from '@/shared/utils/logger';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { createShadowRootUi, type ShadowRootContentScriptUi } from 'wxt/utils/content-script-ui/shadow-root';

export interface BrowseBootstrapOptions {
  logName: string;
  uiName: string;
  styleAttribute: string;
  shadowStyleAttribute: string;
  stylesText: string;
  coverSelector: string;
  containerClassName: string;
  processedAttribute: string;
  isSurface: (url: string) => boolean;
  renderRoot: (portalContainer: HTMLElement) => React.ReactElement;
}

export const createBrowseContentMain = (options: BrowseBootstrapOptions) => {
  const log = logger.create(options.logName);

  return async (ctx: ContentScriptContext): Promise<void> => {
    // Ensure background is awake before rendering and kicking off any RPCs.
    await awaitBackgroundReady();
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: Infinity,
          refetchOnWindowFocus: false,
          retry: false,
          gcTime: 30 * 60 * 1000,
        },
      },
    });

    const persistOptions = createPersistOptions(log);

    let ui: ShadowRootContentScriptUi<Root> | null = null;
    let root: Root | null = null;

    const cleanupDomArtifacts = () => {
      const containers = document.querySelectorAll<HTMLElement>(`.${options.containerClassName}`);
      if (containers.length === 0) {
        return;
      }

      containers.forEach(container => {
        container.closest<HTMLElement>(options.coverSelector)?.removeAttribute(options.processedAttribute);
        container.remove();
      });
    };

    let globalStyleElement: HTMLStyleElement | null = null;
    let shadowStyleElement: HTMLStyleElement | null = null;

    const ensureGlobalStyles = () => {
      if (!globalStyleElement) {
        globalStyleElement = document.createElement('style');
        globalStyleElement.setAttribute(options.styleAttribute, 'true');
        globalStyleElement.textContent = options.stylesText;
      }
      if (globalStyleElement && !document.head.contains(globalStyleElement)) {
        document.head.appendChild(globalStyleElement);
      }
    };

    const ensureShadowStyles = (shadowRoot: ShadowRoot) => {
      if (!shadowStyleElement) {
        shadowStyleElement = document.createElement('style');
        shadowStyleElement.setAttribute(options.shadowStyleAttribute, 'true');
        shadowStyleElement.textContent = options.stylesText;
      }
      if (shadowStyleElement && shadowStyleElement.getRootNode() !== shadowRoot) {
        shadowRoot.appendChild(shadowStyleElement);
      }
    };

    const mount = async () => {
      if (ui) return;

      ensureGlobalStyles();

      ui = await createShadowRootUi(ctx, {
        name: options.uiName,
        position: 'inline',
        anchor: 'body',
        onMount: (container: HTMLElement, shadow: ShadowRoot) => {
          ensureShadowStyles(shadow);
          const portalContainer = container;
          root = createRoot(container);
          root.render(
            <React.StrictMode>
              <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
                <TooltipProvider>
                  <ToastProvider>
                    <ConfirmProvider portalContainer={portalContainer}>
                      {options.renderRoot(portalContainer)}
                    </ConfirmProvider>
                  </ToastProvider>
                </TooltipProvider>
              </PersistQueryClientProvider>
            </React.StrictMode>,
          );
          return root;
        },
        onRemove: (maybeRoot?: Root) => {
          (maybeRoot ?? root)?.unmount();
          root = null;
        },
      });

      await ui.mount();

      if (ui?.shadowHost) {
        ui.shadowHost.style.zIndex = '2147483647';
        ui.shadowHost.style.position = 'relative';
      }
    };

    const remove = async () => {
      if (!ui) {
        if (document.querySelector(`.${options.containerClassName}`) || shadowStyleElement || globalStyleElement) {
          cleanupDomArtifacts();
        }
        return;
      }

      ui.remove();
      ui = null;
      root = null;
      cleanupDomArtifacts();
      if (shadowStyleElement?.parentNode) shadowStyleElement.parentNode.removeChild(shadowStyleElement);
      shadowStyleElement = null;
      if (globalStyleElement?.parentNode) globalStyleElement.parentNode.removeChild(globalStyleElement);
      globalStyleElement = null;
    };

    const handleLocationChange = (url: string) => {
      if (options.isSurface(url)) void mount();
      else void remove();
    };

    handleLocationChange(location.href);

    type LocationChangeEvent = CustomEvent<{ newUrl: URL }>;

    ctx.addEventListener(
      window,
      'wxt:locationchange',
      (ev: Event) => {
        const e = ev as LocationChangeEvent;
        const href = e.detail?.newUrl?.href ?? location.href;
        handleLocationChange(href);
      },
      { capture: false },
    );

    ctx.onInvalidated(() => {
      void remove();
    });
  };
};
