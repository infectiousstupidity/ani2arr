/** Tests for Seerr session/API-key transport, identity checks, and auth errors. */
// src/providers/seerr/client.test.ts

import { afterEach, describe, expect, it, vi } from "vitest";
import { parseTmdbId } from "@/providers/schemas";
import type { SeerrConnection } from "./types";
import { ErrorCode } from "@/shared/errors/error.types";
import { SeerrClient } from "./client";

const apiKeyConnection: SeerrConnection = {
	url: "https://seerr.example",
	auth: { mode: "apiKey", apiKey: "secret" },
};

const sessionConnection: SeerrConnection = {
	url: "https://seerr.example",
	auth: { mode: "session" },
	account: {
		id: 1,
		displayName: "Alice",
	},
};

function createClient(hasUrlPermission = true): SeerrClient {
	return new SeerrClient({
		hasUrlPermission: async () => hasUrlPermission,
	});
}

function createAccountResponse(
	account?: { id: number; displayName: string },
): Response {
	const value = account ?? {
		id: 1,
		displayName: "Alice",
	};
	return Response.json({
		...value,
		email: "private@example.com",
		permissions: 1024,
		avatar: "/avatar.png",
	});
}

function createErrorResponse(
	message: string,
	status = 403,
	statusText = "Forbidden",
): Response {
	return Response.json({ message }, {
		status,
		statusText,
		headers: { "Content-Type": "application/json" },
	});
}

