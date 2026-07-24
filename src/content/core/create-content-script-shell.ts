/** Shared content-script shell orchestration for eligibility, remount, and cleanup. */
// src/content/core/create-content-script-shell.ts

import { browser } from "wxt/browser";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { awaitBackgroundReady } from "./await-background-ready";
import {
	getPublicOptionsSnapshot,
	PUBLIC_OPTIONS_CHANGE_KEY,
} from "@/settings/store";
import type { PublicOptions } from "@/settings/types";
import { logger } from "@/shared/utils/logger";

export interface ContentEntrypointShellContext {
	ctx: ContentScriptContext;
	url: string;
	publicOptions: PublicOptions;
	signal: AbortSignal;
	isCurrent: () => boolean;
}

export interface ContentEntrypointShellOptions {
	isEligible: (
		context: ContentEntrypointShellContext,
	) => boolean | Promise<boolean>;
	mount: (context: ContentEntrypointShellContext) => void | Promise<void>;
	remove: () => void | Promise<void>;
	onError?: (
		error: unknown,
		phase: "load-public-options" | "evaluate" | "mount" | "remove",
		url: string,
	) => void;
}

const isAbortError = (error: unknown): boolean =>
	error instanceof DOMException && error.name === "AbortError";

const removeSafely = async (
	options: ContentEntrypointShellOptions,
	url: string,
): Promise<void> => {
	try {
		await options.remove();
	} catch (error) {
		options.onError?.(error, "remove", url);
	}
};

export const createContentEntrypointShell = (
	options: ContentEntrypointShellOptions,
) => {
	return async (ctx: ContentScriptContext): Promise<void> => {
		let currentUrl = "";
		let activeController: AbortController | null = null;
		let reconciliationQueue = Promise.resolve();

		const reconcile = (
			url: string,
			removeBeforeReconcile = false,
		): Promise<void> => {
			activeController?.abort();
			const controller = new AbortController();
			activeController = controller;
			currentUrl = url;

			const isCurrent = () => currentUrl === url && !controller.signal.aborted;
			const run = async (): Promise<void> => {
				if (!isCurrent()) return;

				if (removeBeforeReconcile) {
					await removeSafely(options, url);
					if (!isCurrent()) return;
				}

				let phase: "load-public-options" | "evaluate" | "mount" | "remove" =
					"load-public-options";
				try {
					const publicOptions = await getPublicOptionsSnapshot();
					if (!isCurrent()) return;
					logger.configure({
						enabled: publicOptions.debugLogging || import.meta.env.DEV,
					});

					const shellContext: ContentEntrypointShellContext = {
						ctx,
						url,
						publicOptions,
						signal: controller.signal,
						isCurrent,
					};

					phase = "evaluate";
					const eligible = await options.isEligible(shellContext);
					if (!isCurrent()) return;

					if (!eligible) {
						phase = "remove";
						await options.remove();
						return;
					}

					await awaitBackgroundReady();
					if (!isCurrent()) return;

					phase = "mount";
					await options.mount(shellContext);
					if (!isCurrent()) {
						phase = "remove";
						await options.remove();
					}
				} catch (error) {
					if (controller.signal.aborted || isAbortError(error)) {
						return;
					}
					options.onError?.(error, phase, url);
					if (phase !== "remove") {
						try {
							await options.remove();
						} catch {
							// Ignore secondary errors during cleanup
						}
					}
				}
			};

			const pending = reconciliationQueue.then(run, run);
			reconciliationQueue = pending;
			return pending;
		};

		await reconcile(location.href);

		type LocationChangeEvent = Event & { newUrl?: URL };

		ctx.addEventListener(
			globalThis.window,
			"wxt:locationchange",
			(event: Event) => {
				const locationChangeEvent = event as LocationChangeEvent;
				const nextUrl = locationChangeEvent.newUrl?.href ?? location.href;
				void reconcile(nextUrl);
			},
		);

		ctx.addEventListener(globalThis.window, "pageshow", (event: Event) => {
			if ((event as PageTransitionEvent).persisted !== true) return;
			void reconcile(location.href, true);
		});

		const onStorageChanged: Parameters<
			typeof browser.storage.onChanged.addListener
		>[0] = (changes, areaName) => {
			if (areaName !== "local") return;
			if (!changes[PUBLIC_OPTIONS_CHANGE_KEY]) return;
			void reconcile(location.href);
		};

		browser.storage.onChanged.addListener(onStorageChanged);

		ctx.onInvalidated(() => {
			activeController?.abort();
			browser.storage.onChanged.removeListener(onStorageChanged);
			void removeSafely(options, location.href);
		});
	};
};
