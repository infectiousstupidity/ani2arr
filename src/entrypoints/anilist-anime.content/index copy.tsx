// src/entrypoints/anilist-anime.content/index.tsx

import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTheme } from '@/hooks/use-theme';
import { useSeriesStatus, useAddSeries, useExtensionOptions } from '@/hooks/use-api-queries';
import SonarrActionGroup from '@/ui/SonarrActionGroup';
import './style.css';

const queryClient = new QueryClient();

// A utility to wait for an element to appear in the DOM, crucial for SPAs.
function waitForElement(selector: string): Promise<Element> {
  return new Promise(resolve => {
    const element = document.querySelector(selector);
    if (element) return resolve(element);

    const observer = new MutationObserver(() => {
      const targetElement = document.querySelector(selector);
      if (targetElement) {
        resolve(targetElement);
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

interface ContentRootProps {
  anilistId: number;
  title: string;
}

const ContentRoot: React.FC<ContentRootProps> = ({ anilistId, title }) => {
  const hostRef = React.useRef<HTMLDivElement>(null);
  useTheme(hostRef);

  const [isModalOpen, setIsModalOpen] = React.useState(false);

  // 1. Fetch settings first to check for configuration.
  const { data: options } = useExtensionOptions();
  const isConfigured = !!options?.sonarrUrl && !!options.sonarrApiKey;

  // 2. The status query is now the single source of truth for mapping and status.
  // It's enabled as long as we have an anilistId.
  const statusQuery = useSeriesStatus(
    { anilistId },
    { enabled: !!anilistId, force_verify: true }
  );
  
  const addSeriesMutation = useAddSeries();
  
  React.useEffect(() => {
    console.log('[Kitsunarr] ContentRoot mount', { anilistId, title, options, isConfigured });
  }, [anilistId, title, options, isConfigured]);

  React.useEffect(() => {
    if (statusQuery.isError) {
      console.error('[Kitsunarr] statusQuery error', statusQuery.error);
    }
    if (addSeriesMutation.isError) {
      console.error('[Kitsunarr] addSeriesMutation error', addSeriesMutation.error);
    }
  }, [statusQuery.isError, statusQuery.error, addSeriesMutation.isError, addSeriesMutation.error]);

  const handleQuickAdd = () => {
    // Guide user to settings if they try to add while unconfigured.
    if (!isConfigured) {
      alert('Please configure your Sonarr settings first.');
      browser.runtime.openOptionsPage();
      return;
    }
    addSeriesMutation.mutate({ anilistId, title });
  };

  const getStatus = (): 'LOADING' | 'IN_SONARR' | 'NOT_IN_SONARR' | 'ERROR' | 'ADDING' => {
    // This function will correctly return 'LOADING' when the query is running.
    if (statusQuery.isLoading) return 'LOADING';
    if (statusQuery.isError) return 'ERROR';
    if (statusQuery.data?.exists) return 'IN_SONARR';
    
    if (addSeriesMutation.isPending) return 'ADDING';
    if (addSeriesMutation.isSuccess) return 'IN_SONARR';
    if (addSeriesMutation.isError) return 'ERROR';
    
    return 'NOT_IN_SONARR';
  };

  // 3. Derive tvdbId and the correct search term from the query data.
  // These will be undefined during the initial load, which is handled gracefully by SonarrActionGroup.
  const tvdbId = statusQuery.data?.tvdbId;
  const resolvedSearchTerm = statusQuery.data?.successfulSynonym ?? title;

  return (
    <div ref={hostRef} className="w-full">
      <SonarrActionGroup
        status={getStatus()}
        seriesTitleSlug={statusQuery.data?.series?.titleSlug ?? addSeriesMutation.data?.titleSlug}
        animeTitle={title}
        resolvedSearchTerm={resolvedSearchTerm}
        tvdbId={tvdbId}
        onQuickAdd={handleQuickAdd}
        onOpenModal={() => setIsModalOpen(true)}
        portalContainer={hostRef.current ?? undefined}
      />
      <React.Suspense fallback={null}>
        {isModalOpen && hostRef.current &&
          React.createElement(React.lazy(() => import('@/ui/AddSeriesModal')), {
            anilistId,
            title,
            isOpen: isModalOpen,
            onClose: () => setIsModalOpen(false),
            portalContainer: hostRef.current,
          })}
      </React.Suspense>
    </div>
  );
};

const ANIME_PAGE_PATTERN = new MatchPattern('*://anilist.co/anime/*');
const UI_NAME = 'kitsunarr-anime-page-ui';

async function mountAnimePageUI(ctx) {
  const match = window.location.pathname.match(/\/anime\/(\d+)/);
  const anilistId = match && match[1] ? parseInt(match[1], 10) : null;
  const title = document.querySelector('h1')?.textContent?.trim() ?? null;

  console.log('[Kitsunarr] mountAnimePageUI called', { anilistId, title, pathname: window.location.pathname });

  if (!anilistId || !title) {
    console.warn('[Kitsunarr] Could not find anilistId or title on page. Aborting mount.');
    return;
  }

  const ui = await createShadowRootUi(ctx, {
    name: UI_NAME,
    position: 'inline',
    anchor: 'div.cover-wrap-inner',
    append: 'last',
    onMount: container => {
      container.style.width = '100%';
      container.style.marginTop = '15px';
      const root = ReactDOM.createRoot(container);
      root.render(
        <QueryClientProvider client={queryClient}>
          <ContentRoot anilistId={anilistId} title={title} />
        </QueryClientProvider>
      );
      console.log('[Kitsunarr] UI mounted for AniList ID', anilistId);
      return root;
    },
    onRemove: (root: ReactDOM.Root | undefined) => {
      root?.unmount();
    },
  });

  ui.mount();
}

export default defineContentScript({
  matches: ['*://anilist.co/*'], // Broad match for SPA handling
  cssInjectionMode: 'ui',
  
  async main(ctx) {
    const handleLocationChange = async (url: string) => {
      
      if (ANIME_PAGE_PATTERN.includes(url)) {
        // Wait for the page content to be ready before mounting.
        await waitForElement('div.cover-wrap-inner');
        await waitForElement('h1');
        mountAnimePageUI(ctx);
      }
    };

    // Initial check for the current page.
    handleLocationChange(location.href);

    // Listen for SPA navigation events.
    ctx.addEventListener(window, 'wxt:locationchange', e => {
      handleLocationChange(e.newUrl.href);
    });
  },
});