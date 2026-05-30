/** RPC handlers for cache clearing and full extension reset workflows. */
// src/rpc/handlers/maintenance.handlers.ts

import {
	clearPersistentCaches as clearPersistentCachesWorkflow,
	resetExtensionState as resetExtensionStateWorkflow,
} from "@/background/api-services";

export const maintenanceHandlers = {
	async clearPersistentCaches() {
		await clearPersistentCachesWorkflow();
		return { ok: true as const };
	},

	async resetExtensionState() {
		await resetExtensionStateWorkflow();
		return { ok: true as const };
	},
};
