/** Background entrypoint that delegates boot wiring to the background owner. */
// src/entrypoints/background.ts

import { bootstrapBackground } from "@/background/bootstrap";

export default defineBackground(() => {
	bootstrapBackground();
});
