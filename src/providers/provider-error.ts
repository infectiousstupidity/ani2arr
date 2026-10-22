/** Bounded provider error-body parsing and sensitive-value redaction. */
// src/providers/provider-error.ts

const ERROR_BODY_LIMIT = 4000;
const ERROR_MESSAGE_LIMIT = 240;
const ERROR_MESSAGE_KEYS = [
	"errorMessage",
	"message",
	"error",
	"title",
	"detail",
] as const;

interface ProviderErrorSecrets {
	url: string;
	apiKey?: string;
}

export async function readProviderErrorMessage(
	response: Response,
	secrets: ProviderErrorSecrets,
): Promise<string | null> {
	let body: string;
	try {
		const text = await response.text();
		body = text.slice(0, ERROR_BODY_LIMIT);
	} catch {
		return null;
	}

	const parsed = parseProviderErrorBody(body);
	const rawMessage = findProviderErrorMessage(parsed ?? body);

	return rawMessage && sanitizeProviderErrorMessage(rawMessage, secrets);
}

function parseProviderErrorBody(body: string): unknown | null {
	try {
		return JSON.parse(body) as unknown;
	} catch {
		return null;
	}
}

function findProviderErrorMessage(value: unknown, depth = 0): string | null {
	if (depth > 3 || value === null || value === undefined) return null;

	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed || null;
	}

	if (Array.isArray(value)) {
		for (const item of value) {
			const message = findProviderErrorMessage(item, depth + 1);
			if (message) return message;
		}
		return null;
	}

	if (typeof value !== "object") return null;

	const record = value as Record<string, unknown>;
	for (const key of ERROR_MESSAGE_KEYS) {
		const message = findProviderErrorMessage(record[key], depth + 1);
		if (message) return message;
	}

	return findProviderErrorMessage(record.errors, depth + 1);
}

function sanitizeProviderErrorMessage(
	message: string,
	secrets: ProviderErrorSecrets,
): string | null {
	let sanitized = message;
	const apiKey = secrets.apiKey?.trim();
	const baseUrl = secrets.url.trim();

	sanitized = sanitized
		.replaceAll(/https?:\/\/\S+/gi, "[redacted url]")
		.replaceAll(/[\da-f]{32,}/gi, "[redacted]");

	if (apiKey) sanitized = sanitized.replaceAll(apiKey, "[redacted]");
	if (baseUrl) sanitized = sanitized.replaceAll(baseUrl, "[redacted url]");

	sanitized = [...sanitized]
		.map((character) => {
			const code = character.codePointAt(0) ?? 0;
			return code < 32 || code === 127 ? " " : character;
		})
		.join("")
		.replaceAll(/\s+/g, " ")
		.trim();

	if (!sanitized) return null;
	return sanitized.length > ERROR_MESSAGE_LIMIT
		? `${sanitized.slice(0, ERROR_MESSAGE_LIMIT - 3)}...`
		: sanitized;
}
