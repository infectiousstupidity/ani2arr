/** Public RPC handlers surface that assembles focused handler modules into the full API contract. */
// src/rpc/handlers/index.ts

import type { Ani2arrApi } from "@/rpc";
import type { ApiHandlerDeps } from "./handler-deps";
import { createAnilistHandlers } from "./anilist.handlers";
import { createLibraryHandlers } from "./library.handlers";
import { createMaintenanceHandlers } from "./maintenance.handlers";
import { createMappingHandlers } from "./mapping.handlers";
import { createOptionsHandlers } from "./options.handlers";
import { createProviderHandlers } from "./provider.handlers";
import { createRadarrHandlers } from "./radarr.handlers";
import { createSonarrHandlers } from "./sonarr.handlers";

export function createApiHandlers(deps: ApiHandlerDeps): Ani2arrApi {
	return {
		...createOptionsHandlers(deps),
		...createLibraryHandlers(deps),
		...createProviderHandlers(deps),
		...createSonarrHandlers(deps),
		...createRadarrHandlers(deps),
		...createMappingHandlers(deps),
		...createAnilistHandlers(deps),
		...createMaintenanceHandlers(deps),
	} satisfies Ani2arrApi;
}
