// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { createDefaultExtensionOptions } from "@/settings/schema";
import { SeerrConnectionForm } from "./seerr-connection-form";

const useExtensionOptionsMock = vi.hoisted(() => vi.fn());

vi.mock("@/queries/options", () => ({
	useExtensionOptions: useExtensionOptionsMock,
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
	.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
	if (root) {
		await act(async () => root?.unmount());
	}
	container?.remove();
	root = null;
	container = null;
});

function setInputValue(input: HTMLInputElement, value: string): void {
	const valueSetter = Object.getOwnPropertyDescriptor(
		HTMLInputElement.prototype,
		"value",
	)?.set;
	if (!valueSetter) throw new Error("HTML input value setter is unavailable.");

	valueSetter.call(input, value);
	input.dispatchEvent(new Event("input", { bubbles: true }));
}

it("routes the single form by the selected connection method and resets its draft", async () => {
	useExtensionOptionsMock.mockReturnValue({
		data: createDefaultExtensionOptions(),
	});
	const onCheckSession = vi.fn(async () => {});
	const onConnectApiKey = vi.fn(async () => {});
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);

	const mountForm = () => {
		root?.render(
			<SeerrConnectionForm
				failure={{
					message: "Session connection failed",
					code: null,
					scope: "session",
				}}
				isConnecting={false}
				isCsrfSupportEnabled={false}
				onCheckSession={onCheckSession}
				onConnectApiKey={onConnectApiKey}
				onEnableCsrfSupport={vi.fn(async () => {})}
				onOpenLogin={vi.fn(async () => {})}
				showCsrfSupport={false}
			/>,
		);
	};
	await act(mountForm);

	const forms = container.querySelectorAll("form");
	const form = forms.item(0);
	const sessionRadio = container.querySelector<HTMLInputElement>(
		'input[type="radio"][value="session"]',
	);
	const apiKeyRadio = container.querySelector<HTMLInputElement>(
		'input[type="radio"][value="apiKey"]',
	);
	if (!form || !sessionRadio || !apiKeyRadio) {
		throw new Error("Expected the Seerr connection form and method radios.");
	}

	expect(forms).toHaveLength(1);
	expect(sessionRadio.checked).toBe(true);
	expect(apiKeyRadio.checked).toBe(false);
	expect(container.textContent).toContain("Session connection failed");

	await act(async () => apiKeyRadio.click());

	expect(apiKeyRadio.checked).toBe(true);
	expect(container.textContent).not.toContain("Session connection failed");
	let urlInput = container.querySelector<HTMLInputElement>("#seerr-url");
	let apiKeyInput = container.querySelector<HTMLInputElement>("#seerr-api-key");
	if (!urlInput || !apiKeyInput) {
		throw new Error("Expected the API-key connection inputs.");
	}
	const apiKeyUrlInput = urlInput;
	const currentApiKeyInput = apiKeyInput;

	await act(async () => {
		setInputValue(apiKeyUrlInput, "https://seerr.example");
		setInputValue(currentApiKeyInput, "secret");
	});
	await act(async () => form.requestSubmit());

	expect(onConnectApiKey).toHaveBeenCalledWith(
		"https://seerr.example",
		"secret",
	);
	expect(onCheckSession).not.toHaveBeenCalled();

	const cancelButton = [...container.querySelectorAll("button")].find(
		(button) => button.textContent?.trim() === "Cancel",
	);
	if (!cancelButton) throw new Error("Expected the Cancel button.");
	await act(async () => cancelButton.click());

	expect(sessionRadio.checked).toBe(true);
	urlInput = container.querySelector<HTMLInputElement>("#seerr-url");
	if (!urlInput) throw new Error("Expected the session URL input.");
	expect(urlInput.value).toBe("");

	await act(async () => apiKeyRadio.click());
	apiKeyInput = container.querySelector<HTMLInputElement>("#seerr-api-key");
	if (!apiKeyInput) throw new Error("Expected the reset API-key input.");
	expect(apiKeyInput.value).toBe("");
	expect(
		[...container.querySelectorAll("button")].some(
			(button) => button.textContent?.trim() === "Cancel",
		),
	).toBe(false);
	await act(async () => sessionRadio.click());

	urlInput = container.querySelector<HTMLInputElement>("#seerr-url");
	if (!urlInput) throw new Error("Expected the session URL input.");
	await act(async () => setInputValue(urlInput, "https://seerr.example"));
	await act(async () => form.requestSubmit());

	expect(onCheckSession).toHaveBeenCalledWith("https://seerr.example");
	expect(onConnectApiKey).toHaveBeenCalledTimes(1);
});
