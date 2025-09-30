import type { FullConfig } from '@playwright/test';
import { startTestServer } from './server';

export default async function globalSetup(_config: FullConfig) {
  const server = await startTestServer();
  process.env.KITSUNARR_E2E_BASE_URL = server.baseUrl;

  return async () => {
    await server.close();
  };
}
