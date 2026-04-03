/** Media modal open/close state and payload ownership for AniList-driven modal launches. */
// src/features/media-modal/hooks/use-media-modal-state.ts

import { useCallback, useState } from "react";

import type { AniListMediaHint } from "@/shared/schemas/anilist/anilist-media.schema";

export type MediaModalTabId = "series" | "mapping";

export type OpenMediaModalInput = {
  anilistId: number;
  title: string;
  initialTab?: MediaModalTabId;
  initialMappingRequired?: boolean;
  metadata: AniListMediaHint | null;
};

export type MediaModalState = {
  isOpen: boolean;
  anilistId: number;
  title: string;
  initialTab?: MediaModalTabId;
  initialMappingRequired?: boolean;
  metadata: AniListMediaHint | null;
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
      ...(input.initialMappingRequired !== undefined ? { initialMappingRequired: input.initialMappingRequired } : {}),
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
