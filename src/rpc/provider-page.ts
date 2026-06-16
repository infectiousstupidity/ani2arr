/** Opens configured provider pages through background RPC without exposing provider URLs. */
// src/rpc/provider-page.ts

import { getAni2arrApi } from "@/rpc";
import type { OpenProviderPageInput, OpenSeerrPageInput } from "./types";

export function openProviderPage(input: OpenProviderPageInput): void {
	void getAni2arrApi()
		.openProviderPage(input)
		.catch(() => {});
}

export function openSeerrPage(input: OpenSeerrPageInput): void {
	void getAni2arrApi()
		.openSeerrPage(input)
		.catch(() => {});
}
