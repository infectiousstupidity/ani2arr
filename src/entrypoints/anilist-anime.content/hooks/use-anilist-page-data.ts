// src/entrypoints/anilist-anime.content/hooks/use-anilist-page-data.ts
import { useState, useEffect } from 'react';

// FIX: Renamed the function to be specific to its purpose and domain (AniList).
export function useAnilistPageData(): { anilistId: number; title: string } | null {
  const [data, setData] = useState<{ anilistId: number; title: string } | null>(null);

  useEffect(() => {
    const updateData = () => {
      // This logic is tightly coupled to the AniList DOM structure.
      const title = document.querySelector('h1')?.textContent?.trim();
      const match = window.location.pathname.match(/\/anime\/(\d+)/);
      const anilistId = match && typeof match[1] === 'string' ? parseInt(match[1], 10) : undefined;

      if (title && typeof anilistId === 'number' && !isNaN(anilistId)) {
        setData({ title, anilistId });
      } else {
        setData(null);
      }
    };

    // Initial update
    updateData();

    // This handles SPA navigation within anilist.co
    const handleNavigation = () => {
      // A small delay ensures the DOM has time to update after a client-side route change.
      setTimeout(updateData, 100);
    };

    window.addEventListener('popstate', handleNavigation);

    const originalPushState = history.pushState;
    history.pushState = function (...args) {
      originalPushState.apply(history, args);
      handleNavigation();
    };

    const originalReplaceState = history.replaceState;
    history.replaceState = function (...args) {
      originalReplaceState.apply(history, args);
      handleNavigation();
    };

    return () => {
      window.removeEventListener('popstate', handleNavigation);
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
    };
  }, []);

  return data;
}