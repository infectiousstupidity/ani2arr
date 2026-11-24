import { describe, it } from "vitest";
import { migrateMappingStorage } from "@/mapping/migrate";
import { getSourceAliasesByAniListId } from "@/mapping/upstream.store";
import { consolidateManualAliases } from "@/mapping/manual.store";
import { consolidateAutomaticAliases } from "@/mapping/auto.store";
import { seedUpstream, time, useRealisticStorage } from "./helpers";

describe("worker wake breakdown (caches warm, so CPU only)", () => {
	it("parts", async () => {
		useRealisticStorage();
		await seedUpstream();
		await migrateMappingStorage();
		const { result: aliases } = await time("getSourceAliasesByAniListId", () => getSourceAliasesByAniListId(), 5);
		await time("consolidateManualAliases", () => consolidateManualAliases(aliases), 5);
		await time("consolidateAutomaticAliases", () => consolidateAutomaticAliases(aliases), 5);
		await time("migrateMappingStorage warm", () => migrateMappingStorage(), 5);
	});
});
