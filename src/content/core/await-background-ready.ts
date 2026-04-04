/** Waits for the extension background context to answer a runtime ping before UI work starts. */
// src/shared/browser/await-background-ready.ts

import { browser } from 'wxt/browser';

export async function awaitBackgroundReady(
  attempts = 5,
  baseDelayMs = 150,
  maxDelayMs = 1000,
): Promise<void> {
  for (let i = 1; i <= attempts; i++) {
    try {
      const response = (await browser.runtime.sendMessage({
        _a2a: true,
        type: 'a2a:ping',
        timestamp: Date.now(),
      })) as { ok?: boolean } | undefined;

      if (response?.ok) {
        return;
      }
    } catch {
      // Ignore transient failures while the background wakes up.
    }

    const jitterMs = Math.floor(Math.random() * 100);
    const delayMs = Math.min(baseDelayMs * 2 ** (i - 1) + jitterMs, maxDelayMs);
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
}
