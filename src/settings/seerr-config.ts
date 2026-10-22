/** Pure helpers for Seerr connection normalization and configured state. */
// src/settings/seerr-config.ts

import { getProviderHostPermissionPattern } from "@/providers/settings/host-permissions";
import {
	validateProviderConnectionApiKey,
	validateProviderConnectionUrl,
} from "@/providers/settings/provider-connection.validation";
import type {
	SeerrAccountSummary,
	SeerrConnection,
} from "@/providers/seerr/types";
import { createDefaultSeerrConnection } from "./schema";
import type { ExtensionOptions } from "./types";

type NormalizedSeerrSessionConnection = {
	url: string;
	auth: { mode: "session" };
	account: SeerrAccountSummary;
	permissionPattern: string;
};

type NormalizedSeerrApiKeyConnection = {
	url: string;
	auth: { mode: "apiKey"; apiKey: string };
	permissionPattern: string;
};

export type NormalizedSeerrConnection =
	| NormalizedSeerrSessionConnection
	| NormalizedSeerrApiKeyConnection;

export function getSeerrConnectionDraft(
	settings: ExtensionOptions | undefined,
): SeerrConnection {
	const connection = settings?.seerr ?? createDefaultSeerrConnection();
	return {
		...connection,
		url: String(connection.url ?? "").trim(),
		auth:
			connection.auth.mode === "apiKey"
				? {
						mode: "apiKey",
						apiKey: String(connection.auth.apiKey ?? "").trim(),
					}
				: { mode: "session" },
	};
}

function normalizeAccount(
	account: SeerrAccountSummary | undefined,
): SeerrAccountSummary | undefined {
	if (
		!account ||
		!Number.isInteger(account.id) ||
		account.id < 1 ||
		!account.displayName.trim()
	) {
		return undefined;
	}

	const avatar = account.avatar?.trim();
	return {
		id: account.id,
		displayName: account.displayName.trim(),
		...(avatar ? { avatar } : {}),
	};
}

export function normalizeSeerrUrlInput(
	input: string | undefined,
): { url: string; permissionPattern: string } | null {
	const url = String(input ?? "").trim();
	if (!url) return null;

	const normalizedUrl = validateProviderConnectionUrl(url);
	if (!normalizedUrl.ok) {
		throw new Error("Please enter a valid Seerr URL.");
	}

	const permissionPattern = getProviderHostPermissionPattern(
		normalizedUrl.value,
	);
	if (!permissionPattern.ok) {
		throw new Error("Failed to update Seerr host permissions. Please try again.");
	}

	return {
		url: normalizedUrl.value,
		permissionPattern: permissionPattern.value,
	};
}

export function normalizeSeerrConnectionInput(
	input: SeerrConnection | undefined,
): NormalizedSeerrConnection | null {
	const normalizedUrl = normalizeSeerrUrlInput(input?.url);
	if (!normalizedUrl) return null;

	if (input?.auth.mode === "session") {
		const account = normalizeAccount(input.account);
		if (!account) {
			throw new Error("Verify the Seerr browser session before saving it.");
		}

		return {
			url: normalizedUrl.url,
			auth: { mode: "session" },
			account,
			permissionPattern: normalizedUrl.permissionPattern,
		};
	}

	const normalizedApiKey = validateProviderConnectionApiKey(
		input?.auth.apiKey ?? "",
	);
	if (!normalizedApiKey.ok) {
		throw new Error("Please enter a valid Seerr URL and API key.");
	}

	return {
		url: normalizedUrl.url,
		auth: {
			mode: "apiKey",
			apiKey: normalizedApiKey.value,
		},
		permissionPattern: normalizedUrl.permissionPattern,
	};
}

export function normalizeSeerrApiKeyConnectionInput(input: {
	url: string;
	apiKey: string;
}): NormalizedSeerrApiKeyConnection {
	const normalized = normalizeSeerrConnectionInput({
		url: input.url,
		auth: {
			mode: "apiKey",
			apiKey: input.apiKey,
		},
	});
	if (!normalized) {
		throw new Error("Please enter a valid Seerr URL and API key.");
	}
	if (normalized.auth.mode !== "apiKey") {
		throw new Error("Please enter a valid Seerr URL and API key.");
	}
	return {
		url: normalized.url,
		auth: {
			mode: "apiKey",
			apiKey: normalized.auth.apiKey,
		},
		permissionPattern: normalized.permissionPattern,
	};
}

export function normalizeSeerrConnectionSettings(
	settings: ExtensionOptions | undefined,
): NormalizedSeerrConnection | null {
	if (!settings) return null;
	try {
		return normalizeSeerrConnectionInput(getSeerrConnectionDraft(settings));
	} catch {
		return null;
	}
}

export function getSeerrConnection(
	settings: ExtensionOptions | undefined,
): SeerrConnection | null {
	const normalized = normalizeSeerrConnectionSettings(settings);
	if (!normalized) return null;
	return toSeerrConnection(normalized);
}

export function toSeerrConnection(
	normalized: NormalizedSeerrConnection,
): SeerrConnection {
	if ("account" in normalized) {
		return {
			url: normalized.url,
			auth: normalized.auth,
			account: normalized.account,
		};
	}
	return {
		url: normalized.url,
		auth: normalized.auth,
	};
}

export function hasConfiguredSeerrConnection(
	settings: ExtensionOptions | undefined,
): boolean {
	return getSeerrConnection(settings) !== null;
}

export function buildSeerrLoginUrl(input: string): string {
	const normalized = normalizeSeerrUrlInput(input);
	if (!normalized) throw new Error("Please enter a valid Seerr URL.");
	return `${normalized.url.replace(/\/+$/, "")}/login`;
}
