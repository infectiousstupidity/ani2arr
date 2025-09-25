// src/hooks/use-theme.ts
import React, { useLayoutEffect } from 'react';

type ThemeConfig = {
  selector: string;
  /** Attributes to watch on the target node. Defaults to `['class']`. */
  attributeFilter?: string[];
  /** Returns true when the host page should be treated as dark mode. */
  isDark: (target: Element) => boolean;
  /** Optional media query that should resync the theme when it changes. */
  mediaQuery?: string;
};

const prefersDarkQuery = '(prefers-color-scheme: dark)';

const getAnichartIsDark = (target: Element): boolean => {
  const classList = target.classList;

  if (classList.contains('site-theme-dark')) return true;
  if (classList.contains('site-theme-default')) return false;
  if (classList.contains('site-theme-contrast')) return false;

  if (classList.contains('site-theme-system')) {
    return typeof window.matchMedia === 'function'
      ? window.matchMedia(prefersDarkQuery).matches
      : false;
  }

  // Fallbacks for any other custom data attributes they may add later on.
  const dataTheme = (target as HTMLElement).dataset?.theme ?? target.getAttribute('data-theme');
  if (typeof dataTheme === 'string') {
    const normalized = dataTheme.toLowerCase();
    if (normalized.includes('dark')) return true;
    if (normalized.includes('light')) return false;
  }

  return classList.contains('dark');
};

const themeConfig = new Map<string, ThemeConfig>([
  [
    'anilist.co',
    {
      selector: 'body',
      attributeFilter: ['class'],
      isDark: target => target.classList.contains('site-theme-dark'),
    },
  ],
  [
    'anichart.net',
    {
      selector: 'body',
      attributeFilter: ['class'],
      isDark: getAnichartIsDark,
      mediaQuery: prefersDarkQuery,
    },
  ],
]);

const DEFAULT_ATTRIBUTE_FILTER = ['class'];

export function useTheme(refToChildOfHost: React.RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const childElement = refToChildOfHost.current;
    if (!childElement) return;

    const rootNode = childElement.getRootNode();
    if (!(rootNode instanceof ShadowRoot)) {
      return;
    }

    const hostElement = rootNode.host as HTMLElement;
    const config = themeConfig.get(window.location.hostname);
    if (!config) return;

    const targetNode = document.querySelector(config.selector);
    if (!targetNode) return;

    const syncTheme = () => {
      const isDark = config.isDark(targetNode);
      hostElement.classList.toggle('dark', isDark);
    };

    syncTheme();

    const observer = new MutationObserver(syncTheme);
    observer.observe(targetNode, {
      attributes: true,
      attributeFilter: config.attributeFilter ?? DEFAULT_ATTRIBUTE_FILTER,
    });

    let mediaCleanup: (() => void) | undefined;

    if (config.mediaQuery && typeof window.matchMedia === 'function') {
      const mediaQueryList = window.matchMedia(config.mediaQuery);
      const handleMediaChange = () => syncTheme();

      if (typeof mediaQueryList.addEventListener === 'function') {
        mediaQueryList.addEventListener('change', handleMediaChange);
        mediaCleanup = () => mediaQueryList.removeEventListener('change', handleMediaChange);
      } else if (typeof mediaQueryList.addListener === 'function') {
        mediaQueryList.addListener(handleMediaChange);
        mediaCleanup = () => mediaQueryList.removeListener(handleMediaChange);
      }
    }

    return () => {
      observer.disconnect();
      if (mediaCleanup) mediaCleanup();
    };
  }, [refToChildOfHost]);
}
