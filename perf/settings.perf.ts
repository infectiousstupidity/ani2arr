import { describe, it } from "vitest";
import { getExtensionOptionsSnapshot, saveProviderConnectionSnapshot } from "@/settings/store";
import { time, useRealisticStorage } from "./helpers";

describe("settings snapshot", () => {
	it("100 reads (= 50 status RPCs)", async () => {
		useRealisticStorage();
		await saveProviderConnectionSnapshot("sonarr", { url: "https://sonarr.local:8989", apiKey: "0123456789abcdef0123456789abcdef" });
		await time("100 x getExtensionOptionsSnapshot", async () => {
			for (let index = 0; index < 100; index += 1) await getExtensionOptionsSnapshot();
		}, 5);
	});
});
