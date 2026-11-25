/** Background-owned AniBridge refresh and cross-context invalidation workflow. */

import { refreshUpstreamMappings } from "@/mapping/upstream.store";
import { consolidateMappingAliases } from "@/mapping/migrate";
import { bumpMappingsRevision } from "@/rpc/revision-signals";
import { captureResetGuard } from "./api-services";

export async function refreshMappingPipeline(): Promise<boolean> {
	const isCurrent = captureResetGuard();
	if (!isCurrent()) return false;
	const changed = await refreshUpstreamMappings();
	if (!isCurrent()) return false;
	await consolidateMappingAliases();
	if (!isCurrent()) return false;
	if (changed) await bumpMappingsRevision();
	return changed;
}