describe("SeerrClient", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("checks session auth with browser credentials and no API-key header", async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(createAccountResponse());
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			createClient().getCurrentUser(sessionConnection),
		).resolves.toEqual({
			id: 1,
			displayName: "Alice",
			avatar: "/avatar.png",
		});

		expect(fetchMock.mock.calls[0]?.[0]).toBe(
			"https://seerr.example/api/v1/auth/me",
		);
		const request = fetchMock.mock.calls[0]?.[1];
		expect(request?.credentials).toBe("include");
		expect(request?.referrerPolicy).toBe("no-referrer");
		expect((request?.headers as Headers).has("X-Api-Key")).toBe(false);
	});

	it("keeps advanced API-key auth isolated from browser credentials", async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(createAccountResponse());
		vi.stubGlobal("fetch", fetchMock);

		await createClient().getCurrentUser(apiKeyConnection);

		const request = fetchMock.mock.calls[0]?.[1];
		expect(request?.credentials).toBe("omit");
		expect((request?.headers as Headers).get("X-Api-Key")).toBe("secret");
	});

	it("preflights session identity before creating a request", async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(createAccountResponse())
			.mockResolvedValueOnce(Response.json({ id: 10, status: 1 }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			createClient().requestMedia(
				{ mediaType: "movie", mediaId: parseTmdbId(123) },
				sessionConnection,
			),
		).resolves.toEqual({ id: 10, status: 1 });

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(fetchMock.mock.calls[0]?.[0]).toBe(
			"https://seerr.example/api/v1/auth/me",
		);
		expect(fetchMock.mock.calls[1]?.[0]).toBe(
			"https://seerr.example/api/v1/request",
		);
		const request = fetchMock.mock.calls[1]?.[1];
		expect(request?.method).toBe("POST");
		expect(request?.credentials).toBe("include");
		expect((request?.headers as Headers).has("X-Api-Key")).toBe(false);
		expect(request?.body).toBe('{"mediaType":"movie","mediaId":123}');
	});

	it("does not add an identity preflight to API-key requests", async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(Response.json({ id: 10, status: 1 }));
		vi.stubGlobal("fetch", fetchMock);

		await createClient().requestMedia(
			{ mediaType: "movie", mediaId: parseTmdbId(123) },
			apiKeyConnection,
		);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0]?.[0]).toBe(
			"https://seerr.example/api/v1/request",
		);
	});

	it("maps auth/me 403 to a stable session-auth error", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn<typeof fetch>()
				.mockResolvedValueOnce(createErrorResponse("No permission")),
		);

		await expect(
			createClient().getCurrentUser(sessionConnection),
		).rejects.toMatchObject({
			code: ErrorCode.SEERR_AUTH_REQUIRED,
			userMessage:
				"You are not signed into this Seerr server. Open Seerr, sign in, then check again.",
		});
	});

	it("blocks account changes before the request POST", async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				createAccountResponse({ id: 2, displayName: "Bob" }),
			);
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			createClient().requestMedia(
				{ mediaType: "movie", mediaId: parseTmdbId(123) },
				sessionConnection,
			),
		).rejects.toMatchObject({
			code: ErrorCode.SEERR_ACCOUNT_CHANGED,
			userMessage:
				"The Seerr account changed from Alice to Bob. Re-check this account in ani2arr options before requesting.",
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("blocks expired sessions before the request POST", async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(createErrorResponse("Please sign in."));
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			createClient().requestMedia(
				{ mediaType: "movie", mediaId: parseTmdbId(123) },
				sessionConnection,
			),
		).rejects.toMatchObject({
			code: ErrorCode.SEERR_AUTH_REQUIRED,
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("preserves quota errors when the session remains valid", async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(createAccountResponse())
			.mockResolvedValueOnce(createErrorResponse("Movie Quota exceeded."))
			.mockResolvedValueOnce(createAccountResponse());
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			createClient().requestMedia(
				{ mediaType: "movie", mediaId: parseTmdbId(123) },
				sessionConnection,
			),
		).rejects.toMatchObject({
			code: ErrorCode.SEERR_QUOTA_EXCEEDED,
			userMessage: "Seerr rejected the request: Movie Quota exceeded.",
		});
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});

	it("preserves permission errors when the session remains valid", async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(createAccountResponse())
			.mockResolvedValueOnce(
				createErrorResponse(
					"You do not have permission to make movie requests.",
				),
			)
			.mockResolvedValueOnce(createAccountResponse());
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			createClient().requestMedia(
				{ mediaType: "movie", mediaId: parseTmdbId(123) },
				sessionConnection,
			),
		).rejects.toMatchObject({
			code: ErrorCode.SEERR_PERMISSION_DENIED,
			userMessage:
				"Seerr rejected the request: You do not have permission to make movie requests.",
		});
	});

	it("detects CSRF rejection without requesting cookie permission", async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(createAccountResponse())
			.mockResolvedValueOnce(createErrorResponse("invalid csrf token"))
			.mockResolvedValueOnce(createAccountResponse());
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			createClient().requestMedia(
				{ mediaType: "movie", mediaId: parseTmdbId(123) },
				sessionConnection,
			),
		).rejects.toMatchObject({
			code: ErrorCode.SEERR_CSRF_REQUIRED,
		});
	});

	it("translates passive read expiry into auth-required state", async () => {
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(createErrorResponse("Forbidden"))
			.mockResolvedValueOnce(createErrorResponse("Please sign in."));
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			createClient().getMediaStatus(
				{ mediaType: "movie", tmdbId: parseTmdbId(123) },
				sessionConnection,
			),
		).rejects.toMatchObject({
			code: ErrorCode.SEERR_AUTH_REQUIRED,
		});
	});

	it("fails before fetch when host permission is missing", async () => {
		const fetchMock = vi.fn<typeof fetch>();
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			createClient(false).getCurrentUser(sessionConnection),
		).rejects.toMatchObject({
			code: ErrorCode.PERMISSION_ERROR,
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("keeps provider error bodies bounded and redacted", async () => {
		const message = `Bad ${apiKeyConnection.url} key secret ${"x".repeat(5000)}`;
		vi.stubGlobal(
			"fetch",
			vi
				.fn<typeof fetch>()
				.mockResolvedValueOnce(createErrorResponse(message, 500, "Error")),
		);

		await expect(
			createClient().getCurrentUser(apiKeyConnection),
		).rejects.toSatisfy((error: unknown) => {
			const value = error as {
				userMessage: string;
				details: { providerMessage: string };
			};
			return (
				!value.userMessage.includes("secret") &&
				!value.userMessage.includes(apiKeyConnection.url) &&
				value.details.providerMessage.length <= 240
			);
		});
	});

	it("preserves the 15-second timeout for session transport", async () => {
		vi.useFakeTimers();
		const fetchMock = vi.fn<typeof fetch>().mockImplementation(
			(_input, init) =>
				new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener("abort", () => {
						reject(new DOMException("Aborted", "AbortError"));
					});
				}),
		);
		vi.stubGlobal("fetch", fetchMock);

		const request = createClient().getCurrentUser(sessionConnection);
		const rejection = expect(request).rejects.toMatchObject({
			code: ErrorCode.SEERR_SESSION_UNAVAILABLE,
			message: "Seerr session request timed out.",
		});
		await vi.advanceTimersByTimeAsync(15_000);

		await rejection;
	});

	it("reads status, search results, and base-path-safe endpoints", async () => {
		const basePathConnection: SeerrConnection = {
			...apiKeyConnection,
			url: "https://seerr.example/base",
		};
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				Response.json({ mediaInfo: { status: 5 } }),
			)
			.mockResolvedValueOnce(
				Response.json({
					results: [{ id: 456, mediaType: "movie", title: "Movie" }],
				}),
			);
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			createClient().getMediaStatus(
				{ mediaType: "movie", tmdbId: parseTmdbId(123) },
				basePathConnection,
			),
		).resolves.toBe("available");
		await expect(
			createClient().searchMedia("one piece", basePathConnection),
		).resolves.toEqual([
			{
				mediaType: "movie",
				tmdbId: parseTmdbId(456),
				title: "Movie",
			},
		]);

		expect(fetchMock.mock.calls[0]?.[0]).toBe(
			"https://seerr.example/base/api/v1/movie/123",
		);
		expect(fetchMock.mock.calls[1]?.[0]).toBe(
			"https://seerr.example/base/api/v1/search?query=one%20piece",
		);
	});
});
