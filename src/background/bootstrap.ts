/** Background bootstrap wiring for API registration, lifecycle, and message handlers. */
// src/background/bootstrap.ts

import { browser } from "wxt/browser";
import * as v from "valibot";
import { registerAni2arrApi } from "@/rpc";
import { apiHandlers } from "@/rpc/handlers";
import { logger } from "@/shared/utils/logger";
import type { AniListId } from "@/anilist/types";
import { getExtensionOptionsSnapshot } from "@/settings/store";
import { hasConfiguredProviderCredentials } from "@/settings/provider-config";
import { hasConfiguredSeerrCredentials } from "@/settings/seerr-config";
import {
	logError,
	normalizeError,
} from "@/shared/errors/error-utils";

const log = logger.create("Background");
const MAPPING_REFRESH_ALARM = "a2a:refresh-static-mappings";
const MAPPING_REFRESH_PERIOD_MIN = 360;
const AniListIdSchema = v.pipe(
	v.number(),
	v.finite(),
	v.integer(),
	v.minValue(1),
	v.transform((value): AniListId => value as AniListId),
);

const A2AMessageSchema = v.union([
	v.object({
		_a2a: v.literal(true),
		type: v.literal("a2a:ping"),
		timestamp: v.number(),
	}),
	v.object({
		_a2a: v.literal(true),
		type: v.literal("OPEN_OPTIONS_PAGE"),
		timestamp: v.number(),
		sectionId: v.optional(
			v.picklist(["sonarr", "radarr", "seerr", "mappings", "ui", "advanced"]),
		),
		targetAnilistId: v.optional(AniListIdSchema),
	}),
]);

async function shouldWarmMappingsCache(): Promise<boolean> {
	try {
		const options = await getExtensionOptionsSnapshot();
		return (
			hasConfiguredProviderCredentials(options, "sonarr") ||
			hasConfiguredProviderCredentials(options, "radarr") ||
			hasConfiguredSeerrCredentials(options)
		);
	} catch (error) {
		logError(normalizeError(error), "Background:shouldWarmMappingsCache");
		return false;
	}
}

async function ensurePeriodicRefresh(): Promise<void> {
	const existing = await browser.alarms.get(MAPPING_REFRESH_ALARM);
	if (!existing) {
		browser.alarms.create(MAPPING_REFRESH_ALARM, {
			periodInMinutes: MAPPING_REFRESH_PERIOD_MIN,
		});
	}
}

export const bootstrapBackground = (): void => {
	log.info("Background initializing…");

	registerAni2arrApi(apiHandlers);

	browser.runtime.onInstalled.addListener(async (details) => {
		try {
			if (details.reason === "install" && import.meta.env.MODE !== "test") {
				browser.runtime.openOptionsPage().catch(() => {});
			}
			if (await shouldWarmMappingsCache()) {
				await apiHandlers.initMappings();
			}
			await ensurePeriodicRefresh();
		} catch (error) {
			logError(normalizeError(error), "Background:onInstalled");
		}
	});

	browser.runtime.onStartup.addListener(async () => {
		try {
			if (await shouldWarmMappingsCache()) {
				await apiHandlers.initMappings();
			}
			await ensurePeriodicRefresh();
		} catch (error) {
			logError(normalizeError(error), "Background:onStartup");
		}
	});

	browser.alarms.onAlarm.addListener((alarm) => {
		if (alarm.name !== MAPPING_REFRESH_ALARM) return;

		void (async () => {
			try {
				if (await shouldWarmMappingsCache()) {
					await apiHandlers.initMappings();
				}
			} catch (error) {
				logError(normalizeError(error), "Background:initMappings:alarm");
			}
		})();
	});

	browser.runtime.onMessage.addListener(
		(message: unknown, sender): Promise<unknown> | void => {
			if (sender.id !== browser.runtime.id) return;

			const parsed = v.safeParse(A2AMessageSchema, message);
			if (!parsed.success) return;
			const msg = parsed.output;

			if (msg.type === "a2a:ping") {
				return Promise.resolve({ ok: true as const });
			}

			if (msg.type === "OPEN_OPTIONS_PAGE") {
				const targetHash = msg.targetAnilistId
					? `?anilistId=${msg.targetAnilistId}`
					: "";
				const hash = [msg.sectionId, targetHash]
					.filter((p): p is string => !!p)
					.join("");
				const url = `${browser.runtime.getURL("/options.html")}${hash ? `#${hash}` : ""}`;

				browser.tabs.create({ url }).catch(() => {
					browser.runtime.openOptionsPage().catch(() => {});
				});
				return;
			}
			return;
		},
	);

	getExtensionOptionsSnapshot()
		.then((options) =>
			logger.configure({
				enabled: options.debugLogging || import.meta.env.DEV,
			}),
		)
		.catch(() => {});

	log.info("Background setup complete.");
};
