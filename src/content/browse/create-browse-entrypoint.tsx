/** Shared browse entrypoint shell for shadow-root mounting, styling, and cleanup. */
// src/content/browse/create-browse-entrypoint.tsx

import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import * as Tooltip from '@radix-ui/react-tooltip';
import { ExtensionErrorBoundary } from '@/shared/ui/feedback/extension-error-boundary';
import { ConfirmProvider } from '@/shared/ui/feedback/confirm-provider';
import { createContentEntrypointShell } from '@/content/core/create-content-script-shell';
import { BrowseOverlays } from '@/content/browse/browse-overlays';
import { createExtensionQueryClient } from '@/queries/query-client';
import { queryKeys } from '@/queries/query-keys';
import {
  BROWSE_CREATED_ATTRIBUTE,
  BROWSE_OVERLAY_CONTAINER_CLASS,
  BROWSE_PROCESSED_ATTRIBUTE,
  type BrowseAdapter,
} from '@/content/browse/types';
import type { PublicOptions } from "@/settings/types";
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { createShadowRootUi, type ShadowRootContentScriptUi } from 'wxt/utils/content-script-ui/shadow-root';

const LIGHT_DOM_STYLE_ATTRIBUTE = 'data-a2a-browse-light-dom';

export interface BrowseEntrypointShellOptions {
  adapter: BrowseAdapter;
  uiName: string;
  lightDomStylesText: string;
  isEligible: (input: { url: string; publicOptions: PublicOptions }) => boolean | Promise<boolean>;
}

const cleanupDomArtifacts = (): void => {
  for (const element of document
    .querySelectorAll<HTMLElement>(`[${CSS.escape(BROWSE_PROCESSED_ATTRIBUTE)}]`)) {
    element.removeAttribute(BROWSE_PROCESSED_ATTRIBUTE);
  }

  for (const container of document
    .querySelectorAll<HTMLElement>(`.${CSS.escape(BROWSE_OVERLAY_CONTAINER_CLASS)}`)) {
    container.remove();
  }

  for (const element of document
    .querySelectorAll<HTMLElement>(`[${CSS.escape(BROWSE_CREATED_ATTRIBUTE)}]`)) {
    element.remove();
  }
};

export const createBrowseEntrypointShell = (options: BrowseEntrypointShellOptions) => {
  return async (ctx: ContentScriptContext): Promise<void> => {
    const queryClient = createExtensionQueryClient({
      staleTime: Infinity,
      retry: false,
    });

    let ui: ShadowRootContentScriptUi<Root> | null = null;
    let root: Root | null = null;

    let lightDomStyleElement: HTMLStyleElement | null = null;

    const ensureLightDomStyles = () => {
      if (!lightDomStyleElement) {
        lightDomStyleElement = document.createElement('style');
        lightDomStyleElement.setAttribute(LIGHT_DOM_STYLE_ATTRIBUTE, 'true');
        lightDomStyleElement.textContent = options.lightDomStylesText;
      }
      if (lightDomStyleElement && !document.head.contains(lightDomStyleElement)) {
        document.head.append(lightDomStyleElement);
      }
    };

    const mount = async (publicOptions: PublicOptions) => {
      queryClient.setQueryData(queryKeys.publicOptions(), publicOptions);
      if (ui) return;

      ensureLightDomStyles();

      ui = await createShadowRootUi(ctx, {
        name: options.uiName,
        mode: 'closed',
        position: 'inline',
        anchor: 'body',
        onMount: (container: HTMLElement) => {
          const portalContainer = container;
          root = createRoot(container);
          root.render(
            <React.StrictMode>
              <ExtensionErrorBoundary scope="browse-overlays">
                <QueryClientProvider client={queryClient}>
                  <Tooltip.Provider>
                    <ConfirmProvider portalContainer={portalContainer}>
                      <BrowseOverlays
                        adapter={options.adapter}
                        portalContainer={portalContainer}
                      />
                    </ConfirmProvider>
                  </Tooltip.Provider>
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
      cleanupDomArtifacts();
      if (lightDomStyleElement?.parentNode) lightDomStyleElement.remove();
      lightDomStyleElement = null;
    };

    const main = createContentEntrypointShell({
      isEligible: ({ url, publicOptions }) => options.isEligible({ url, publicOptions }),
      mount: async ({ publicOptions }) => {
        await mount(publicOptions);
      },
      remove,
    });

    await main(ctx);
  };
};
