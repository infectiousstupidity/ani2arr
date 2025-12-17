// src/shared/utils/background-ready.ts
import { browser } from 'wxt/browser';

/**
 * Waits for the background script to be ready by pinging it.
 * Retries a few times with exponential backoff to cover MV3/event background wake-up.
 */
export async function awaitBackgroundReady(
  attempts = 5,
  baseDelayMs = 150,
  maxDelayMs = 1000,
): Promise<void> {
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = (await browser.runtime.sendMessage({
        _a2a: true,
        type: 'a2a:ping',
        timestamp: Date.now(),
      })) as { ok?: boolean } | undefined;
      if (res?.ok) return;
    } catch {
      // ignore and retry
    }
    const jitter = Math.floor(Math.random() * 100);
    const delay = Math.min(baseDelayMs * Math.pow(2, i - 1) + jitter, maxDelayMs);
    await new Promise(r => setTimeout(r, delay));
  }
}
