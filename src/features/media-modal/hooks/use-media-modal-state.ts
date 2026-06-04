/** Media modal open/close state ownership for modal launches. */
// src/features/media-modal/hooks/use-media-modal-state.ts

import { useCallback, useState } from "react";
import type { MediaModalOpenState, MediaModalState } from "../types";

export interface UseMediaModalStateResult {
	state: MediaModalState;
	open(input: MediaModalOpenState): void;
	close(): void;
}

export function useMediaModalState(): UseMediaModalStateResult {
	const [state, setState] = useState<MediaModalState>(null);

	const open = useCallback((input: MediaModalOpenState): void => {
		setState(input);
	}, []);

	const close = useCallback((): void => {
		setState(null);
	}, []);

	return { state, open, close };
}
