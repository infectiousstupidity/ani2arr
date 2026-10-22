/** Tests for options-page hash routing flags. */
// src/options-page/navigation.test.ts

import { describe, expect, it } from "vitest";
import { hasHashFlag } from "./navigation";

describe("hasHashFlag", () => {
	it("reads explicit recovery flags without changing the page route", () => {
		expect(hasHashFlag("#seerr?enableCsrf=1", "enableCsrf")).toBe(true);
		expect(hasHashFlag("#seerr?enableCsrf=0", "enableCsrf")).toBe(false);
		expect(hasHashFlag("#seerr", "enableCsrf")).toBe(false);
	});
});
