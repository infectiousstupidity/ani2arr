/** Owns the read-only ambient environment shared across the media modal subtree. */
// src/features/media-modal/context.tsx

import { createContext, useContext, type ReactNode } from "react";
import type { Provider } from "@/providers";
import { getProviderLabel } from "@/providers/provider-labels";

type MediaModalContextValue = {
  provider: Provider;
  baseUrl: string;
  contentContainer: HTMLDivElement | null;
};

const MediaModalContext = createContext<MediaModalContextValue | null>(null);

export function MediaModalProvider(props: {
  value: MediaModalContextValue;
  children?: ReactNode;
}): React.JSX.Element {
  const { value, children } = props;
  return (
    <MediaModalContext.Provider value={value}>
      {children}
    </MediaModalContext.Provider>
  );
}

export function useMediaModalContext() {
  const value = useContext(MediaModalContext);
  if (!value) {
    throw new Error("useMediaModalContext must be used within MediaModalProvider");
  }

  return {
    ...value,
    providerLabel: getProviderLabel(value.provider),
  };
}
