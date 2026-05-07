/** Pure validation and normalization for provider connection credentials. */
// src/providers/settings/provider-connection.validation.ts

export type ProviderConnectionResult<T> =
	| { ok: true; value: T }
	| { ok: false; error: string };

export type NormalizedProviderConnectionUrl = {
	normalizedUrl: string;
	origin: string;
};

function fail<T>(error: string): ProviderConnectionResult<T> {
	return { ok: false, error };
}

function trimTrailingSlashes(pathname: string): string {
	return pathname.replace(/\/+$/, "");
}

export function normalizeProviderConnectionUrl(
	input: string,
): ProviderConnectionResult<NormalizedProviderConnectionUrl> {
	const raw = input.trim();
	if (!raw) {
		return fail("URL cannot be empty.");
	}

	let parsed: URL;
	try {
		parsed = new URL(raw);
	} catch {
		return fail("Invalid URL format.");
	}

	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		return fail("URL must use http or https.");
	}

	if (parsed.username || parsed.password) {
		return fail("Credentials in URL are not supported.");
	}

	if (parsed.search || parsed.hash) {
		return fail("URL must not include query parameters or fragments.");
	}

	if (parsed.port) {
		const port = Number.parseInt(parsed.port, 10);
		if (!Number.isInteger(port) || port < 1 || port > 65_535) {
			return fail("Invalid port.");
		}
	}

	return {
		ok: true,
		value: {
			normalizedUrl: `${parsed.origin}${trimTrailingSlashes(parsed.pathname)}`,
			origin: parsed.origin,
		},
	};
}

export function validateProviderConnectionUrl(
	input: string,
): ProviderConnectionResult<string> {
	const result = normalizeProviderConnectionUrl(input);
	return result.ok ? { ok: true, value: result.value.normalizedUrl } : result;
}

export function validateProviderConnectionApiKey(
	input: string,
): ProviderConnectionResult<string> {
	const trimmed = input.trim();
	if (!trimmed) {
		return fail("API key cannot be empty.");
	}

	return { ok: true, value: trimmed };
}

export function getProviderConnectionScope(
	credentials?: { url: string; apiKey?: string } | null,
): string {
	const rawUrl = credentials?.url?.trim();
	if (!rawUrl) return "configured";

	const normalizedUrl = validateProviderConnectionUrl(rawUrl);
	return normalizedUrl.ok ? normalizedUrl.value : rawUrl;
}
