/** Waits for the extension background context to answer a runtime ping before UI work starts. */
// src/content/core/await-background-ready.ts

import { browser } from 'wxt/browser';

const BACKGROUND_READY_ATTEMPTS = 5;
const BACKGROUND_READY_BASE_DELAY_MS = 150;
const BACKGROUND_READY_MAX_DELAY_MS = 1000;
const BACKGROUND_READY_JITTER_MS = 100;

const sleep = (delayMs: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, delayMs));

function getRetryDelayMs(attempt: number): number {
  const jitterMs = Math.floor(Math.random() * BACKGROUND_READY_JITTER_MS);
  return Math.min(
    BACKGROUND_READY_BASE_DELAY_MS * 2 ** (attempt - 1) + jitterMs,
    BACKGROUND_READY_MAX_DELAY_MS,
  );
}

export async function awaitBackgroundReady(): Promise<void> {
  for (let attempt = 1; attempt <= BACKGROUND_READY_ATTEMPTS; attempt++) {
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

    if (attempt < BACKGROUND_READY_ATTEMPTS) {
      await sleep(getRetryDelayMs(attempt));
    }
  }

  throw new Error('Extension background did not respond to readiness ping.');
}
