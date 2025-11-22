// src/features/media-modal/hooks/use-media-modal-state.ts
import { useCallback, useState } from "react";

import type { MediaMetadataHint } from "@/shared/types";

export type MediaModalTabId = "series" | "mapping";

export type OpenMediaModalInput = {
  anilistId: number;
  title: string;
  initialTab?: MediaModalTabId;
  metadata: MediaMetadataHint | null;
};

export type MediaModalState = {
  isOpen: boolean;
  anilistId: number;
  title: string;
  initialTab?: MediaModalTabId;
  metadata: MediaMetadataHint | null;
} | null;

export interface UseMediaModalStateResult {
  state: MediaModalState;
  open(input: OpenMediaModalInput): void;
  close(): void;
  reset(): void;
}

export function useMediaModalState(): UseMediaModalStateResult {
  const [state, setState] = useState<MediaModalState>(null);

  const open = useCallback((input: OpenMediaModalInput) => {
    setState({
      isOpen: true,
      anilistId: input.anilistId,
      title: input.title,
      ...(input.initialTab !== undefined ? { initialTab: input.initialTab } : {}),
      metadata: input.metadata,
    });
  }, []);

  const close = useCallback(() => {
    setState(current => (current ? { ...current, isOpen: false } : current));
  }, []);

  const reset = useCallback(() => {
    setState(null);
  }, []);

  return { state, open, close, reset };
}
