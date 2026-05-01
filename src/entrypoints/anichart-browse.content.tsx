/** Thin WXT boot file for the AniChart browse content script. */
// src/entrypoints/anichart-browse.content.tsx

import { main } from '@/content/anichart/browse';

export default defineContentScript({
  matches: ['*://anichart.net/*', '*://www.anichart.net/*'],
  cssInjectionMode: 'ui',
  main,
});
