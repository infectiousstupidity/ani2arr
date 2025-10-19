import type { TestInfo } from '@playwright/test';
import {
  createExtensionHarness,
  collectBackgroundDiagnostics,
  readLibraryEpoch,
  waitForLibraryEpochBump,
  testServerBaseUrl,
  type ExtensionHarness,
} from './extension';

export { collectBackgroundDiagnostics, readLibraryEpoch, waitForLibraryEpochBump, testServerBaseUrl };
export type { ExtensionHarness };

export async function attachJson(testInfo: TestInfo, name: string, payload: unknown): Promise<void> {
  try {
    const serialized = JSON.stringify(payload ?? null, null, 2) ?? 'null';
    await testInfo.attach(name, {
      body: Buffer.from(serialized, 'utf8'),
      contentType: 'application/json',
    });
  } catch (error) {
    console.warn(`[E2E] Failed to attach ${name}:`, (error as Error).message);
  }
}

export async function withChromiumHarness<T>(
  testInfo: TestInfo,
  run: (harness: ExtensionHarness) => Promise<T>,
): Promise<T> {
  const harness = await createExtensionHarness({
    headless: testInfo.project.use.headless ?? true,
  });
  try {
    return await run(harness);
  } finally {
    await harness.cleanup();
  }
}
