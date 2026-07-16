/** Tests for user-facing messages from serialized extension errors. */
// src/shared/errors/error-utils.test.ts

import { describe, expect, it } from "vitest";
import { createError, getUserErrorMessage } from "./error-utils";
import { ErrorCode } from "./error.types";

describe("getUserErrorMessage", () => {
	it("uses the stable user message from serialized extension errors", () => {
		const error = createError(
			ErrorCode.SEERR_ACCOUNT_CHANGED,
			"Account ID changed.",
			"Confirm the current Seerr account.",
		);

		expect(getUserErrorMessage(error, "Fallback")).toBe(
			"Confirm the current Seerr account.",
		);
	});

	it("falls back through native errors, strings, and unknown values", () => {
		expect(getUserErrorMessage(new Error("Native failure"), "Fallback")).toBe(
			"Native failure",
		);
		expect(getUserErrorMessage("String failure", "Fallback")).toBe(
			"String failure",
		);
		expect(getUserErrorMessage(null, "Fallback")).toBe("Fallback");
	});
});
