/** LEGACY: Re-exports old browse overlay state names while tests and callers move to media-action. */
// src/features/media-overlay/card-overlay-state.ts

export {
	getMediaActionStatus as getCardOverlayPrimaryStatus,
} from "@/features/media-action/state";
export type {
	MediaActionCommand as CardOverlayPrimaryAction,
	MediaActionState as CardOverlayPrimaryState,
	MediaActionStatus as CardOverlayPrimaryStatus,
} from "@/features/media-action/state";
