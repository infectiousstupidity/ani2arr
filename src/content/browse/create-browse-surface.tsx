/** Shared browse surface shell for shadow-root mounting, styling, and cleanup. */
// src/content/browse/create-browse-surface.tsx

import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import { ExtensionErrorBoundary } from '@/shared/ui/feedback/extension-error-boundary';
import { ConfirmProvider } from '@/shared/hooks/use-confirm';
import { createContentEntrypointShell } from '@/content/core/create-content-script-shell';
import type { PublicOptions } from '@/settings';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { createShadowRootUi, type ShadowRootContentScriptUi } from 'wxt/utils/content-script-ui/shadow-root';

export interface BrowseEntrypointShellOptions {
  uiName: string;
  styleAttribute: string;
  shadowStyleAttribute: string;
  stylesText: string;
  containerClassName: string;
  processedAttribute: string;
  isEligible: (input: { url: string; publicOptions: PublicOptions }) => boolean | Promise<boolean>;
  renderRoot: (portalContainer: HTMLElement) => React.ReactElement;
}

const cleanupDomArtifacts = (options: BrowseEntrypointShellOptions): void => {
  for (const element of document
    .querySelectorAll<HTMLElement>(`[${options.processedAttribute}]`)) element.removeAttribute(options.processedAttribute);

  for (const container of document
    .querySelectorAll<HTMLElement>(`.${options.containerClassName}`)) container.remove();
};

export const createBrowseEntrypointShell = (options: BrowseEntrypointShellOptions) => {
  return async (ctx: ContentScriptContext): Promise<void> => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: Infinity,
          refetchOnWindowFocus: false,
          retry: false,
          gcTime: 30 * 1000 * 60,
        },
      },
    });

    let ui: ShadowRootContentScriptUi<Root> | null = null;
    let root: Root | null = null;

    let globalStyleElement: HTMLStyleElement | null = null;
    let shadowStyleElement: HTMLStyleElement | null = null;

    const ensureGlobalStyles = () => {
      if (!globalStyleElement) {
        globalStyleElement = document.createElement('style');
        globalStyleElement.setAttribute(options.styleAttribute, 'true');
        globalStyleElement.textContent = options.stylesText;
      }
      if (globalStyleElement && !document.head.contains(globalStyleElement)) {
        document.head.append(globalStyleElement);
      }
    };

    const ensureShadowStyles = (shadowRoot: ShadowRoot) => {
      if (!shadowStyleElement) {
        shadowStyleElement = document.createElement('style');
        shadowStyleElement.setAttribute(options.shadowStyleAttribute, 'true');
        shadowStyleElement.textContent = options.stylesText;
      }
      if (shadowStyleElement && shadowStyleElement.getRootNode() !== shadowRoot) {
        shadowRoot.append(shadowStyleElement);
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
              <ExtensionErrorBoundary scope="browse-root">
                <QueryClientProvider client={queryClient}>
                  <TooltipProvider>
                    <ConfirmProvider portalContainer={portalContainer}>
                      {options.renderRoot(portalContainer)}
                    </ConfirmProvider>
                  </TooltipProvider>
                </QueryClientProvider>
              </ExtensionErrorBoundary>
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
      ui?.remove();
      ui = null;
      root = null;
      cleanupDomArtifacts(options);
      if (shadowStyleElement?.parentNode) shadowStyleElement.remove();
      shadowStyleElement = null;
      if (globalStyleElement?.parentNode) globalStyleElement.remove();
      globalStyleElement = null;
    };

    const main = createContentEntrypointShell({
      isEligible: ({ url, publicOptions }) => options.isEligible({ url, publicOptions }),
      mount: async () => {
        await mount();
      },
      remove,
    });

    await main(ctx);
  };
};
