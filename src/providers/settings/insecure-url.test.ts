/** Tests for public HTTP provider URL warning detection. */
// src/providers/settings/insecure-url.test.ts

/* eslint-disable unicorn/prefer-https */

import { describe, expect, it } from "vitest";
import { isPublicHttpProviderUrl } from "./insecure-url";

describe("isPublicHttpProviderUrl", () => {
	it("does not warn for HTTPS URLs", () => {
		expect(isPublicHttpProviderUrl("https://arr.example")).toBe(false);
		expect(isPublicHttpProviderUrl(" https://192.168.1.10:8989 ")).toBe(false);
	});

	it("does not warn for local HTTP loopback URLs", () => {
		expect(isPublicHttpProviderUrl("http://localhost:8989")).toBe(false);
		expect(isPublicHttpProviderUrl("http://127.0.0.1:7878")).toBe(false);
		expect(isPublicHttpProviderUrl("http://127.0.0.2:7878")).toBe(false);
		expect(isPublicHttpProviderUrl("http://[::1]:5055")).toBe(false);
	});

	it("does not warn for private IPv4 HTTP URLs", () => {
		expect(isPublicHttpProviderUrl("http://10.0.0.2:8989")).toBe(false);
		expect(isPublicHttpProviderUrl("http://172.16.0.2:8989")).toBe(false);
		expect(isPublicHttpProviderUrl("http://172.31.255.254:8989")).toBe(false);
		expect(isPublicHttpProviderUrl("http://192.168.1.10:8989")).toBe(false);
		expect(isPublicHttpProviderUrl("http://169.254.1.10:8989")).toBe(false);
	});

	it("does not warn for local HTTP hostnames and IPv6 ranges", () => {
		expect(isPublicHttpProviderUrl("http://sonarr:8989")).toBe(false);
		expect(isPublicHttpProviderUrl("http://nas.local:8989")).toBe(false);
		expect(isPublicHttpProviderUrl("http://media.lan:8989")).toBe(false);
		expect(isPublicHttpProviderUrl("http://[fd00::1]:8989")).toBe(false);
		expect(isPublicHttpProviderUrl("http://[fe80::1]:8989")).toBe(false);
	});

	it("warns for public HTTP URLs", () => {
		expect(isPublicHttpProviderUrl("http://arr.example")).toBe(true);
		expect(isPublicHttpProviderUrl("http://fd.example")).toBe(true);
		expect(isPublicHttpProviderUrl("http://172.32.0.1")).toBe(true);
		expect(isPublicHttpProviderUrl("http://8.8.8.8")).toBe(true);
		expect(isPublicHttpProviderUrl("http://[2001:4860:4860::8888]")).toBe(true);
	});

	it("does not throw or warn while input is incomplete", () => {
		expect(isPublicHttpProviderUrl("")).toBe(false);
		expect(isPublicHttpProviderUrl("http://")).toBe(false);
		expect(isPublicHttpProviderUrl("not a url")).toBe(false);
	});
});
