/** Runs the bounded shared-mapping storage upgrade and alias consolidation. */

import {
	consolidateAutomaticAliases,
	hasAutomaticAliasRecords,
	migrateAutomaticStore,
} from "./auto.store";
import {
	consolidateManualAliases,
	hasManualAliasRecords,
	migrateManualStore,
} from "./manual.store";
import {
	getSourceAliasesByAniListId,
	migrateUpstreamStore,
} from "./upstream.store";

export async function migrateMappingStorage(): Promise<boolean> {
	const deletedUpstream = await migrateUpstreamStore();
	await Promise.all([migrateManualStore(), migrateAutomaticStore()]);
	await consolidateMappingAliases();
	return deletedUpstream;
}

export async function consolidateMappingAliases(): Promise<void> {
	const [manual, automatic] = await Promise.all([
		hasManualAliasRecords(),
		hasAutomaticAliasRecords(),
	]);
	// Building the alias map walks every upstream record; skip it when no store has aliases.
	if (!manual && !automatic) return;
	const aliases = await getSourceAliasesByAniListId();
	await Promise.all([
		manual ? consolidateManualAliases(aliases) : undefined,
		automatic ? consolidateAutomaticAliases(aliases) : undefined,
	]);
}
