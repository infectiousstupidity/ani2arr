/** Browse-surface shadow-root mounting composed on top of the runtime content shell. */
// src/shared/entrypoints/browse-bootstrap.tsx

import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import { ConfirmProvider } from '@/shared/hooks/common/use-confirm';
import { createContentEntrypointShell } from '@/runtime/content-entrypoint-shell';
import type { PublicOptions } from '@/shared/types';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { createShadowRootUi, type ShadowRootContentScriptUi } from 'wxt/utils/content-script-ui/shadow-root';

export interface BrowseBootstrapOptions {
  uiName: string;
  styleAttribute: string;
  shadowStyleAttribute: string;
  stylesText: string;
  coverSelector: string;
  containerClassName: string;
  processedAttribute: string;
  isEligible: (input: { url: string; publicOptions: PublicOptions }) => boolean | Promise<boolean>;
  renderRoot: (portalContainer: HTMLElement) => React.ReactElement;
}

export const createBrowseContentMain = (options: BrowseBootstrapOptions) => {
  return async (ctx: ContentScriptContext): Promise<void> => {
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

    let ui: ShadowRootContentScriptUi<Root> | null = null;
    let root: Root | null = null;

    const cleanupDomArtifacts = () => {
      document
        .querySelectorAll<HTMLElement>(`[${options.processedAttribute}]`)
        .forEach(element => element.removeAttribute(options.processedAttribute));

      document
        .querySelectorAll<HTMLElement>(`.${options.containerClassName}`)
        .forEach(container => container.remove());
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
              <QueryClientProvider client={queryClient}>                
                <TooltipProvider>
                  <ConfirmProvider portalContainer={portalContainer}>
                    {options.renderRoot(portalContainer)}
                  </ConfirmProvider>
                </TooltipProvider>
              </QueryClientProvider>
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
      cleanupDomArtifacts();
      if (shadowStyleElement?.parentNode) shadowStyleElement.parentNode.removeChild(shadowStyleElement);
      shadowStyleElement = null;
      if (globalStyleElement?.parentNode) globalStyleElement.parentNode.removeChild(globalStyleElement);
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
