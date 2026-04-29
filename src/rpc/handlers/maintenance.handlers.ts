/** RPC handlers for cache clearing and full extension reset workflows. */
// src/rpc/handlers/maintenance.handlers.ts

import type { Ani2arrApi } from "@/rpc";
import type { ApiHandlerDeps } from "./handler-deps";

export function createMaintenanceHandlers(
	deps: ApiHandlerDeps,
): Pick<Ani2arrApi, "clearPersistentCaches" | "resetExtensionState"> {
	const {
		clearPersistentCaches: clearPersistentCachesWorkflow,
		resetExtensionState: resetExtensionStateWorkflow,
	} = deps;

	const handlers = {
		async clearPersistentCaches() {
			await clearPersistentCachesWorkflow();
			return { ok: true as const };
		},

		async resetExtensionState() {
			await resetExtensionStateWorkflow();
			return { ok: true as const };
		},
	} satisfies Pick<Ani2arrApi, "clearPersistentCaches" | "resetExtensionState">;

	return handlers;
}
