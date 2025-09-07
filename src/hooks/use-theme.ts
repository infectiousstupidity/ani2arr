// src/hooks/use-theme.ts
import React, { useLayoutEffect } from 'react';

// Centralized configuration for theme detection
const themeConfig = new Map<string, { selector: string; darkClass: string }>([
  ['anilist.co', { selector: 'body', darkClass: 'site-theme-dark' }],
  // Future sites can be added here
]);

/**
 * A React hook that applies the correct theme to a Shadow DOM host element.
 * It observes the host page for theme changes and syncs them.
 * @param refToChildOfHost A React ref pointing to an element *inside* the Shadow DOM.
 */
export function useTheme(refToChildOfHost: React.RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    // 1. Get the element inside the shadow DOM from the ref.
    const childElement = refToChildOfHost.current;
    if (!childElement) return;

    // 2. Find the root node of that element. If it's a ShadowRoot, get its host.
    const rootNode = childElement.getRootNode();
    if (!(rootNode instanceof ShadowRoot)) {
        // Not in a shadow DOM, do nothing.
        return;
    }
    const hostElement = rootNode.host as HTMLElement;

    // 3. The rest of the logic now correctly targets the hostElement.
    const config = themeConfig.get(window.location.hostname);
    if (!config) return;

    const targetNode = document.querySelector(config.selector);
    if (!targetNode) return;

    const syncTheme = () => {
      const isDark = targetNode.classList.contains(config.darkClass);
      // Apply the 'dark' class to the actual shadow host.
      hostElement.classList.toggle('dark', isDark);
    };

    // Initial sync
    syncTheme();

    // Observe for changes
    const observer = new MutationObserver(syncTheme);
    observer.observe(targetNode, { attributes: true, attributeFilter: ['class'] });

    return () => observer.disconnect();
  }, [refToChildOfHost]); // Dependency array is correct.
}