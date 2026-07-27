/** Tests for public HTTP provider URL warning detection. */
/* eslint-disable unicorn/prefer-https */

import { describe, expect, it } from "vitest";
import { isPublicHttpProviderUrl } from "./insecure-url";

describe("isPublicHttpProviderUrl", () => {
	it.each([
		"https://arr.example",
		" https://192.168.1.10:8989 ",
		"http://localhost:8989",
		"http://127.0.0.1:7878",
		"http://127.0.0.2:7878",
		"http://[::1]:5055",
		"http://10.0.0.2:8989",
		"http://172.16.0.2:8989",
		"http://172.31.255.254:8989",
		"http://192.168.1.10:8989",
		"http://169.254.1.10:8989",
		"http://sonarr:8989",
		"http://nas.local:8989",
		"http://media.lan:8989",
		"http://[fd00::1]:8989",
		"http://[fe80::1]:8989",
		"http://",
	])("does not warn for %s", (url) => {
		expect(isPublicHttpProviderUrl(url)).toBe(false);
	});

	it.each([
		"http://arr.example",
		"http://fd.example",
		"http://172.32.0.1",
		"http://8.8.8.8",
		"http://[2001:4860:4860::8888]",
	])("warns for %s", (url) => {
		expect(isPublicHttpProviderUrl(url)).toBe(true);
	});
});
