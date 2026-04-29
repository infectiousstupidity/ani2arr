/** Canonical pure validation and normalization for provider connection credentials. */
// src/providers/settings/provider-connection.schema.ts

import * as v from "valibot";

export type ProviderConnectionResult<T> =
	| { ok: true; value: T }
	| { ok: false; error: string };

const NonEmptyUrlSchema = v.pipe(
	v.string(),
	v.nonEmpty("URL cannot be empty."),
);

const ApiKeySchema = v.pipe(v.string(), v.nonEmpty("API key cannot be empty."));

function normalizePathname(pathname: string): string {
	return pathname.replace(/\/+$/, "");
}

export function normalizeProviderConnectionUrl(
	input: string,
): ProviderConnectionResult<{ normalizedUrl: string; url: URL }> {
	const raw = input.trim();
	const parsedResult = v.safeParse(NonEmptyUrlSchema, raw);
	if (!parsedResult.success) {
		const first = parsedResult.issues?.[0];
		return {
			ok: false,
			error: (first && String(first.message)) || "URL cannot be empty.",
		};
	}

	let parsed: URL;
	try {
		parsed = new URL(raw);
	} catch {
		return { ok: false, error: "Invalid URL format." };
	}

	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		return { ok: false, error: "URL must use http or https." };
	}

	if (parsed.username || parsed.password) {
		return { ok: false, error: "Credentials in URL are not supported." };
	}

	if (parsed.port) {
		const port = Number.parseInt(parsed.port, 10);
		if (!Number.isFinite(port) || port < 1 || port > 65_535) {
			return { ok: false, error: "Invalid port." };
		}
	}

	const normalizedPath = normalizePathname(parsed.pathname);

	return {
		ok: true,
		value: {
			normalizedUrl: `${parsed.origin}${normalizedPath}`,
			url: parsed,
		},
	};
}

export function validateProviderConnectionUrl(
	input: string,
): ProviderConnectionResult<string> {
	const result = normalizeProviderConnectionUrl(input);
	if (!result.ok) {
		return result;
	}

	return { ok: true, value: result.value.normalizedUrl };
}

export function validateProviderConnectionApiKey(
	input: string,
): ProviderConnectionResult<string> {
	const trimmed = input.trim();
	const parsed = v.safeParse(ApiKeySchema, trimmed);

	if (!parsed.success) {
		const first = parsed.issues?.[0];
		return {
			ok: false,
			error: (first && String(first.message)) || "Invalid API key.",
		};
	}

	return { ok: true, value: trimmed };
}
