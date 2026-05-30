/** Public RPC handlers surface that assembles focused handler modules into the full API contract. */
// src/rpc/handlers/index.ts

import type { Ani2arrApi } from "@/rpc";
import { anilistHandlers } from "./anilist.handlers";
import { maintenanceHandlers } from "./maintenance.handlers";
import { mappingHandlers } from "./mapping.handlers";
import { optionsHandlers } from "./options.handlers";
import { providerHandlers } from "./provider.handlers";
import { radarrHandlers } from "./radarr.handlers";
import { sonarrHandlers } from "./sonarr.handlers";

export const apiHandlers = {
	...optionsHandlers,
	...providerHandlers,
	...sonarrHandlers,
	...radarrHandlers,
	...mappingHandlers,
	...anilistHandlers,
	...maintenanceHandlers,
} satisfies Ani2arrApi;
