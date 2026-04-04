/** Shared content-script shell orchestration for eligibility, remount, and cleanup. */
// src/content/core/create-content-script-shell.ts

import { browser } from 'wxt/browser';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { awaitBackgroundReady } from './await-background-ready';
import { STORAGE_KEYS } from '@/storage';
import { getPublicOptionsSnapshot, type PublicOptions } from '@/options';

export interface ContentEntrypointShellContext {
  ctx: ContentScriptContext;
  url: string;
  publicOptions: PublicOptions;
  signal: AbortSignal;
  isCurrent: () => boolean;
}

export interface ContentEntrypointShellOptions {
  isEligible: (context: ContentEntrypointShellContext) => boolean | Promise<boolean>;
  mount: (context: ContentEntrypointShellContext) => void | Promise<void>;
  remove: () => void | Promise<void>;
  onError?: (
    error: unknown,
    phase: 'load-public-options' | 'evaluate' | 'mount' | 'remove',
    url: string,
  ) => void;
}

const PUBLIC_OPTIONS_STORAGE_CHANGE_KEY = STORAGE_KEYS.publicOptions.replace(/^local:/, '');

const isAbortError = (error: unknown): boolean =>
  error instanceof DOMException && error.name === 'AbortError';

const removeSafely = async (
  options: ContentEntrypointShellOptions,
  url: string,
): Promise<void> => {
  try {
    await options.remove();
  } catch (error) {
    options.onError?.(error, 'remove', url);
  }
};

export const createContentEntrypointShell = (options: ContentEntrypointShellOptions) => {
  return async (ctx: ContentScriptContext): Promise<void> => {
    let invalidated = false;
    let activeController: AbortController | null = null;

    const reconcile = async (url: string) => {
      activeController?.abort();
      const controller = new AbortController();
      activeController = controller;

      const createContext = (publicOptions: PublicOptions): ContentEntrypointShellContext => ({
        ctx,
        url,
        publicOptions,
        signal: controller.signal,
        isCurrent: () => !invalidated && activeController === controller && !controller.signal.aborted,
      });

      let publicOptions: PublicOptions;
      try {
        publicOptions = await getPublicOptionsSnapshot();
      } catch (error) {
        if (!controller.signal.aborted) {
          options.onError?.(error, 'load-public-options', url);
        }
        return;
      }

      const shellContext = createContext(publicOptions);
      if (!shellContext.isCurrent()) return;

      let eligible: boolean;
      try {
        eligible = await options.isEligible(shellContext);
      } catch (error) {
        if (!shellContext.signal.aborted && !isAbortError(error)) {
          options.onError?.(error, 'evaluate', url);
        }
        return;
      }

      if (!shellContext.isCurrent()) return;

      if (!eligible) {
        await removeSafely(options, url);
        return;
      }

      try {
        await awaitBackgroundReady();
        if (!shellContext.isCurrent()) return;
        await options.mount(shellContext);
        if (!shellContext.isCurrent()) {
          await removeSafely(options, url);
        }
      } catch (error) {
        if (shellContext.signal.aborted || isAbortError(error)) {
          return;
        }

        options.onError?.(error, 'mount', url);
        await removeSafely(options, url);
      }
    };

    await reconcile(location.href);

    type LocationChangeEvent = CustomEvent<{ newUrl: URL }>;

    ctx.addEventListener(globalThis, 'wxt:locationchange', (event: Event) => {
      const locationChangeEvent = event as LocationChangeEvent;
      const nextUrl = locationChangeEvent.detail?.newUrl?.href ?? location.href;
      void reconcile(nextUrl);
    });

    const onStorageChanged: Parameters<typeof browser.storage.onChanged.addListener>[0] = (
      changes,
      areaName,
    ) => {
      if (areaName !== 'local') return;
      if (!changes[PUBLIC_OPTIONS_STORAGE_CHANGE_KEY]) return;
      void reconcile(location.href);
    };

    browser.storage.onChanged.addListener(onStorageChanged);

    ctx.onInvalidated(() => {
      invalidated = true;
      activeController?.abort();
      browser.storage.onChanged.removeListener(onStorageChanged);
      void removeSafely(options, location.href);
    });
  };
};
