/** Runs the bounded shared-mapping storage upgrade and alias consolidation. */

import {
	consolidateAutomaticAliases,
	migrateAutomaticStore,
} from "./auto.store";
import {
	consolidateManualAliases,
	migrateManualStore,
} from "./manual.store";
import {
	getSourceAliasesByAniListId,
	migrateUpstreamStore,
} from "./upstream.store";

export async function migrateMappingStorage(): Promise<void> {
	await migrateUpstreamStore();
	await Promise.all([migrateManualStore(), migrateAutomaticStore()]);
	const aliases = await getSourceAliasesByAniListId();
	await Promise.all([
		consolidateManualAliases(aliases),
		consolidateAutomaticAliases(aliases),
	]);
}

export async function consolidateMappingAliases(): Promise<void> {
	const aliases = await getSourceAliasesByAniListId();
	await Promise.all([
		consolidateManualAliases(aliases),
		consolidateAutomaticAliases(aliases),
	]);
}
