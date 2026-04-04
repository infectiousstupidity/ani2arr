/** Background entrypoint that delegates boot wiring to the background owner. */
// src/entrypoints/background/index.ts

import { bootstrapBackground } from '@/background/bootstrap';

export default defineBackground(() => {
  bootstrapBackground();
});
