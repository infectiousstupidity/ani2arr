import { expect, it, vi } from "vitest";
import { getPublicOptionsSnapshot } from "@/settings/store";
import { logger } from "@/shared/utils/logger";
import { optionsHandlers } from "./options.handlers";

it("configures logging only after a logging update and preserves it on unrelated saves", async () => {
	using configure = vi.spyOn(logger, "configure").mockImplementation(() => {});
	await expect(
		optionsHandlers.updatePublicOptions({ type: "debugLogging", value: true }),
	).resolves.toEqual({ ok: true });
	await optionsHandlers.updatePublicOptions({
		type: "radarrDefaults",
		defaults: { freeformTags: ["anime"] },
	});

	expect(configure).toHaveBeenCalledExactlyOnceWith({ enabled: true });
	await expect(getPublicOptionsSnapshot()).resolves.toMatchObject({
		debugLogging: true,
		providers: { radarr: { defaults: { freeformTags: ["anime"] } } },
	});
});
