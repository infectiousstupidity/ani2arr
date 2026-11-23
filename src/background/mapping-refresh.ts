/** Background-owned AniBridge refresh and cross-context invalidation workflow. */

import { refreshUpstreamMappings } from "@/mapping/upstream.store";
import { consolidateMappingAliases } from "@/mapping/migrate";
import { bumpMappingsRevision } from "@/rpc/revision-signals";

export async function refreshMappingPipeline(): Promise<boolean> {
	const changed = await refreshUpstreamMappings();
	await consolidateMappingAliases();
	if (changed) await bumpMappingsRevision();
	return changed;
}
