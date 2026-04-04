/** Background API assembly for the Ani2arr RPC implementation. */
// src/background/api/create-background-api.ts

import type { Ani2arrApi } from '@/rpc';
import { createApiHandlers } from '@/rpc/handlers';
import { createApiDeps } from './create-api-deps';

export const createBackgroundApi = (): Ani2arrApi => {
  return createApiHandlers(createApiDeps());
};
