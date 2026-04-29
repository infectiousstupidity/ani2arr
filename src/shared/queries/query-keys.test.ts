import { describe, expect, it } from "vitest";
import { getProviderQueryScope } from "./query-keys";

describe("getProviderQueryScope", () => {
	it("uses normalized URL only and never leaks API keys", () => {
		const firstApiKey = "top-secret-key-one";
		const secondApiKey = "top-secret-key-two";

		const firstScope = getProviderQueryScope({
			url: "https://EXAMPLE.com:443/api///",
			apiKey: firstApiKey,
		});
		const secondScope = getProviderQueryScope({
			url: "https://example.com/api",
			apiKey: secondApiKey,
		});

		expect(firstScope).toBe("https://example.com/api");
		expect(secondScope).toBe(firstScope);

		const serializedScope = JSON.stringify(firstScope);
		expect(serializedScope).not.toContain(firstApiKey);
		expect(serializedScope).not.toContain(secondApiKey);
	});
});
