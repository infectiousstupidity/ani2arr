/** Owns small media-modal formatting helpers for mapping inspection UI. */
// src/features/media-modal/helpers.ts

export function formatToken(value: string): string {
	return value.replaceAll("-", " ").replaceAll("_", " ");
}
