/** Storage-backed revision counters used for cross-context invalidation and refresh signals. */
// src/storage/revisions.store.ts

import { browser } from 'wxt/browser';
import { REVISION_KEYS } from './keys';

export type RevisionKey = keyof typeof REVISION_KEYS;

const getStorageKey = (key: RevisionKey): string => REVISION_KEYS[key];

export async function bumpRevision(key: RevisionKey): Promise<number> {
  const storageKey = getStorageKey(key);
  const next = Date.now();
  await browser.storage.local.set({ [storageKey]: next });
  return next;
}

export async function resetAllRevisions(): Promise<void> {
  await browser.storage.local.remove(Object.values(REVISION_KEYS));
}
