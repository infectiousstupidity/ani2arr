import { browser } from 'wxt/browser';
import { REVISION_KEYS } from './keys';

export type RevisionKey = keyof typeof REVISION_KEYS;

const getStorageKey = (key: RevisionKey): string => REVISION_KEYS[key];

export async function getRevision(key: RevisionKey): Promise<number> {
  try {
    const storageKey = getStorageKey(key);
    const stored = await browser.storage.local.get(storageKey);
    const value = stored[storageKey];
    return typeof value === 'number' ? value : 0;
  } catch {
    return 0;
  }
}

export async function bumpRevision(key: RevisionKey): Promise<number> {
  const storageKey = getStorageKey(key);
  const current = await getRevision(key);
  const next = current + 1;
  await browser.storage.local.set({ [storageKey]: next });
  return next;
}

export async function resetAllRevisions(): Promise<void> {
  await browser.storage.local.remove(Object.values(REVISION_KEYS));
}
