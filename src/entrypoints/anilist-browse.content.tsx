/** Thin WXT boot file for the AniList browse content script. */
// src/entrypoints/anilist-browse.content.tsx

import { main } from '@/content/anilist/browse';

export default defineContentScript({
  matches: ['*://anilist.co/*'],
  cssInjectionMode: 'ui',
  main,
});
