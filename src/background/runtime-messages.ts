/** Background runtime message handling for ping, options opening, and A2A coordination. */
// src/background/runtime-messages.ts

import { browser } from "wxt/browser";
import * as v from "valibot";
import { AniListIdSchema } from "@/anilist/anilist-id";

export const installBackgroundRuntimeMessages = (): void => {
	const A2AMessageSchema = v.union([
		v.object({
			_a2a: v.literal(true),
			type: v.literal("a2a:ping"),
			timestamp: v.optional(v.number()),
		}),
		v.object({
			_a2a: v.literal(true),
			type: v.literal("OPEN_OPTIONS_PAGE"),
			sectionId: v.optional(
				v.picklist(["sonarr", "radarr", "mappings", "ui", "advanced"]),
			),
			targetAnilistId: v.optional(AniListIdSchema),
		}),
	]);
	browser.runtime.onMessage.addListener(
		(message: unknown, sender?: { id?: string }): Promise<unknown> | void => {
			const senderId = (sender as { id?: string } | undefined)?.id;
			const msg = v.safeParse(A2AMessageSchema, message);
			if (!msg.success) return;
			const parsed = msg.output;

			if (senderId !== browser.runtime.id) {
				return;
			}

			if (parsed.type === "a2a:ping") {
				return Promise.resolve({ ok: true as const });
			}

			if (parsed.type === "OPEN_OPTIONS_PAGE") {
				const open = async (): Promise<void> => {
					try {
						const section =
							parsed.sectionId === "sonarr" ||
							parsed.sectionId === "radarr" ||
							parsed.sectionId === "mappings" ||
							parsed.sectionId === "ui" ||
							parsed.sectionId === "advanced"
								? parsed.sectionId
								: null;

						const baseUrl = browser.runtime.getURL("/options.html");
						const targetHash =
							parsed.targetAnilistId
								? `?anilistId=${parsed.targetAnilistId}`
								: "";

						let url = baseUrl;
						if (section) {
							url = `${baseUrl}#/options/${section}${targetHash}`;
						} else if (targetHash) {
							url = `${baseUrl}#${targetHash}`;
						}

						await browser.tabs.create({ url });
					} catch {
						try {
							await browser.runtime.openOptionsPage();
						} catch {
							// best-effort only
						}
					}
				};

				void open();
				return;
			}
		},
	);
};
