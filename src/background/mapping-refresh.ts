/** Background-owned AniBridge refresh and cross-context invalidation workflow. */

import { refreshUpstreamMappings } from "@/mapping/upstream.store";
import { bumpMappingsRevision } from "@/rpc/revision-signals";

export async function refreshMappingPipeline(): Promise<boolean> {
	const changed = await refreshUpstreamMappings();
	if (changed) await bumpMappingsRevision();
	return changed;
}
