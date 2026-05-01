/** Thin AniList anime-page content entrypoint that delegates to the page owner. */
// src/entrypoints/anilist-anime.content.tsx

import { main } from '@/content/anilist/anime-page';

export default defineContentScript({
  matches: ['*://anilist.co/*'],
  cssInjectionMode: 'ui',
  runAt: 'document_end',
  main,
});
