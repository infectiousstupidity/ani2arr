/** Public surface for browse overlay feature factories, UI, and root composition. */
// src/features/media-overlay/index.ts

export {
  createBrowseContentApp,
  DEFAULT_CONTAINER_CLASS,
  DEFAULT_PROCESSED_ATTRIBUTE,
} from './components/media-overlay';

export { CardOverlay } from './components/card-overlay';
export { BrowseRoot } from './components/browse-root';

export type { BrowseAdapter, ParsedCard, BrowseContentAppProps } from './components/media-overlay';
export type { BrowseRootProps } from './components/browse-root';
export type { CardOverlayProps } from '@/shared/types';
